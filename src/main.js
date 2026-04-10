/**
 * Skool Reddit Research Actor  v4.0
 * ====================================
 * Reddit JSON API — zero browsers, masivno skalabilno.
 *
 * Strategija:
 *  1. GLOBAL search — svi 1000+ keywords pretražuju ceo Reddit
 *  2. TARGETED search — 50 priority keywords × 80+ subreddits (restrict_sr=1)
 *  3. Komentari se uzimaju direktno iz JSON-a
 *  4. Nema filtera pri kolekciji — sve se čuva
 *  5. Pagination — do N stranica po queriju
 */

import { Actor, log } from 'apify';
import { HttpCrawler } from 'crawlee';
import { generateKeywords, SUBREDDITS, PRIORITY_KEYWORDS } from './keywords.js';

await Actor.init();

const input = await Actor.getInput() ?? {};

const {
  // Keyword control
  extraKeywords        = [],          // dodaj svoje keyword-e na vrh
  useGeneratedKeywords = true,        // koristi 1000+ auto-generated keywords
  maxPagesPerSearch    = 2,           // pagination po queriju (2 × 100 = 200 posts/query)
  // Subreddit control
  targetedSubreddits   = SUBREDDITS, // override lista subreddita
  onlyPriorityOnSubs   = true,        // true = samo priority keywords na subredditima (brže)
                                      // false = svi keywords na svakom subredditu (ogromno)
  // Post collection
  maxPostsPerSearch    = 100,         // Reddit max = 100
  minPostUpvotes       = 0,           // 0 = uzmi SVE
  timeFilter           = 'year',      // week | month | year | all
  sortBy               = 'top',       // top | relevance | new | comments
  // Comments
  includeComments      = true,
  maxCommentsPerPost   = 25,
  minCommentLength     = 20,
  // Proxy
  proxyConfig          = { useApifyProxy: true },
} = input;

// ─── Keywords ────────────────────────────────────────────────────────────────

const generatedKeywords = useGeneratedKeywords ? generateKeywords() : [];
const allKeywords = [...new Set([...extraKeywords, ...generatedKeywords])];
const keywordsForSubs = onlyPriorityOnSubs ? PRIORITY_KEYWORDS : allKeywords;

log.info(`=== Skool Reddit Research v4.0 ===`);
log.info(`Generated keywords: ${generatedKeywords.length}`);
log.info(`Total unique keywords: ${allKeywords.length}`);
log.info(`Subreddits: ${targetedSubreddits.length}`);
log.info(`Keywords on subreddits: ${keywordsForSubs.length}`);
log.info(`Global searches: ${allKeywords.length * maxPagesPerSearch}`);
log.info(`Targeted searches: ${keywordsForSubs.length * targetedSubreddits.length * maxPagesPerSearch}`);
log.info(`Max total initial requests: ${(allKeywords.length + keywordsForSubs.length * targetedSubreddits.length) * maxPagesPerSearch}`);

// ─── Crawler ──────────────────────────────────────────────────────────────────

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
const seenPostIds = new Set();

const crawler = new HttpCrawler({
  proxyConfiguration,
  maxConcurrency:            5,
  requestHandlerTimeoutSecs: 30,
  maxRequestRetries:         3,
  additionalMimeTypes:       ['application/json'],

  preNavigationHooks: [async ({ request }) => {
    request.headers = {
      ...request.headers,
      'User-Agent': 'Mozilla/5.0 (compatible; SkoolResearch/4.0; +research)',
      'Accept':     'application/json',
    };
  }],

  async requestHandler({ request, body }) {
    const { type, keyword, subreddit, page: pageNum = 0 } = request.userData;

    // ── SEARCH ────────────────────────────────────────────────────────────────
    if (type === 'search') {
      let data;
      try { data = JSON.parse(body); }
      catch { log.warning(`Bad JSON: ${request.url}`); return; }

      const posts = data?.data?.children ?? [];
      const after = data?.data?.after;

      if (posts.length > 0) {
        log.info(`[${subreddit ?? 'all'}] "${keyword?.slice(0, 50)}" p${pageNum} → ${posts.length} posts`);
      }

      // Queue next page
      if (after && pageNum < maxPagesPerSearch - 1) {
        const base = request.url.split('&after=')[0];
        await Actor.addRequests([{
          url: `${base}&after=${after}`,
          userData: { type: 'search', keyword, subreddit, page: pageNum + 1 },
        }]);
      }

      const commentQueue = [];

      for (const { data: post } of posts) {
        if (!post?.id || seenPostIds.has(post.id)) continue;
        if ((post.score ?? 0) < minPostUpvotes) continue;
        seenPostIds.add(post.id);

        const hasBody = post.selftext &&
                        post.selftext !== '[deleted]' &&
                        post.selftext !== '[removed]' &&
                        post.selftext.length > 10;

        if (hasBody) {
          await Actor.pushData(buildPost(post, keyword, subreddit));
        }

        if (includeComments && post.num_comments > 0) {
          commentQueue.push({
            url: `https://www.reddit.com/comments/${post.id}.json?sort=top&limit=${maxCommentsPerPost}&depth=1`,
            userData: {
              type:      'comments',
              postId:    post.id,
              title:     post.title,
              score:     post.score,
              numComm:   post.num_comments,
              author:    post.author,
              subreddit: post.subreddit,
              keyword,
              permalink: post.permalink,
              createdAt: new Date((post.created_utc ?? 0) * 1000).toISOString(),
              selftext:  hasBody ? post.selftext.slice(0, 3000) : '',
              flair:     post.link_flair_text ?? '',
            },
          });
        }
      }

      if (commentQueue.length > 0) {
        await Actor.addRequests(commentQueue);
      }
    }

    // ── COMMENTS ──────────────────────────────────────────────────────────────
    else if (type === 'comments') {
      let data;
      try { data = JSON.parse(body); }
      catch { log.warning(`Bad JSON comments: ${request.url}`); return; }

      const ud = request.userData;
      const commentTree = data?.[1]?.data?.children ?? [];

      const comments = commentTree
        .filter(c => c.kind === 't1' && c.data?.body)
        .map(c => c.data)
        .filter(c =>
          c.body !== '[deleted]' &&
          c.body !== '[removed]' &&
          c.body.length >= minCommentLength
        )
        .slice(0, maxCommentsPerPost)
        .map(c => ({
          author:      c.author,
          body:        c.body.slice(0, 1500),
          score:       c.score ?? 0,
          is_question: c.body.includes('?'),
        }));

      if (comments.length === 0 && !ud.selftext) return;

      await Actor.pushData({
        source:                  'Reddit',
        subreddit:               `r/${ud.subreddit}`,
        keyword_used:            ud.keyword,
        post_id:                 ud.postId,
        title:                   ud.title,
        body:                    ud.selftext ?? '',
        url:                     `https://reddit.com${ud.permalink}`,
        upvotes:                 ud.score,
        comment_count:           ud.numComm,
        author:                  ud.author,
        flair:                   ud.flair,
        posted_at:               ud.createdAt,
        top_comments:            comments,
        has_questions:           comments.some(c => c.is_question),
        top_comment_count:       comments.length,
        scraped_at:              new Date().toISOString(),
      });

      log.info(`  ✓ ${comments.length} comments | r/${ud.subreddit} | "${ud.title?.slice(0, 55)}"`);
    }
  },

  failedRequestHandler({ request, error }) {
    log.error(`FAILED: ${request.url} — ${error.message}`);
  },
});

// ─── Build Request Queue ──────────────────────────────────────────────────────

const requests = [];

// 1. GLOBAL search — all 1000+ keywords across all of Reddit
for (const keyword of allKeywords) {
  requests.push({
    url: `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=${sortBy}&t=${timeFilter}&limit=${maxPostsPerSearch}`,
    userData: { type: 'search', keyword, subreddit: 'all', page: 0 },
  });
}

// 2. TARGETED search — priority keywords × specific subreddits
for (const keyword of keywordsForSubs) {
  for (const subreddit of targetedSubreddits) {
    requests.push({
      url: `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&restrict_sr=1&sort=${sortBy}&t=${timeFilter}&limit=${maxPostsPerSearch}`,
      userData: { type: 'search', keyword, subreddit, page: 0 },
    });
  }
}

log.info(`\nQueuing ${requests.length} initial requests...`);
await crawler.run(requests);

log.info(`\n✅ Done. Posts in Apify Dataset.`);
log.info(`   Seen post IDs (deduped): ${seenPostIds.size}`);
await Actor.exit();

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildPost(post, keyword, subreddit) {
  return {
    source:        'Reddit',
    subreddit:     `r/${post.subreddit}`,
    keyword_used:  keyword,
    post_id:       post.id,
    title:         post.title,
    body:          post.selftext?.slice(0, 3000) ?? '',
    url:           `https://reddit.com${post.permalink}`,
    upvotes:       post.score ?? 0,
    comment_count: post.num_comments ?? 0,
    author:        post.author,
    flair:         post.link_flair_text ?? '',
    posted_at:     new Date((post.created_utc ?? 0) * 1000).toISOString(),
    scraped_at:    new Date().toISOString(),
  };
}
