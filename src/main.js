/**
 * Skool Reddit Research Actor  v2.0
 * ====================================
 * Scrapes Reddit za Skool community pain points.
 * Sve keywords editabilne iz Apify Input taba.
 * NEMA AI — čist keyword matching.
 *
 * Kako radi:
 *  1. Uzima keyword listu iz Input-a
 *  2. Pretražuje svaki keyword na svakom subredditu (old.reddit.com)
 *  3. Scoruje svaki post korisnikovim pain rečima
 *  4. Otvara visoko-scorirane postove, uzima pun tekst + komentare
 *  5. Izvlači VOC quote-ove (rečenice koje sadrže pain language)
 *  6. Čuva sve u Apify Dataset-u
 */

import { Actor, log } from 'apify';
import { PuppeteerCrawler, sleep } from 'crawlee';
import { scorePain, categorize, extractVocQuotes } from './scorer.js';

await Actor.init();

// ─── Učitaj Input ─────────────────────────────────────────────────────────────

const input = await Actor.getInput() ?? {};

const {
  searchKeywords    = ['skool community members not engaging'],
  extraKeywords     = [],
  subreddits        = ['skool', 'entrepreneur', 'onlinecourse', 'marketing'],
  painSignalWords   = ["can't", 'broken', 'manually', 'churn', 'ghost town'],
  maxPostsPerSearch = 15,
  minPainScore      = 20,
  timeFilter        = 'year',
  sortBy            = 'relevance',
  includeComments   = true,
  proxyConfig       = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
} = input;

// Spoji default + extra keywords, ukloni duplikate
const allKeywords = [...new Set([...searchKeywords, ...extraKeywords])];

log.info('=== Skool Reddit Research Actor v2.0 ===');
log.info(`Keywords: ${allKeywords.length} | Subreddits: ${subreddits.length}`);
log.info(`Pain words: ${painSignalWords.length} | Min score: ${minPainScore}`);
log.info(`Total searches: ${allKeywords.length * subreddits.length}`);

// ─── Crawler Setup ────────────────────────────────────────────────────────────

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
const seenPostIds = new Set(); // Deduplication

const crawler = new PuppeteerCrawler({
  proxyConfiguration,
  maxConcurrency:            2,
  requestHandlerTimeoutSecs: 90,
  maxRequestRetries:         3,

  launchContext: {
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,900',
        '--lang=en-US,en',
      ],
    },
  },

  async requestHandler({ page, request }) {
    const { type, keyword, subreddit } = request.userData;

    // Blokiraj slike/fontove/medije — brže i jeftinije (manje Apify CU)
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image', 'font', 'media', 'stylesheet'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // ── SEARCH STRANICA ───────────────────────────────────────────────────────
    if (type === 'search') {
      log.info(`Searching r/${subreddit}: "${keyword}"`);

      try {
        await page.waitForSelector('.search-result-link, .thing.link', { timeout: 20000 });
      } catch {
        log.warning(`Nema rezultata: r/${subreddit} | "${keyword}"`);
        return;
      }
      await sleep(500);

      const posts = await page.evaluate((maxP) => {
        const items = document.querySelectorAll('.search-result-link, .thing.link');
        const results = [];
        items.forEach((el, i) => {
          if (i >= maxP) return;
          const titleEl = el.querySelector('a.search-title, a.title');
          const scoreEl = el.querySelector('.search-score-word, .score');
          const commEl  = el.querySelector('.search-comments, .comments');
          const timeEl  = el.querySelector('time');
          const href    = titleEl?.getAttribute('href') ?? '';
          const match   = href.match(/comments\/([a-z0-9]+)\//i);
          if (!match || !titleEl) return;
          results.push({
            id:           match[1],
            title:        titleEl.textContent.trim(),
            score:        parseInt(scoreEl?.textContent?.replace(/\D/g, '') ?? '0') || 0,
            commentCount: parseInt(commEl?.textContent?.replace(/\D/g, '') ?? '0') || 0,
            href,
            timestamp:    timeEl?.getAttribute('datetime') ?? '',
          });
        });
        return results;
      }, maxPostsPerSearch);

      log.info(`  → ${posts.length} postova pronađeno`);

      for (const post of posts) {
        if (seenPostIds.has(post.id)) continue;
        seenPostIds.add(post.id);

        // Brzi score po naslovu — ako izgleda relevantno, otvori pun post
        const quickScore = scorePain(post.title, painSignalWords);
        if (quickScore.painScore >= minPainScore - 15) {
          const url = post.href.startsWith('http')
            ? post.href.replace('www.reddit.com', 'old.reddit.com')
            : `https://old.reddit.com${post.href}`;

          await Actor.addRequests([{
            url,
            userData: {
              type:         'post',
              postId:       post.id,
              title:        post.title,
              upvotes:      post.score,
              commentCount: post.commentCount,
              subreddit,
              keyword,
              timestamp:    post.timestamp,
            },
          }]);
        }
      }
    }

    // ── INDIVIDUALNI POST ─────────────────────────────────────────────────────
    else if (type === 'post') {
      const { postId, title, upvotes, commentCount, subreddit: sub, keyword: kw, timestamp } = request.userData;

      try {
        await page.waitForSelector('.usertext-body, #siteTable', { timeout: 15000 });
      } catch {
        log.warning(`  Post body nije učitan: ${postId}`);
        return;
      }
      await sleep(400);

      const data = await page.evaluate((inclComments) => {
        // Pun tekst posta
        const bodyEl = document.querySelector('.usertext-body .md');
        const body   = bodyEl?.innerText?.trim() ?? '';

        // Top komentari
        const comments = [];
        if (inclComments) {
          document.querySelectorAll('.comment .usertext-body .md').forEach((el, i) => {
            if (i >= 8) return;
            const text = el.innerText?.trim() ?? '';
            if (text.length > 25 && text !== '[deleted]' && text !== '[removed]') {
              comments.push(text.slice(0, 600));
            }
          });
        }

        return { body, comments };
      }, includeComments);

      // Scoruj pun tekst (naslov + body)
      const fullText = `${title} ${data.body}`;
      const scoring  = scorePain(fullText, painSignalWords);

      if (scoring.painScore < minPainScore) return; // Preskoči ako nije dovoljno pain

      const category     = categorize(fullText);
      const vocQuotes    = extractVocQuotes(data.body || title, painSignalWords);
      const commentQuotes = data.comments.flatMap(c => extractVocQuotes(c, painSignalWords, 2));

      await Actor.pushData({
        source:            'Reddit',
        subreddit:         `r/${sub}`,
        keyword_used:      kw,
        post_id:           postId,
        title,
        body:              data.body.slice(0, 1500),
        url:               `https://reddit.com/comments/${postId}/`,
        upvotes,
        comment_count:     commentCount,
        posted_at:         timestamp,
        problem_category:  category,
        voc_quotes:        vocQuotes,
        comment_voc:       commentQuotes,
        top_comments:      data.comments.slice(0, 5),
        pain_score:        scoring.painScore,
        signal:            scoring.signal,
        matched_words:     scoring.matchedWords,
        matched_patterns:  scoring.matchedPatterns,
        scraped_at:        new Date().toISOString(),
      });

      log.info(`  ✓ [${scoring.signal}] ${scoring.painScore}/100 | "${title.slice(0, 60)}"`);
    }
  },

  failedRequestHandler({ request, error }) {
    log.error(`FAILED: ${request.url} — ${error.message}`);
  },
});

// ─── Pokreni ──────────────────────────────────────────────────────────────────

// old.reddit.com ima čist HTML, bez React hydration — pouzdanije i brže
const requests = allKeywords.flatMap(keyword =>
  subreddits.map(subreddit => ({
    url: `https://old.reddit.com/r/${subreddit}/search?q=${encodeURIComponent(keyword)}&sort=${sortBy}&t=${timeFilter}&restrict_sr=on`,
    userData: { type: 'search', keyword, subreddit },
  }))
);

log.info(`\nQueuing ${requests.length} pretrage...`);
await crawler.run(requests);

log.info('\n✅ Reddit scraping završen. Rezultati su u Apify Dataset-u.');
log.info('💡 Promeni keywords: Input tab → searchKeywords ili extraKeywords');

await Actor.exit();
