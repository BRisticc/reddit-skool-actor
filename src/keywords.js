/**
 * Creator-focused keyword list — precision over volume.
 *
 * Svaki keyword je dizajniran da nađe KREATORE koji imaju problem sa Skool-om.
 * Ne nalazimo: promo, "skool" typo, affiliate sadržaj, generalne review-e.
 * Nalazimo: creator koji traži pomoć, žali se, ili migrira.
 */

export const CREATOR_KEYWORDS = [
  // ── Direct creator ownership context ─────────────────────────────────────
  'my skool community',
  'my skool group',
  'my skool members',
  'running a skool community',
  'running my skool',
  'I run a skool community',
  'I own a skool community',
  'launched my skool',
  'building my skool community',
  'growing my skool',
  'skool community owner',
  'skool group owner',
  'skool community management',
  'managing my skool',
  'I have a skool community',

  // ── Engagement / retention pain (creator PoV) ────────────────────────────
  'skool community members not engaging',
  'skool members not posting',
  'skool members not active',
  'skool community ghost town',
  'skool ghost town',
  'nobody posts in my skool',
  'skool community engagement problem',
  'low engagement skool community',
  'skool member retention',
  'skool community churn',
  'members leaving my skool',
  'members churning skool',
  'skool free to paid conversion',
  'skool members never upgrade',
  'free members not converting skool',
  'reactivate skool members',
  'win back skool members',
  'skool onboarding sequence',
  'skool welcome sequence',
  'skool new member onboarding',

  // ── Email / CRM / Integration pain ──────────────────────────────────────
  'skool email collection',
  'skool email list',
  'collect emails skool',
  'skool email not working',
  'skool zapier integration',
  'skool zapier not working',
  'skool make.com integration',
  'skool webhook setup',
  'skool api integration',
  'skool crm integration',
  'skool gohighlevel integration',
  'skool ghl integration',
  'skool activecampaign integration',
  'skool mailchimp integration',
  'skool convertkit integration',
  'skool automation workflow',
  'automate skool community',
  'skool no automation',
  'skool manually',
  'doing everything manually skool',

  // ── Analytics / reporting pain ───────────────────────────────────────────
  'skool analytics missing',
  'skool analytics not enough',
  'skool member analytics',
  'skool dashboard metrics',
  'skool reporting limited',
  'skool insights',
  'skool member activity tracking',

  // ── Platform limitations ─────────────────────────────────────────────────
  'skool limitations',
  'skool platform limitations',
  'skool missing features',
  'skool feature request',
  'skool no white label',
  'skool custom domain',
  'skool no custom branding',
  'skool funnel limitation',
  'skool landing page problem',
  'skool upsell',
  'skool no upsell',
  'skool checkout problem',
  'skool pricing tiers problem',
  'skool gamification problem',
  'skool leaderboard issue',
  'skool moderation tools',
  'skool no drip content',
  'skool content scheduling',
  'skool mobile app problem',
  'skool notification problem',

  // ── Migration / comparison (creator evaluating) ──────────────────────────
  'switching to skool from kajabi',
  'switching from kajabi to skool',
  'left kajabi for skool',
  'moved community to skool',
  'migrated to skool',
  'moving from kajabi to skool',
  'kajabi to skool migration',
  'switching from circle to skool',
  'left circle for skool',
  'mighty networks to skool',
  'moving from mighty networks to skool',
  'leaving skool for kajabi',
  'leaving skool for circle',
  'cancelled skool',
  'leaving skool',
  'why I left skool',
  'skool vs kajabi for community',
  'skool vs circle for community',
  'skool vs mighty networks community',
  'skool vs discord for community',
  'skool alternative for community',
  'kajabi community vs skool community',
  'which platform for online community',
  'best platform for course community',
  'best platform for coaching community',
  'course creator community platform choice',

  // ── How-to / help (unresolved creator problems) ──────────────────────────
  'how to grow skool community',
  'how to increase skool engagement',
  'how to retain skool members',
  'how to onboard skool members',
  'how to collect emails on skool',
  'how to automate skool',
  'how to integrate zapier with skool',
  'how to set up skool funnel',
  'how to increase skool conversions',
  'how to reduce churn skool',
  'help with skool community',
  'skool community help',
  'struggling with skool community',
  'skool community not growing',
  'skool community problems',
  'skool issues',

  // ── Financial / ROI pain ──────────────────────────────────────────────────
  'skool not worth it',
  'skool too expensive',
  'skool roi problem',
  'wasting money on skool',
  'skool subscription not worth',
  'cancel skool subscription',
  'skool pricing worth it',
  'is skool worth the price for creators',

  // ── Influencer-created skool communities ─────────────────────────────────
  'sam ovens skool community',
  'alex hormozi skool',
  'skool community like hormozi',
  'skool games for community owners',
  'skool leaderboard for my community',
];

// ── Most relevant subreddits for Skool community creators ─────────────────────
export const CREATOR_SUBREDDITS = [
  // Direct fit — people running online businesses
  'entrepreneur', 'EntrepreneurRideAlong', 'AskEntrepreneurs',
  'onlinebusiness', 'smallbusiness',

  // Course / community creators
  'coursecreators', 'onlinecourse', 'elearning',

  // Marketing (community managers, digital marketers)
  'marketing', 'digitalmarketing', 'socialmediamarketing', 'growthhacking',

  // Coaching / consulting (heavy Skool users)
  'coaching', 'consulting', 'freelance',

  // Side hustle / passive income
  'sidehustle', 'passive_income',

  // Content creators
  'contentcreation', 'youtubers', 'podcasting',

  // SaaS / tools discussion
  'SaaS',
];

// ── Priority keywords for targeted subreddit search ──────────────────────────
// These are the highest-signal queries — run these on every subreddit
export const PRIORITY_KEYWORDS = [
  'my skool community',
  'skool community members not engaging',
  'skool community ghost town',
  'skool members not active',
  'skool zapier integration',
  'skool email collection',
  'skool crm integration',
  'skool limitations',
  'skool community churn',
  'switching from kajabi to skool',
  'leaving skool',
  'skool community not growing',
  'skool automation',
  'skool vs kajabi for community',
  'struggling with skool community',
  'cancelled skool',
  'skool analytics missing',
  'skool free to paid conversion',
  'skool community help',
  'how to grow skool community',
];
