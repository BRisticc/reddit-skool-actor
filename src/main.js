/**
 * Skool Reddit Research Actor  v3.0
 * ====================================
 * Koristi Reddit JSON API — NEMA Puppeteer, nema brsuzera.
 * 100 postova po requestu, pagination, 25 keywords × 15 subreddits.
 * Nema pain score filtera pri kolekciji — sve se čuva, analiza posle.
 */

import { Actor, log } from 'apify';
import { HttpCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput() ?? {};

const {
  keywords = [
    // Branded - direktno
    'skool.com', 'skool community platform', 'skool review',
    'skool worth it', 'skool pricing', 'skool problems',
    // Comparisons - competitor intent
    'skool vs kajabi', 'skool vs circle', 'skool vs mighty networks',
    'skool vs teachable', 'skool vs discord', 'skool vs facebook groups',
    'skool alternative', 'kajabi vs skool', 'circle vs skool',
    // Pain points - operational
    'skool members not engaging', 'skool ghost town', 'skool churn',
    'skool email list', 'skool zapier', 'skool automation',
    'skool analytics', 'skool limitations', 'skool not working',
    // Influencer / brand
    'skool sam ovens', 'skool alex hormozi', 'skool games leaderboard',
    'skool affiliate program', 'skool community growth',
    // Generic community pain (catches non-branded discussions)
    'online community platform problems', 'membership site churn',
    'community members not engaging', 'online course community',
  ],
  subreddits = [
    'entrepreneur', 'onlinebusiness', 'marketing', 'digitalmarketing',
    'sidehustle', 'ecommerce', 'freelance', 'consulting',
    'passive_income', 'contentcreation', 'youtubers', 'podcasting',
    'socialmediamarketing', 'startups', 'smallbusiness',
  ],
  timeFilter        = 'year',
  sortBy            = 'top',
  maxPostsPerSearch = 100,
  maxPagesPerSearch = 2,
  includeComments   = true,
  maxCommentsPerPost = 20,
  minPostUpvotes    = 0,       // 0 = uzmi SVE, ne filtriraj
  proxyConfig       = { useApifyProxy: true },
} = input;

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);
const seenPostIds = new Set();

log.info(`Keywords: ${keywords.length} | Subreddits: ${subreddits.length}`);
log.info(`Approx requests: ${(keywords.length * subreddits.length + keywords.length) * maxPagesPerSearch}`);

// ─── Crawler ──────────────────────────────────────────────────────────────────

const crawler = new HttpCrawler({
  proxyConfiguration,
  maxConcurrency: 3,
  requestHandlerTimeoutSecs: 30,
  maxRequestRetries: 3,
  additionalMimeTypes: ['application/json'],

  // Reddit voli custom User-Agent
  preNavigationHooks: [async ({ request }) => {
    request.headers = {
      ...request.headers,
      'User-Agent': 'Mozilla/5.0 (compatible; SkoolResearch/3.0; +research)',
      'Accept': 'application/json',
    };
  }],

  async requestHandler({ request, body }) {
    const { type, keyword, subreddit, page: pageNum = 0 } = request.userData;

    // ── SEARCH RESULTS ────────────────────────────────────────────────────────
    if (type === 'search') {
      let data;
      try { data = JSON.parse(body); } catch { log.warning(`Bad JSON: ${request.url}`); return; }

      const posts = data?.data?.children ?? [];
      const after = data?.data?.after;

      log.info(`[${subreddit}] "${keyword}" page=${pageNum} → ${posts.length} posts`);

      // Paginacija
      if (after && pageNum < maxPagesPerSearch - 1) {
        const baseUrl = request.url.split('&after=')[0];
        await Actor.addRequests([{
          url: `${baseUrl}&after=${after}`,
          userData: { type: 'search', keyword, subreddit, page: pageNum + 1 },
        }]);
      }

      const commentRequests = [];

      for (const { data: post } of posts) {
        if (!post?.id || seenPostIds.has(post.id)) continue;
        if (post.score < minPostUpvotes) continue;
        seenPostIds.add(post.id);

        const hasBody = post.selftext && post.selftext !== '[deleted]' && post.selftext !== '[removed]';

        // Ako post ima body — odmah sačuvaj
        if (hasBody) {
          await Actor.pushData(buildPostRecord(post, keyword, subreddit));
        }

        // Queue za komentare (vredni VOC data)
        if (includeComments && post.num_comments > 0) {
          commentRequests.push({
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
              createdAt: new Date(post.created_utc * 1000).toISOString(),
              selftext:  hasBody ? post.selftext.slice(0, 3000) : '',
              flair:     post.link_flair_text ?? '',
            },
          });
        }
      }

      if (commentRequests.length > 0) {
        await Actor.addRequests(commentRequests);
      }
    }

    // ── COMMENTS ──────────────────────────────────────────────────────────────
    else if (type === 'comments') {
      let data;
      try { data = JSON.parse(body); } catch { log.warning(`Bad JSON comments: ${request.url}`); return; }

      const { postId, title, score, numComm, author, keyword: kw, permalink, createdAt, selftext, flair } = request.userData;
      const sub = request.userData.subreddit;

      const commentTree = data?.[1]?.data?.children ?? [];
      const comments = commentTree
        .filter(c => c.kind === 't1' && c.data?.body)
        .map(c => c.data)
        .filter(c => c.body !== '[deleted]' && c.body !== '[removed]' && c.body.length > 20)
        .slice(0, maxCommentsPerPost)
        .map(c => ({
          author:      c.author,
          body:        c.body.slice(0, 1200),
          score:       c.score,
          is_question: c.body.includes('?'),
        }));

      if (comments.length === 0 && !selftext) return;

      await Actor.pushData({
        source:         'Reddit',
        subreddit:      `r/${sub}`,
        keyword_used:   kw,
        post_id:        postId,
        title,
        body:           selftext,
        url:            `https://reddit.com${permalink}`,
        upvotes:        score,
        comment_count:  numComm,
        author,
        flair,
        posted_at:      createdAt,
        top_comments:   comments,
        has_question_comments: comments.some(c => c.is_question),
        scraped_at:     new Date().toISOString(),
      });

      log.info(`  ✓ r/${sub} | ${comments.length} comments | "${title?.slice(0, 60)}"`);
    }
  },

  failedRequestHandler({ request, error }) {
    log.error(`FAILED: ${request.url} — ${error.message}`);
  },
});

// ─── Build Requests ───────────────────────────────────────────────────────────

const requests = [];

// 1. Global Reddit search po keyword-u (svi subredditi odjednom)
for (const keyword of keywords) {
  requests.push({
    url: `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=${sortBy}&t=${timeFilter}&limit=${maxPostsPerSearch}`,
    userData: { type: 'search', keyword, subreddit: 'all', page: 0 },
  });
}

// 2. Subreddit-specific search (restrict_sr=1)
for (const keyword of keywords) {
  for (const subreddit of subreddits) {
    requests.push({
      url: `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(keyword)}&restrict_sr=1&sort=${sortBy}&t=${timeFilter}&limit=${maxPostsPerSearch}`,
      userData: { type: 'search', keyword, subreddit, page: 0 },
    });
  }
}

log.info(`Starting ${requests.length} initial requests...`);
await crawler.run(requests);

log.info('\nDone. Check Apify Dataset for results.');
await Actor.exit();

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildPostRecord(post, keyword, subreddit) {
  return {
    source:        'Reddit',
    subreddit:     `r/${post.subreddit}`,
    keyword_used:  keyword,
    post_id:       post.id,
    title:         post.title,
    body:          post.selftext?.slice(0, 3000) ?? '',
    url:           `https://reddit.com${post.permalink}`,
    upvotes:       post.score,
    comment_count: post.num_comments,
    author:        post.author,
    flair:         post.link_flair_text ?? '',
    posted_at:     new Date(post.created_utc * 1000).toISOString(),
    scraped_at:    new Date().toISOString(),
  };
}
