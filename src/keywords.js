/**
 * Keyword generator — produces 1000+ unique search queries.
 * Organized in tiers: branded → competitors → pain points → niches → questions.
 */

export function generateKeywords() {
  const keywords = new Set();

  // ── TIER 1: Direct Skool branded ────────────────────────────────────────────
  const skoolTerms = [
    'skool', 'skool.com', 'skool platform', 'skool community',
    'skool app', 'skool membership', 'skool course',
  ];

  const directModifiers = [
    // Reviews & opinion
    'review', 'honest review', 'real review', 'worth it', 'legit', 'scam',
    'experience', 'pros cons', 'good or bad', 'is it good',
    // Pricing
    'pricing', 'price', 'cost', 'subscription cost', 'monthly fee', 'free trial', 'free plan',
    // Problems
    'problems', 'issues', 'not working', 'broken', 'bugs', 'error',
    'limitations', 'missing features', 'feature request', 'roadmap',
    'support', 'customer service', 'help', 'stuck', 'frustrated',
    'refund', 'cancel', 'cancellation',
    // Comparisons
    'vs', 'alternative', 'alternatives', 'competitor', 'comparison', 'or',
    'better than', 'worse than', 'switch from', 'migrate from',
    // Features
    'email', 'email list', 'email collection', 'automation', 'automate',
    'analytics', 'dashboard', 'reporting', 'metrics', 'stats',
    'leaderboard', 'games', 'gamification', 'points', 'levels',
    'affiliate', 'affiliate program', 'referral',
    'zapier', 'make.com', 'integration', 'integrations', 'api', 'webhooks',
    'crm', 'activecampaign', 'gohighlevel', 'ghl', 'mailchimp', 'convertkit',
    'onboarding', 'welcome sequence', 'engagement', 'retention', 'churn',
    'drip content', 'modules', 'classroom', 'course content',
    'community feed', 'notifications', 'moderation', 'admin tools',
    'mobile app', 'ios', 'android',
    'landing page', 'sales page', 'funnel', 'upsell', 'checkout',
    'masterclass', 'coaching', 'mentorship', 'group coaching',
    'live sessions', 'live calls', 'zoom integration',
    'white label', 'custom domain', 'branding',
    // Time-sensitive
    '2024', '2025', 'this year', 'update', 'new features',
    // People
    'sam ovens', 'alex hormozi', 'andrew huberman', 'iman gadzhi',
    'dan henry', 'russell brunson',
    // Actions
    'tutorial', 'setup', 'setup guide', 'how to use', 'getting started',
    'tips', 'tricks', 'best practices', 'strategy',
    // Community types
    'for coaches', 'for course creators', 'for fitness', 'for entrepreneurs',
    'for creators', 'for consultants', 'for freelancers',
  ];

  for (const term of skoolTerms) {
    for (const mod of directModifiers) {
      keywords.add(`${term} ${mod}`);
      keywords.add(`${mod} ${term}`);
    }
  }

  // ── TIER 2: Competitor comparisons ──────────────────────────────────────────
  const competitors = [
    'kajabi', 'circle', 'circle.so', 'mighty networks', 'mightynetworks',
    'teachable', 'thinkific', 'podia', 'kartra', 'gohighlevel', 'go high level',
    'discord', 'slack', 'facebook groups', 'facebook group', 'telegram', 'whatsapp groups',
    'patreon', 'substack', 'beehiiv', 'convertkit', 'systeme.io',
    'heartbeat', 'bettermode', 'tribe', 'hivebrite', 'vanilla forums',
    'learnworlds', 'memberpress', 'wishlist member', 'membervault',
    'new zenler', 'pathwright', 'absorb lms', 'talentlms', 'docebo',
    'community.com', 'geneva app', 'flarum', 'discourse',
    'wordpress membership', 'memberful', 'paid memberships pro',
    'outseta', 'uscreen', 'vimeo ott', 'wix', 'squarespace communities',
  ];

  for (const comp of competitors) {
    keywords.add(`skool vs ${comp}`);
    keywords.add(`${comp} vs skool`);
    keywords.add(`${comp} problems`);
    keywords.add(`${comp} issues`);
    keywords.add(`${comp} alternatives`);
    keywords.add(`${comp} review`);
    keywords.add(`${comp} honest review`);
    keywords.add(`leaving ${comp}`);
    keywords.add(`switching from ${comp}`);
    keywords.add(`${comp} pricing too expensive`);
    keywords.add(`${comp} worth it`);
    keywords.add(`${comp} not working`);
    keywords.add(`${comp} limitations`);
    keywords.add(`moved from ${comp} to skool`);
    keywords.add(`migrated to skool from ${comp}`);
    keywords.add(`${comp} community engagement problems`);
    keywords.add(`${comp} churn members`);
    keywords.add(`${comp} email marketing`);
    keywords.add(`${comp} automation missing`);
    keywords.add(`${comp} vs skool which is better`);
  }

  // ── TIER 3: Generic community pain points (platform agnostic) ────────────────
  const communityPains = [
    'members not engaging', 'community ghost town', 'online community dead',
    'nobody posts in my community', 'community members leaving', 'community churn',
    'low engagement community', 'community not growing', 'how to engage members',
    'community email list problem', 'community automation problem',
    'membership site churn', 'online course community engagement',
    'community platform automation', 'community platform email collection',
    'community platform analytics missing', 'community platform zapier',
    'online community platform comparison', 'best community platform 2024',
    'community platform pricing', 'membership community platform review',
    'online course platform problems', 'course creator community platform',
    'how to build online community', 'grow online community fast',
    'online community monetization', 'paid community platform',
    'community platform for coaches', 'coaching community platform',
    'community platform for course creators', 'mastermind community platform',
    'community platform gamification', 'community platform leaderboard',
    'private community platform', 'exclusive membership community',
    'niche community platform', 'professional community platform',
    'community engagement dropping', 'keep members engaged community',
    'free to paid community upgrade', 'community member retention strategy',
    'onboarding community members', 'welcome new community members',
    'community moderation tools', 'community admin problems',
    'email list from community', 'collect emails membership site',
    'crm community integration', 'zapier community platform',
    'community analytics dashboard', 'member engagement metrics',
    'community revenue churn', 'reduce membership cancellations',
    'increase community engagement', 'community content strategy',
    'member posting frequency community', 'community post schedule',
    'reactivate ghost members', 'win back churned members',
    'upsell community members', 'upgrade free members to paid',
    'community landing page convert', 'membership funnel',
    'community referral program', 'affiliate for membership',
    'community white label', 'branded community platform',
    'community mobile app', 'community app push notifications',
    'custom domain community', 'sso community platform',
    'community drip content', 'content schedule membership',
    'live coaching community platform', 'group calls community platform',
    'zoom integration community', 'live events community',
    'community for fitness trainers', 'community for business coaches',
    'community for consultants', 'community for freelancers',
    'niche community monetization', 'build paid community from scratch',
    'launch online community', 'community launch strategy',
    'community pricing strategy', 'how much charge membership site',
    'membership site revenue', 'community mrr growth',
    'course platform comparison', 'lms vs community platform',
    'all in one course community platform', 'course plus community',
    'best platform online course community 2024',
    'migrating community platform', 'switching community software',
    'exporting members data', 'importing members new platform',
  ];

  communityPains.forEach(p => keywords.add(p));

  // ── TIER 4: People × platform ─────────────────────────────────────────────
  const people = [
    'sam ovens', 'alex hormozi', 'iman gadzhi', 'dan henry',
    'russell brunson', 'grant cardone', 'tai lopez', 'andrew tate',
    'hamza ahmed', 'charlie morgan', 'cole gordon', 'joel kaplan',
    'Andy Elliott', 'Simon Squibb', 'Codie Sanchez', 'Noah Kagan',
    'Pat Flynn', 'Amy Porterfield', 'Ryan Levesque', 'Todd Herman',
    'Brendon Burchard', 'Tony Robbins online community', 'Dean Graziosi',
  ];

  for (const person of people) {
    keywords.add(`${person} skool`);
    keywords.add(`${person} community platform`);
    keywords.add(`${person} online community`);
    keywords.add(`${person} membership site`);
    keywords.add(`${person} course platform`);
  }

  // ── TIER 5: Question-format long-tail ─────────────────────────────────────
  const questionStems = [
    'how to', 'why does', 'can you', 'is it possible to', 'how do I',
    'what is the best way to', 'does anyone know how to',
    'best way to', 'tips for', 'help with',
  ];

  const skoolActions = [
    'collect emails on skool', 'automate skool', 'export skool members',
    'integrate zapier with skool', 'add crm to skool', 'skool analytics',
    'skool onboarding sequence', 'increase engagement skool',
    'reduce churn skool', 'skool funnel', 'skool landing page',
    'skool affiliate program', 'skool webhooks', 'skool api',
    'skool email automation', 'skool ghl integration',
    'skool activecampaign', 'skool member tagging',
    'skool drip content', 'skool live calls',
    'skool white label', 'skool custom domain',
    'build community on skool', 'grow skool community',
    'monetize skool community', 'launch skool group',
    'skool pricing tiers', 'skool gamification setup',
    'skool leaderboard customization', 'skool vs kajabi choose',
  ];

  for (const stem of questionStems) {
    for (const action of skoolActions) {
      keywords.add(`${stem} ${action}`);
    }
  }

  // ── TIER 6: Niche × community pain ────────────────────────────────────────
  const niches = [
    // Health & Fitness
    'fitness', 'personal training', 'nutrition', 'yoga', 'meditation',
    'wellness', 'weight loss', 'bodybuilding', 'crossfit', 'running',
    // Finance & Business
    'real estate', 'investing', 'cryptocurrency', 'stocks', 'forex',
    'personal finance', 'financial coaching', 'business coaching',
    // Creative
    'photography', 'videography', 'filmmaking', 'video editing',
    'music production', 'graphic design', 'UI design', 'illustration',
    // Writing & Content
    'writing', 'copywriting', 'blogging', 'self publishing', 'podcasting',
    'content creation', 'social media management',
    // Tech
    'coding', 'programming', 'web development', 'no code', 'software development',
    // Professional Services
    'life coaching', 'executive coaching', 'career coaching', 'leadership coaching',
    'consulting', 'freelancing', 'agency owners', 'marketing agency',
    // E-commerce
    'dropshipping', 'amazon fba', 'ecommerce', 'print on demand', 'etsy sellers',
    // Self-improvement
    'productivity', 'mindset', 'self improvement', 'personal development',
    'parenting', 'relationships', 'dating coaching',
    // Niche online business
    'course creators', 'info products', 'digital products',
    'online education', 'e-learning', 'tutoring online',
  ];

  const nicheModifiers = [
    'community platform', 'online community', 'membership site',
    'skool community', 'course community', 'coaching community',
    'community engagement', 'member retention', 'community platform problems',
  ];

  for (const niche of niches) {
    for (const mod of nicheModifiers) {
      keywords.add(`${niche} ${mod}`);
    }
  }

  // ── TIER 7: Time + trend variants ─────────────────────────────────────────
  const trendTerms = [
    'skool community 2024', 'skool community 2025',
    'best online community platform 2024', 'best online community platform 2025',
    'top membership platforms 2024', 'community platform trends 2024',
    'skool update 2024', 'skool new features 2024',
    'online community growth 2024', 'paid community strategy 2025',
    'community led growth 2024', 'community led growth strategy',
    'online course business 2024', 'course creator problems 2024',
    'membership site trends 2024', 'membership economy 2024',
    'creator economy community platform', 'creator membership platform',
  ];

  trendTerms.forEach(t => keywords.add(t));

  const result = [...keywords];
  return result;
}

// ── SUBREDDITS (80+) ──────────────────────────────────────────────────────────

export const SUBREDDITS = [
  // Core entrepreneurship
  'entrepreneur', 'Entrepreneur', 'EntrepreneurRideAlong', 'AskEntrepreneurs',
  'smallbusiness', 'business', 'businessowners', 'startups', 'Startups',
  // Online business & income
  'onlinebusiness', 'passive_income', 'sidehustle', 'WorkOnline',
  'digitalnomad', 'digitalnomads', 'Fire', 'financialindependence',
  // Marketing
  'marketing', 'digitalmarketing', 'socialmediamarketing', 'content_marketing',
  'SEO', 'PPC', 'emailmarketing', 'growthhacking', 'inbound_marketing',
  'copywriting', 'advertising',
  // Sales & ecommerce
  'sales', 'ecommerce', 'dropshipping', 'affiliatemarketing', 'Flipping',
  'AmazonFBA', 'FulfillmentByAmazon',
  // Content creators
  'youtubers', 'NewTubers', 'podcasting', 'podcasts', 'contentcreation',
  'TikTokCreators', 'InstagramMarketing', 'blogging', 'vlogging',
  // Tech & SaaS
  'SaaS', 'webdev', 'web_design', 'nocode', 'automation', 'zapier',
  'ProductManagement', 'userexperience', 'webdesign', 'AppDev',
  // Coaching & consulting
  'freelance', 'freelanceWriters', 'consulting', 'coaching',
  'lifecoaching', 'ExecutiveCoaching', 'PersonalDevelopment',
  // Community & platforms
  'discordapp', 'communitybuilding', 'OnlineCommunity',
  // Course creation
  'onlinecourse', 'coursecreators', 'elearning', 'teachingonline',
  'instructionaldesign', 'EdTech',
  // Finance niches
  'realestateinvesting', 'RealEstate', 'investing', 'stocks',
  'CryptoCurrency', 'personalfinance', 'Entrepreneur',
  // Health & fitness
  'Fitness', 'personaltraining', 'bodybuilding', 'xxfitness',
  'loseit', 'nutrition', 'yoga',
  // Creative niches
  'photography', 'videography', 'filmmakers', 'editors', 'graphic_design',
  'musicproduction', 'learnart',
  // Writing & publishing
  'writing', 'selfpublishing', 'Kindle', 'worldbuilding',
  // Self improvement
  'selfimprovement', 'getdisciplined', 'productivity', 'Mindfulness',
  'socialskills', 'DecidingToBeBetter',
  // General
  'mildlyinfuriating', 'Advice', 'howto', 'malelivingspace',
];

// Priority keywords for targeted subreddit search (top 50 most relevant)
export const PRIORITY_KEYWORDS = [
  'skool', 'skool.com', 'skool community', 'skool platform',
  'skool vs kajabi', 'skool vs circle', 'skool vs mighty networks',
  'skool problems', 'skool review', 'skool worth it',
  'skool members not engaging', 'skool churn', 'skool email',
  'skool automation', 'skool limitations',
  'community platform problems', 'membership site churn',
  'members not engaging', 'ghost town community',
  'online community engagement', 'community platform comparison',
  'kajabi problems', 'circle problems', 'mighty networks problems',
  'sam ovens skool', 'alex hormozi skool',
  'course creator community', 'online community platform',
  'membership site problems', 'paid community platform',
  'community email list', 'community automation',
  'skool vs discord', 'skool affiliate', 'skool gamification',
  'how to grow online community', 'community member retention',
  'best community platform 2024', 'membership site review',
  'online course community', 'coaching community platform',
  'skool analytics', 'skool zapier', 'skool ghl',
  'leaving kajabi', 'switching to skool', 'skool alternative',
  'community platform zapier', 'membership churn strategy',
  'community engagement tips', 'course community platform',
];
