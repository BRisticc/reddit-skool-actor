/**
 * Skool Reddit Research Actor  v6.0 — OAuth Mode
 * ====================================================
 * Fixes 403 blocking with Reddit OAuth2 (client_credentials).
 * Falls back to public API with RESIDENTIAL proxy if no OAuth creds.
 *
 * Setup (required for reliable results):
 *  1. Go to https://www.reddit.com/prefs/apps
 *  2. Create app → type "script"
 *  3. Copy client_id (under app name) + client_secret
 *  4. Enter in Actor Input → redditClientId / redditClientSecret
 *
 * Two-tier search strategy:
 *  1. Global search — all creator keywords on Reddit-wide search
 *  2. Targeted — priority keywords × relevant subreddits
 *
 * Post-level relevance filter before saving (spam/typo/promo rejection).
 */

import { Actor, log } from 'apify';
import { HttpCrawler } from 'crawlee';
import { CREATOR_KEYWORDS, CREATOR_SUBREDDITS, PRIORITY_KEYWORDS } from './keywords.js';
import { scoreRelevance, shouldFetchPost } from './relevance.js';

await Actor.init();

const input = await Actor.getInput() ?? {};

const {
  // ── Reddit OAuth (RECOMMENDED — prevents 403 blocks) ─────────────────────
  redditClientId     = '',
  redditClientSecret = '',
  redditUsername     = 'skoolresearch',
  // ── Keywords ─────────────────────────────────────────────────────────────
  extraKeywords         = [],
  useBuiltinKeywords    = true,
  // ── Subreddits ────────────────────────────────────────────────────────────
  subreddits            = CREATOR_SUBREDDITS,
  // ── Collection settings ───────────────────────────────────────────────────
  maxPostsPerSearch     = 100,
  maxPagesPerSearch     = 3,
  // ── Relevance filter ─────────────────────────────────────────────────────
  minRelevanceScore     = 30,
  // ── Comments ─────────────────────────────────────────────────────────────
  includeComments       = true,
  maxCommentsPerPost    = 50,
  minCommentLength      = 25,
  // ── Sort ─────────────────────────────────────────────────────────────────
  timeFilter            = 'year',
  sortBy                = 'top',
  // ── Proxy ────────────────────────────────────────────────────────────────
  proxyConfig           = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
} = input;

// ─── OAuth Token ──────────────────────────────────────────────────────────────

let accessToken = null;
const userAgent = `script:SkoolResearch:v6.0 (by /u/${redditUsername})`;

if (redditClientId && redditClientSecret) {
  try {
    log.info('Authenticating with Reddit OAuth...');
    const encoded = Buffer.from(`${redditClientId}:${redditClientSecret}`).toString('base64');
    const resp = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encoded}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'User-Agent':    userAgent,
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await resp.json();
    if (tokenData.access_token) {
      accessToken = tokenData.access_token;
      log.info(`✓ Reddit OAuth OK — rate limit: 60 req/min`);
    } else {
      log.warning(`OAuth failed: ${JSON.stringify(tokenData)}. Using public API (may get 403).`);
    }
  } catch (e) {
    log.warning(`OAuth error: ${e.message}. Using public API.`);
  }
} else {
  log.warning('No Reddit OAuth credentials provided. Requests may get 403 blocked.');
  log.warning('→ Get credentials at https://www.reddit.com/prefs/apps (free, takes 2 min)');
}

// OAuth uses oauth.reddit.com, public uses www.reddit.com
const API_BASE = accessToken ? 'https://oauth.reddit.com' : 'https://www.reddit.com';

// ─── Keyword Setup ────────────────────────────────────────────────────────────

const allKeywords = [
  ...extraKeywords,
  ...(useBuiltinKeywords ? CREATOR_KEYWORDS : []),
];
const uniqueKeywords = [...new Set(allKeywords)];

log.info(`=== Skool Reddit Research v6.0 — OAuth Mode ===`);
log.info(`Auth: ${accessToken ? 'OAuth (60 req/min)' : 'Public API (may 403)'}`);
log.info(`Keywords: ${uniqueKeywords.length} | Subreddits: ${subreddits.length}`);
log.info(`Min relevance score: ${minRelevanceScore}`);

// ─── Crawler ──────────────────────────────────────────────────────────────────

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
const seenPostIds = new Set();
let totalSaved = 0;
let totalRejected = 0;

const crawler = new HttpCrawler({
  proxyConfiguration,
  maxConcurrency:              accessToken ? 3 : 2,  // Slower without OAuth
  requestHandlerTimeoutSecs:   45,
  maxRequestRetries:           2,
  additionalMimeTypes:         ['application/json'],
  // Rate limit: Reddit OAuth = 60/min → ~1/sec. Set minConcurrency low.
  minConcurrency: 1,

  preNavigationHooks: [async ({ request }) => {
    const headers = {
      'User-Agent': userAgent,
      'Accept':     'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    request.headers = { ...request.headers, ...headers };
  }],

  async requestHandler({ request, body }) {
    const { type, keyword, subreddit, page: pageNum = 0 } = request.userData;

    // ── SEARCH ──────────────────────────────────────────────────────────────
    if (type === 'search') {
      let data;
      try { data = JSON.parse(body); }
      catch { log.warning(`Bad JSON: ${request.url}`); return; }

      const posts = data?.data?.children ?? [];
      const after = data?.data?.after;

      // Pagination
      if (after && pageNum < maxPagesPerSearch - 1 && posts.length > 0) {
        const base = request.url.split('&after=')[0];
        await crawler.addRequests([{
          url: `${base}&after=${after}`,
          userData: { type: 'search', keyword, subreddit, page: pageNum + 1 },
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
          post.selftext.length > 20;

        // Quick pre-check
        if (!shouldFetchPost(post.title, hasBody ? post.selftext.slice(0, 300) : '')) {
          totalRejected++;
          continue;
        }

        // Full relevance check
        const fullText = `${post.title} ${hasBody ? post.selftext : ''}`;
        const relevance = scoreRelevance(fullText);

        if (relevance.score < minRelevanceScore) {
          totalRejected++;
          log.debug(`  SKIP [${relevance.reason}] "${post.title?.slice(0, 60)}"`);
          continue;
        }

        pageRelevant++;

        if (hasBody) {
          await Actor.pushData(buildPost(post, keyword, relevance));
          totalSaved++;
        }

        if (includeComments && post.num_comments > 0) {
          // Comments use www.reddit.com even with OAuth (public CDN)
          const commentUrl = `https://www.reddit.com/comments/${post.id}.json?sort=top&limit=${maxCommentsPerPost}&depth=2`;
          commentQueue.push({
            url: commentUrl,
            userData: {
              type:          'comments',
              postId:        post.id,
              title:         post.title,
              score:         post.score,
              numComm:       post.num_comments,
              author:        post.author,
              subreddit:     post.subreddit,
              keyword,
              permalink:     post.permalink,
              createdAt:     new Date((post.created_utc ?? 0) * 1000).toISOString(),
              selftext:      hasBody ? post.selftext.slice(0, 3000) : '',
              flair:         post.link_flair_text ?? '',
              postRelevance: relevance.score,
            },
          });
        }
      }

      if (posts.length > 0) {
        log.info(`[${subreddit ?? 'all'}] "${keyword?.slice(0, 45)}" p${pageNum} → ${posts.length} posts, ${pageRelevant} relevant`);
      }

      if (commentQueue.length > 0) {
        await crawler.addRequests(commentQueue);
      }
    }

    // ── COMMENTS ────────────────────────────────────────────────────────────
    else if (type === 'comments') {
      let data;
      try { data = JSON.parse(body); }
      catch { log.warning(`Bad JSON comments: ${request.url}`); return; }

      const ud = request.userData;
      const commentTree = data?.[1]?.data?.children ?? [];

      const rawComments = commentTree
        .filter(c => c.kind === 't1' && c.data?.body)
        .map(c => c.data)
        .filter(c =>
          c.body !== '[deleted]' &&
          c.body !== '[removed]' &&
          c.body.length >= minCommentLength
        )
        .slice(0, maxCommentsPerPost);

      const isHighlyRelevantPost = (ud.postRelevance ?? 0) >= 60;
      const relevantComments = rawComments.filter(c => {
        if (isHighlyRelevantPost) return true;
        const cr = scoreRelevance(`${ud.title} ${c.body}`);
        return cr.score >= 15;
      });

      if (relevantComments.length === 0 && !ud.selftext) return;

      const mappedComments = relevantComments.map(c => ({
        author:          c.author,
        body:            c.body.slice(0, 2000),
        score:           c.score ?? 0,
        is_question:     c.body.includes('?'),
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
        flair:                  ud.flair,
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
    log.error(`FAILED: ${request.url} — ${error.message}`);
  },
});

// ─── Build Requests ───────────────────────────────────────────────────────────

const requests = [];

// 1. Global search — all keywords, entire Reddit
for (const keyword of uniqueKeywords) {
  requests.push({
    url: `${API_BASE}/search.json?q=${encodeURIComponent(keyword)}&sort=${sortBy}&t=${timeFilter}&limit=${maxPostsPerSearch}`,
    userData: { type: 'search', keyword, subreddit: 'all', page: 0 },
  });
}

// 2. Targeted subreddit search — priority keywords × subreddits
for (const keyword of PRIORITY_KEYWORDS) {
  for (const sub of subreddits) {
    requests.push({
      url: `${API_BASE}/r/${sub}/search.json?q=${encodeURIComponent(keyword)}&restrict_sr=1&sort=${sortBy}&t=${timeFilter}&limit=${maxPostsPerSearch}`,
      userData: { type: 'search', keyword, subreddit: sub, page: 0 },
    });
  }
}

log.info(`\nQueuing ${requests.length} requests...`);
log.info(`${uniqueKeywords.length} global + ${PRIORITY_KEYWORDS.length * subreddits.length} targeted`);

await crawler.run(requests);

log.info(`\n✅ Done.`);
log.info(`   Saved: ${totalSaved} | Rejected: ${totalRejected}`);
log.info(`   Signal ratio: ${Math.round(totalSaved / (totalSaved + totalRejected || 1) * 100)}%`);
await Actor.exit();

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildPost(post, keyword, relevance) {
  return {
    source:            'Reddit',
    subreddit:         `r/${post.subreddit}`,
    keyword_used:      keyword,
    post_id:           post.id,
    title:             post.title,
    body:              post.selftext?.slice(0, 3000) ?? '',
    url:               `https://reddit.com${post.permalink}`,
    upvotes:           post.score ?? 0,
    comment_count:     post.num_comments ?? 0,
    author:            post.author,
    flair:             post.link_flair_text ?? '',
    posted_at:         new Date((post.created_utc ?? 0) * 1000).toISOString(),
    relevance_score:   relevance.score,
    relevance_signals: relevance.signals,
    scraped_at:        new Date().toISOString(),
  };
}
