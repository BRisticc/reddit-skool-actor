/**
 * Skool Reddit Research Actor  v5.0 — Precision Mode
 * ====================================================
 * Fokus: samo kreatori koji imaju PROBLEM sa Skool platformom.
 * Odbacuje: promo, affiliate, "school" typo, irelevantne postove.
 *
 * Dvoslojna zaštita od šuma:
 *  1. Precizni creator-focused keywords (ne broad "skool")
 *  2. Post-level relevance filter — svaki post se scoruje pre čuvanja
 *
 * API: Reddit JSON API (HttpCrawler, bez browsera)
 */

import { Actor, log } from 'apify';
import { HttpCrawler } from 'crawlee';
import { CREATOR_KEYWORDS, CREATOR_SUBREDDITS, PRIORITY_KEYWORDS } from './keywords.js';
import { scoreRelevance, shouldFetchPost } from './relevance.js';

await Actor.init();

const input = await Actor.getInput() ?? {};

const {
  // Keywords
  extraKeywords         = [],
  useBuiltinKeywords    = true,
  // Subreddits
  subreddits            = CREATOR_SUBREDDITS,
  // Collection settings
  maxPostsPerSearch     = 100,
  maxPagesPerSearch     = 3,
  // Relevance filter
  minRelevanceScore     = 30,     // 0 = čuvaj sve, 30 = creator/problem signal required
  // Comments
  includeComments       = true,
  maxCommentsPerPost    = 30,
  minCommentLength      = 25,
  // Sort
  timeFilter            = 'year',
  sortBy                = 'top',
  // Proxy
  proxyConfig           = { useApifyProxy: true },
} = input;

const allKeywords = [
  ...extraKeywords,
  ...(useBuiltinKeywords ? CREATOR_KEYWORDS : []),
];

const uniqueKeywords = [...new Set(allKeywords)];

log.info(`=== Skool Reddit Research v5.0 — Precision Mode ===`);
log.info(`Keywords: ${uniqueKeywords.length} | Subreddits: ${subreddits.length}`);
log.info(`Min relevance score: ${minRelevanceScore}`);
log.info(`Strategy: ${PRIORITY_KEYWORDS.length} priority keywords × ${subreddits.length} subreddits + all keywords globally`);

// ─── Crawler ─────────────────────────────────────────────────────────────────

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
const seenPostIds = new Set();
let totalSaved = 0;
let totalRejected = 0;

const crawler = new HttpCrawler({
  proxyConfiguration,
  maxConcurrency: 4,
  requestHandlerTimeoutSecs: 30,
  maxRequestRetries: 3,
  additionalMimeTypes: ['application/json'],

  preNavigationHooks: [async ({ request }) => {
    request.headers = {
      ...request.headers,
      'User-Agent': 'Mozilla/5.0 (compatible; SkoolResearch/5.0)',
      'Accept': 'application/json',
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

      // Pagination
      if (after && pageNum < maxPagesPerSearch - 1 && posts.length > 0) {
        const base = request.url.split('&after=')[0];
        await Actor.addRequests([{
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

        // Quick relevance pre-check from title + preview
        const previewText = `${post.title} ${hasBody ? post.selftext.slice(0, 300) : ''}`;
        if (!shouldFetchPost(post.title, hasBody ? post.selftext.slice(0, 300) : '')) {
          totalRejected++;
          continue;
        }

        // Full relevance check on available text
        const fullText = `${post.title} ${hasBody ? post.selftext : ''}`;
        const relevance = scoreRelevance(fullText);

        if (relevance.score < minRelevanceScore) {
          totalRejected++;
          log.debug(`  SKIP [${relevance.reason}] "${post.title?.slice(0, 60)}"`);
          continue;
        }

        pageRelevant++;

        if (hasBody) {
          await Actor.pushData(buildPost(post, keyword, subreddit, relevance));
          totalSaved++;
        }

        // Queue for comments (will do full relevance check on comments too)
        if (includeComments && post.num_comments > 0) {
          commentQueue.push({
            url: `https://www.reddit.com/comments/${post.id}.json?sort=top&limit=${maxCommentsPerPost}&depth=2`,
            userData: {
              type:         'comments',
              postId:       post.id,
              title:        post.title,
              score:        post.score,
              numComm:      post.num_comments,
              author:       post.author,
              subreddit:    post.subreddit,
              keyword,
              permalink:    post.permalink,
              createdAt:    new Date((post.created_utc ?? 0) * 1000).toISOString(),
              selftext:     hasBody ? post.selftext.slice(0, 3000) : '',
              flair:        post.link_flair_text ?? '',
              postRelevance: relevance.score,
            },
          });
        }
      }

      if (posts.length > 0) {
        log.info(`[${subreddit ?? 'all'}] "${keyword?.slice(0, 45)}" p${pageNum} → ${posts.length} posts, ${pageRelevant} relevant`);
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

      const rawComments = commentTree
        .filter(c => c.kind === 't1' && c.data?.body)
        .map(c => c.data)
        .filter(c =>
          c.body !== '[deleted]' &&
          c.body !== '[removed]' &&
          c.body.length >= minCommentLength
        )
        .slice(0, maxCommentsPerPost);

      // Filter comments for relevance too
      // Exception: if the post itself was highly relevant, keep all comments (they provide context)
      const isHighlyRelevantPost = (ud.postRelevance ?? 0) >= 60;
      const relevantComments = rawComments.filter(c => {
        if (isHighlyRelevantPost) return true; // Keep all comments on high-relevance posts
        const cr = scoreRelevance(`${ud.title} ${c.body}`); // Include post title for context
        return cr.score >= 15; // Lower threshold for comments (they're shorter)
      });

      if (relevantComments.length === 0 && !ud.selftext) return;

      const mappedComments = relevantComments.map(c => ({
        author:          c.author,
        body:            c.body.slice(0, 1500),
        score:           c.score ?? 0,
        is_question:     c.body.includes('?'),
        relevance_score: scoreRelevance(`${ud.title} ${c.body}`).score,
      }));

      await Actor.pushData({
        source:             'Reddit',
        subreddit:          `r/${ud.subreddit}`,
        keyword_used:       ud.keyword,
        post_id:            ud.postId,
        title:              ud.title,
        body:               ud.selftext ?? '',
        url:                `https://reddit.com${ud.permalink}`,
        upvotes:            ud.score,
        comment_count:      ud.numComm,
        author:             ud.author,
        flair:              ud.flair,
        posted_at:          ud.createdAt,
        post_relevance:     ud.postRelevance,
        top_comments:       mappedComments,
        relevant_comment_count: mappedComments.length,
        has_questions:      mappedComments.some(c => c.is_question),
        scraped_at:         new Date().toISOString(),
      });

      totalSaved++;
      log.info(`  ✓ r/${ud.subreddit} | ${mappedComments.length} relevant comments | "${ud.title?.slice(0, 55)}"`);
    }
  },

  failedRequestHandler({ request, error }) {
    log.error(`FAILED: ${request.url} — ${error.message}`);
  },
});

// ─── Build Requests ───────────────────────────────────────────────────────────

const requests = [];

// 1. Global search — svi keywords pretražuju ceo Reddit
for (const keyword of uniqueKeywords) {
  requests.push({
    url: `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=${sortBy}&t=${timeFilter}&limit=${maxPostsPerSearch}`,
    userData: { type: 'search', keyword, subreddit: 'all', page: 0 },
  });
}

// 2. Targeted subreddit search — PRIORITY keywords × relevantni subredditi
for (const keyword of PRIORITY_KEYWORDS) {
  for (const subreddit of subreddits) {
    requests.push({
      url: `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&restrict_sr=1&sort=${sortBy}&t=${timeFilter}&limit=${maxPostsPerSearch}`,
      userData: { type: 'search', keyword, subreddit, page: 0 },
    });
  }
}

log.info(`\nQueuing ${requests.length} requests...`);
log.info(`Expected: ${uniqueKeywords.length} global + ${PRIORITY_KEYWORDS.length * subreddits.length} targeted`);
await crawler.run(requests);

log.info(`\n✅ Done.`);
log.info(`   Saved: ${totalSaved} | Rejected as irrelevant: ${totalRejected}`);
log.info(`   Signal ratio: ${totalSaved}/${totalSaved + totalRejected} (${Math.round(totalSaved / (totalSaved + totalRejected || 1) * 100)}%)`);
await Actor.exit();

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildPost(post, keyword, _subreddit, relevance) {
  return {
    source:           'Reddit',
    subreddit:        `r/${post.subreddit}`,
    keyword_used:     keyword,
    post_id:          post.id,
    title:            post.title,
    body:             post.selftext?.slice(0, 3000) ?? '',
    url:              `https://reddit.com${post.permalink}`,
    upvotes:          post.score ?? 0,
    comment_count:    post.num_comments ?? 0,
    author:           post.author,
    flair:            post.link_flair_text ?? '',
    posted_at:        new Date((post.created_utc ?? 0) * 1000).toISOString(),
    relevance_score:  relevance.score,
    relevance_signals: relevance.signals,
    scraped_at:       new Date().toISOString(),
  };
}
