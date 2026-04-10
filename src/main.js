/**
 * Skool Reddit Research Actor  v7.0 — PullPush Mode
 * ====================================================
 * Primarni izvor: api.pullpush.io — Reddit mirror, bez auth, bez 403.
 * Komentari: direktno reddit.com/comments/{id}.json (individual fetches, ne blocked).
 * Reddit OAuth: opcionalan bonus ako korisnik doda credentials.
 *
 * Zašto PullPush umesto Reddit search API?
 *  - Reddit search.json blokira datacenter + residential IP-eve agresivno
 *  - PullPush je community Reddit mirror (pushshift.io naslednik)
 *  - Bez auth, bez rate-limit blokade, isti podaci
 *  - Individual post JSON fetches (za komentare) su gotovo nikad blokirani
 */

import { Actor, log } from 'apify';
import { HttpCrawler } from 'crawlee';
import { CREATOR_KEYWORDS, CREATOR_SUBREDDITS, PRIORITY_KEYWORDS } from './keywords.js';
import { scoreRelevance, shouldFetchPost } from './relevance.js';

await Actor.init();

const input = await Actor.getInput() ?? {};

const {
  // ── Keywords ─────────────────────────────────────────────────────────────
  extraKeywords         = [],
  useBuiltinKeywords    = true,
  // ── Subreddits ────────────────────────────────────────────────────────────
  subreddits            = CREATOR_SUBREDDITS,
  // ── Collection settings ───────────────────────────────────────────────────
  maxPostsPerSearch     = 100,
  maxPagesPerSearch     = 3,
  // ── Relevance filter ─────────────────────────────────────────────────────
  minRelevanceScore     = 25,
  // ── Comments ─────────────────────────────────────────────────────────────
  includeComments       = true,
  maxCommentsPerPost    = 50,
  minCommentLength      = 20,
  // ── Time range (days back from now) ─────────────────────────────────────
  daysBack              = 730,    // 2 years
  // ── Sort ─────────────────────────────────────────────────────────────────
  sortBy                = 'score',  // score | created_utc | num_comments
  // ── Proxy ────────────────────────────────────────────────────────────────
  proxyConfig           = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
} = input;

const allKeywords = [
  ...extraKeywords,
  ...(useBuiltinKeywords ? CREATOR_KEYWORDS : []),
];
const uniqueKeywords = [...new Set(allKeywords)];

const afterTs  = Math.floor(Date.now() / 1000) - daysBack * 86400;
const beforeTs = Math.floor(Date.now() / 1000);

log.info(`=== Skool Reddit Research v7.0 — PullPush Mode ===`);
log.info(`Source: api.pullpush.io (no auth, no 403)`);
log.info(`Keywords: ${uniqueKeywords.length} | Subreddits: ${subreddits.length}`);
log.info(`Date range: last ${daysBack} days`);

// ─── Crawler ──────────────────────────────────────────────────────────────────

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
const seenPostIds = new Set();
let totalSaved = 0;
let totalRejected = 0;

const crawler = new HttpCrawler({
  proxyConfiguration,
  maxConcurrency:            5,
  requestHandlerTimeoutSecs: 45,
  maxRequestRetries:         2,
  additionalMimeTypes:       ['application/json'],

  preNavigationHooks: [async ({ request }) => {
    request.headers = {
      ...request.headers,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':     'application/json',
    };
  }],

  errorHandler: async ({ request, error }) => {
    // Don't retry 403 — it will never succeed
    if (error.message?.includes('403') || error.message?.includes('blocked')) {
      request.noRetry = true;
      log.warning(`403 blocked (no retry): ${request.url.slice(0, 100)}`);
    }
  },

  async requestHandler({ request, body }) {
    const { type, keyword, subreddit } = request.userData;

    // ── PULLPUSH SEARCH ──────────────────────────────────────────────────────
    if (type === 'pullpush') {
      let data;
      try { data = JSON.parse(body); }
      catch { log.warning(`Bad JSON from PullPush: ${request.url}`); return; }

      const posts = data?.data ?? [];
      if (posts.length === 0) return;

      log.info(`[PullPush] "${keyword?.slice(0, 45)}" ${subreddit ? `r/${subreddit}` : 'all'} → ${posts.length} posts`);

      const commentQueue = [];
      let pageRelevant = 0;

      for (const post of posts) {
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

        const postRecord = buildPost(post, keyword, relevance);

        if (hasBody) {
          await Actor.pushData(postRecord);
          totalSaved++;
        }

        // Queue comments — use reddit.com directly (individual fetches, not blocked)
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
              keyword,
              permalink:     post.permalink ?? `/r/${post.subreddit}/comments/${post.id}/`,
              createdAt:     new Date((post.created_utc ?? 0) * 1000).toISOString(),
              selftext:      hasBody ? post.selftext.slice(0, 3000) : '',
              flair:         post.link_flair_text ?? '',
              postRelevance: relevance.score,
            },
          });
        }
      }

      if (pageRelevant > 0) {
        log.info(`  → ${pageRelevant} relevant posts queued`);
      }

      if (commentQueue.length > 0) {
        await crawler.addRequests(commentQueue);
      }
    }

    // ── PULLPUSH COMMENT SEARCH (find pain comments directly) ─────────────
    else if (type === 'pullpush_comments') {
      let data;
      try { data = JSON.parse(body); }
      catch { return; }

      const comments = data?.data ?? [];
      if (comments.length === 0) return;

      for (const comment of comments) {
        if (!comment?.id || comment.body === '[deleted]' || comment.body === '[removed]') continue;
        if ((comment.body?.length ?? 0) < minCommentLength) continue;

        const fullText = `${comment.link_title ?? ''} ${comment.body ?? ''}`;
        const relevance = scoreRelevance(fullText);
        if (relevance.score < minRelevanceScore) continue;

        await Actor.pushData({
          source:           'Reddit_Comment',
          subreddit:        `r/${comment.subreddit ?? ''}`,
          keyword_used:     keyword,
          post_id:          comment.link_id?.replace('t3_', '') ?? '',
          post_title:       comment.link_title ?? '',
          post_url:         comment.permalink ? `https://reddit.com${comment.permalink}` : '',
          comment_id:       comment.id,
          comment_body:     comment.body?.slice(0, 2000) ?? '',
          comment_author:   comment.author ?? '',
          comment_score:    comment.score ?? 0,
          posted_at:        new Date((comment.created_utc ?? 0) * 1000).toISOString(),
          relevance_score:  relevance.score,
          relevance_signals: relevance.signals,
          is_question:      (comment.body ?? '').includes('?'),
          scraped_at:       new Date().toISOString(),
        });
        totalSaved++;
      }
    }

    // ── REDDIT COMMENTS (direct post JSON) ────────────────────────────────
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

// ── 1. PullPush: all keywords × global search ─────────────────────────────
for (const keyword of uniqueKeywords) {
  requests.push({
    url: buildPullPushUrl({ q: keyword, size: maxPostsPerSearch, sort: sortBy, after: afterTs }),
    userData: { type: 'pullpush', keyword, subreddit: null },
  });
}

// ── 2. PullPush: priority keywords × subreddits ───────────────────────────
for (const keyword of PRIORITY_KEYWORDS) {
  for (const sub of subreddits) {
    requests.push({
      url: buildPullPushUrl({ q: keyword, subreddit: sub, size: maxPostsPerSearch, sort: sortBy, after: afterTs }),
      userData: { type: 'pullpush', keyword, subreddit: sub },
    });
  }
}

// ── 3. PullPush: comment search for highest-signal pain keywords ──────────
const PAIN_COMMENT_KEYWORDS = [
  'skool ghost town',
  'skool members not engaging',
  'skool can\'t collect emails',
  'skool zapier broken',
  'skool no automation',
  'skool manually',
  'skool analytics missing',
  'leaving skool',
  'cancelled skool',
  'skool not worth it',
  'skool churn',
  'skool members leaving',
];

for (const keyword of PAIN_COMMENT_KEYWORDS) {
  requests.push({
    url: buildPullPushCommentUrl({ q: keyword, size: 100, after: afterTs }),
    userData: { type: 'pullpush_comments', keyword },
  });
}

log.info(`\nQueuing ${requests.length} requests to PullPush...`);
log.info(`  ${uniqueKeywords.length} global post searches`);
log.info(`  ${PRIORITY_KEYWORDS.length * subreddits.length} targeted subreddit searches`);
log.info(`  ${PAIN_COMMENT_KEYWORDS.length} direct comment pain searches`);

await crawler.run(requests);

log.info(`\n✅ Done.`);
log.info(`   Saved: ${totalSaved} | Rejected: ${totalRejected}`);
log.info(`   Signal ratio: ${Math.round(totalSaved / (totalSaved + totalRejected || 1) * 100)}%`);
await Actor.exit();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPullPushUrl({ q, subreddit, size = 100, sort = 'score', after, before } = {}) {
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('size', String(size));
  params.set('sort', sort);
  params.set('sort_type', sort === 'created_utc' ? 'created_utc' : sort);
  if (subreddit) params.set('subreddit', subreddit);
  if (after)     params.set('after', String(after));
  if (before)    params.set('before', String(before));
  return `https://api.pullpush.io/reddit/search/submission/?${params}`;
}

function buildPullPushCommentUrl({ q, subreddit, size = 100, after, before } = {}) {
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('size', String(size));
  if (subreddit) params.set('subreddit', subreddit);
  if (after)     params.set('after', String(after));
  if (before)    params.set('before', String(before));
  return `https://api.pullpush.io/reddit/search/comment/?${params}`;
}

function buildPost(post, keyword, relevance) {
  return {
    source:            'Reddit',
    subreddit:         `r/${post.subreddit ?? ''}`,
    keyword_used:      keyword,
    post_id:           post.id,
    title:             post.title ?? '',
    body:              (post.selftext ?? '').slice(0, 3000),
    url:               post.permalink
      ? `https://reddit.com${post.permalink}`
      : `https://reddit.com/r/${post.subreddit}/comments/${post.id}/`,
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
