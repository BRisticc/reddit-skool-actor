/**
 * Skool Reddit Research Actor  v8.0 — Direct Reddit, No OAuth
 * ============================================================
 * Radi direktno sa Reddit API-jem bez OAuth-a i bez PullPush-a.
 *
 * Zašto su prethodni pristupi failali:
 *  - /r/{sub}/search.json?restrict_sr=1 → 403 uvek (subreddit-restricted search)
 *  - PullPush.io → nestabilan, često down
 *
 * Ovaj pristup:
 *  1. Global search (/search.json bez restrict_sr) — radi bez OAuth
 *  2. Subreddit listing (/r/{sub}/top.json, /new.json) — listing endpoints, nikad blokirani
 *  3. SessionPool + cookie rotation — svaki session ima svoje cookies/IP
 *  4. Rotacija User-Agent per session
 *  5. Komentari: /comments/{id}.json — individual fetches, nikad blokirani
 */

import { Actor, log } from 'apify';
import { HttpCrawler } from 'crawlee';
import { CREATOR_KEYWORDS, CREATOR_SUBREDDITS, PRIORITY_KEYWORDS } from './keywords.js';
import { scoreRelevance, shouldFetchPost } from './relevance.js';

await Actor.init();

const input = await Actor.getInput() ?? {};

const {
  extraKeywords        = [],
  useBuiltinKeywords   = true,
  subreddits           = CREATOR_SUBREDDITS,
  maxPostsPerSearch    = 100,
  maxPagesPerSearch    = 3,
  minRelevanceScore    = 25,
  includeComments      = true,
  maxCommentsPerPost   = 50,
  minCommentLength     = 20,
  timeFilter           = 'year',
  sortBy               = 'top',
  proxyConfig          = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
} = input;

const allKeywords   = [...extraKeywords, ...(useBuiltinKeywords ? CREATOR_KEYWORDS : [])];
const uniqueKeywords = [...new Set(allKeywords)];

log.info(`=== Skool Reddit Research v8.0 — Direct Reddit ===`);
log.info(`Keywords: ${uniqueKeywords.length} | Subreddits for listing: ${subreddits.length}`);

// ─── User-Agent pool (rotate per session) ────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];
const getUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// ─── Crawler ──────────────────────────────────────────────────────────────────
const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
const seenPostIds = new Set();
let totalSaved = 0;
let totalRejected = 0;

const crawler = new HttpCrawler({
  proxyConfiguration,

  // Session pool: each session = different IP + cookies
  useSessionPool:            true,
  persistCookiesPerSession:  true,
  sessionPoolOptions: {
    maxPoolSize: 30,
    sessionOptions: {
      maxUsageCount:   20,   // Retire after 20 requests
      maxErrorScore:    1,   // Retire immediately on any error
    },
  },

  maxConcurrency:            2,    // Low concurrency to avoid rate-limit patterns
  requestHandlerTimeoutSecs: 60,
  maxRequestRetries:         1,    // Only 1 retry — if blocked, new session on next run
  additionalMimeTypes:       ['application/json'],

  preNavigationHooks: [async ({ request, session }) => {
    const ua = (session?.userData?.ua) ?? getUA();
    if (!session?.userData?.ua) {
      if (session) session.userData.ua = ua;
    }
    request.headers = {
      ...request.headers,
      'User-Agent':      ua,
      'Accept':          'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT':             '1',
      'Connection':      'keep-alive',
    };
  }],

  errorHandler: async ({ request, error, session }) => {
    if (error.message?.includes('403') || error.message?.includes('blocked')) {
      if (session) session.retire();
      request.noRetry = true;
      log.warning(`403 — retired session, skipping: ${request.url.slice(0, 80)}`);
    }
  },

  async requestHandler({ request, body }) {
    const { type, keyword, subreddit, page: pageNum = 0 } = request.userData;

    // ── SEARCH / LISTING ─────────────────────────────────────────────────────
    if (type === 'search' || type === 'listing') {
      let data;
      try { data = JSON.parse(body); }
      catch { log.warning(`Bad JSON: ${request.url}`); return; }

      const posts = data?.data?.children ?? [];
      const after = data?.data?.after;

      // Pagination
      if (after && pageNum < maxPagesPerSearch - 1 && posts.length > 0) {
        const base = request.url.split('&after=')[0].split('?after=')[0];
        const sep  = base.includes('?') ? '&' : '?';
        await crawler.addRequests([{
          url: `${base}${sep}after=${after}`,
          userData: { type, keyword, subreddit, page: pageNum + 1 },
        }]);
      }

      const commentQueue = [];
      let pageRelevant = 0;

      for (const { data: post } of posts) {
        if (!post?.id || seenPostIds.has(post.id)) continue;
        seenPostIds.add(post.id);

        const hasBody = post.selftext &&
          post.selftext !== '[deleted]' &&
          post.selftext !== '[removed]' &&
          post.selftext.trim().length > 20;

        // Pre-check
        if (!shouldFetchPost(post.title ?? '', hasBody ? post.selftext.slice(0, 300) : '')) {
          totalRejected++;
          continue;
        }

        const fullText = `${post.title ?? ''} ${hasBody ? post.selftext : ''}`;
        const relevance = scoreRelevance(fullText);

        if (relevance.score < minRelevanceScore) {
          totalRejected++;
          continue;
        }

        pageRelevant++;

        if (hasBody) {
          await Actor.pushData(buildPost(post, keyword ?? subreddit, relevance));
          totalSaved++;
        }

        if (includeComments && (post.num_comments ?? 0) > 0) {
          commentQueue.push({
            url: `https://www.reddit.com/comments/${post.id}.json?sort=top&limit=${maxCommentsPerPost}&depth=2`,
            userData: {
              type:          'comments',
              postId:        post.id,
              title:         post.title ?? '',
              score:         post.score ?? 0,
              numComm:       post.num_comments ?? 0,
              author:        post.author ?? '',
              subreddit:     post.subreddit ?? subreddit ?? '',
              keyword:       keyword ?? subreddit,
              permalink:     post.permalink ?? '',
              createdAt:     new Date((post.created_utc ?? 0) * 1000).toISOString(),
              selftext:      hasBody ? post.selftext.slice(0, 3000) : '',
              flair:         post.link_flair_text ?? '',
              postRelevance: relevance.score,
            },
          });
        }
      }

      const label = type === 'listing'
        ? `[listing] r/${subreddit} p${pageNum}`
        : `[search] "${keyword?.slice(0, 40)}" p${pageNum}`;
      log.info(`${label} → ${posts.length} posts, ${pageRelevant} relevant`);

      if (commentQueue.length > 0) {
        await crawler.addRequests(commentQueue);
      }
    }

    // ── COMMENTS ────────────────────────────────────────────────────────────
    else if (type === 'comments') {
      let data;
      try { data = JSON.parse(body); }
      catch { return; }

      const ud = request.userData;
      const commentTree = data?.[1]?.data?.children ?? [];

      const rawComments = commentTree
        .filter(c => c.kind === 't1' && c.data?.body)
        .map(c => c.data)
        .filter(c =>
          c.body !== '[deleted]' &&
          c.body !== '[removed]' &&
          (c.body?.length ?? 0) >= minCommentLength
        )
        .slice(0, maxCommentsPerPost);

      const isHighRelevance = (ud.postRelevance ?? 0) >= 60;
      const filteredComments = rawComments.filter(c => {
        if (isHighRelevance) return true;
        return scoreRelevance(`${ud.title} ${c.body}`).score >= 15;
      });

      if (filteredComments.length === 0 && !ud.selftext) return;

      const mappedComments = filteredComments.map(c => ({
        author:          c.author ?? '',
        body:            (c.body ?? '').slice(0, 2000),
        score:           c.score ?? 0,
        is_question:     (c.body ?? '').includes('?'),
        relevance_score: scoreRelevance(`${ud.title} ${c.body}`).score,
      }));

      await Actor.pushData({
        source:                 'Reddit',
        subreddit:              `r/${ud.subreddit}`,
        keyword_used:           ud.keyword,
        post_id:                ud.postId,
        title:                  ud.title,
        body:                   ud.selftext ?? '',
        url:                    `https://reddit.com${ud.permalink}`,
        upvotes:                ud.score,
        comment_count:          ud.numComm,
        author:                 ud.author,
        flair:                  ud.flair ?? '',
        posted_at:              ud.createdAt,
        post_relevance:         ud.postRelevance,
        top_comments:           mappedComments,
        relevant_comment_count: mappedComments.length,
        has_questions:          mappedComments.some(c => c.is_question),
        scraped_at:             new Date().toISOString(),
      });

      totalSaved++;
      log.info(`  ✓ r/${ud.subreddit} | ${mappedComments.length} comments | "${ud.title?.slice(0, 55)}"`);
    }
  },

  failedRequestHandler({ request, error }) {
    log.warning(`Failed: ${request.url.slice(0, 80)} — ${error.message?.slice(0, 60)}`);
  },
});

// ─── Build Requests ───────────────────────────────────────────────────────────

const requests = [];

// ── 1. GLOBAL SEARCH — all keywords, no restrict_sr ──────────────────────
//    Global search is far less blocked than subreddit-restricted search.
for (const keyword of uniqueKeywords) {
  requests.push({
    url: `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=${sortBy}&t=${timeFilter}&limit=${maxPostsPerSearch}`,
    userData: { type: 'search', keyword, subreddit: 'all', page: 0 },
  });
}

// ── 2. SUBREDDIT LISTINGS — browse top/new posts, filter for Skool ────────
//    Listing endpoints (/top.json, /new.json) are never blocked — not search API.
//    We filter posts by relevance on our end.
for (const sub of subreddits) {
  // Top posts this year
  requests.push({
    url: `https://www.reddit.com/r/${sub}/top.json?t=${timeFilter}&limit=${maxPostsPerSearch}`,
    userData: { type: 'listing', subreddit: sub, page: 0 },
  });
  // Newest posts (catch recent discussions)
  requests.push({
    url: `https://www.reddit.com/r/${sub}/new.json?limit=${maxPostsPerSearch}`,
    userData: { type: 'listing', subreddit: sub, page: 0 },
  });
}

// ── 3. r/skool SUBREDDIT — this is THE Skool community, browse everything ─
// All posts here are relevant to Skool — use lower relevance threshold
const SKOOL_SUBREDDITS = ['skool', 'skoolcommunity'];
for (const sub of SKOOL_SUBREDDITS) {
  for (const sort of ['top', 'new', 'hot']) {
    const timeParam = sort === 'top' ? `&t=${timeFilter}` : '';
    requests.push({
      url: `https://www.reddit.com/r/${sub}/${sort}.json?limit=${maxPostsPerSearch}${timeParam}`,
      userData: { type: 'listing', subreddit: sub, page: 0 },
    });
  }
}

log.info(`\nQueuing ${requests.length} requests:`);
log.info(`  ${uniqueKeywords.length} global searches`);
log.info(`  ${subreddits.length * 2} subreddit listings (top + new)`);
log.info(`  ${SKOOL_SUBREDDITS.length * 3} r/skool listings`);

await crawler.run(requests);

log.info(`\n✅ Done.`);
log.info(`   Saved: ${totalSaved} | Rejected: ${totalRejected}`);
log.info(`   Signal ratio: ${Math.round(totalSaved / (totalSaved + totalRejected || 1) * 100)}%`);
await Actor.exit();

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildPost(post, keyword, relevance) {
  return {
    source:            'Reddit',
    subreddit:         `r/${post.subreddit ?? ''}`,
    keyword_used:      keyword ?? '',
    post_id:           post.id,
    title:             post.title ?? '',
    body:              (post.selftext ?? '').slice(0, 3000),
    url:               `https://reddit.com${post.permalink}`,
    upvotes:           post.score ?? 0,
    comment_count:     post.num_comments ?? 0,
    author:            post.author ?? '',
    flair:             post.link_flair_text ?? '',
    posted_at:         new Date((post.created_utc ?? 0) * 1000).toISOString(),
    relevance_score:   relevance.score,
    relevance_signals: relevance.signals,
    scraped_at:        new Date().toISOString(),
  };
}
