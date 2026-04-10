/**
 * Post/comment relevance filter.
 * Odbacuje sve što nije creator koji priča o Skool problemu.
 *
 * Da bi se sačuvao, post mora:
 *  1. Biti o Skool-u KAO PLATFORMI (ne misspelling "school")
 *  2. Imati creator signal ILI problem signal ILI comparison signal
 *  3. Proći anti-spam check
 */

// ── SPAM / PROMO — odmah odbaci ─────────────────────────────────────────────
const SPAM_PATTERNS = [
  /join\s+my\s+skool/i,
  /check\s+out\s+my\s+skool/i,
  /use\s+my\s+(link|code|referral)/i,
  /affiliate\s+(link|code|program)/i,
  /discount\s+code|promo\s+code/i,
  /sign\s+up\s+(using|with|through)\s+my/i,
  /free\s+skool\s+community.*join/i,    // promo invite
  /dm\s+(me\s+)?for\s+(access|invite|link)/i,
];

// ── "school" kontekst — odbaci ───────────────────────────────────────────────
const SCHOOL_PATTERNS = [
  /skool\s+(bus|teacher|student|class|grade|homework|lesson|kid|child|K-12|principal|curriculum|district|superintendent)/i,
  /(teacher|student|principal|homework|curriculum)\s+.*skool/i,
  /back\s+to\s+skool/i,           // retail/fashion seasonal
];

// ── Creator ownership signals ─────────────────────────────────────────────────
const CREATOR_PATTERNS = [
  // Direct ownership
  /(my|our)\s+(skool\s+(community|group|membership)|community\s+on\s+skool)/i,
  /I\s+(run|own|manage|built|launched|created|started|have)\s+(a\s+)?skool/i,
  /running\s+(a|my)\s+skool/i,
  /skool\s+community\s+owner/i,
  /community\s+owner.{0,50}skool/i,
  /(launched|building|growing)\s+(my\s+)?(skool|community)/i,
  // Course/membership creator context
  /course\s+creator.{0,60}skool/i,
  /membership\s+site.{0,60}skool/i,
  /coaching\s+(business|program).{0,60}skool/i,
  // Migration/evaluation
  /(moved?|switch(ed|ing)?|migrat).{0,40}(to|from)\s+skool/i,
  /(considering|thinking\s+about|evaluating)\s+skool/i,
  /(left|leaving|cancel).{0,30}skool/i,
];

// ── Problem / question signals ────────────────────────────────────────────────
const PROBLEM_PATTERNS = [
  // Direct complaints
  /skool.{0,80}(can'?t|doesn'?t|won'?t|not\s+working|broken|missing|limited|no\s+way)/i,
  /skool.{0,80}(problem|issue|bug|error|limitation|frustrat)/i,
  /(problem|issue|struggle|frustrat|stuck|help).{0,80}skool/i,
  // Feature-specific pain
  /skool.{0,60}(email|automation|zapier|crm|analytics|webhook|api|ghl)/i,
  // Engagement/retention pain
  /(ghost\s+town|nobody\s+posts|members?\s+not\s+(engaging|posting|active)|churn).{0,60}skool/i,
  /skool.{0,60}(ghost\s+town|churn|retention|engagement\s+(problem|issue|dropping))/i,
  // How-to questions (unresolved problems)
  /how\s+(do\s+I|can\s+I|to).{0,60}skool/i,
  /skool.{0,60}how\s+(do\s+I|can\s+I|to)/i,
  // Wish/missing features
  /(wish|hope|need).{0,40}skool.{0,40}(had|would|could|support)/i,
  /skool.{0,40}(wish|hope|need|missing|lacks?)/i,
  // Comparison from creator PoV
  /skool\s+vs\s+\w+|(\w+)\s+vs\s+skool/i,
  /(better|worse)\s+(than|alternative\s+to)\s+skool/i,
  /(leaving|left)\s+(kajabi|circle|mighty|teachable|discord).{0,40}skool/i,
  /(leaving|left)\s+skool.{0,40}(kajabi|circle|mighty|teachable|discord)/i,
];

// ── Relevance score ───────────────────────────────────────────────────────────
export function scoreRelevance(text) {
  if (!text || text.length < 30) return { relevant: false, score: 0, reason: 'too_short' };

  // 1. Spam check — immediate reject
  if (SPAM_PATTERNS.some(p => p.test(text))) {
    return { relevant: false, score: 0, reason: 'spam_promo' };
  }

  // 2. School context check — reject
  if (SCHOOL_PATTERNS.some(p => p.test(text))) {
    return { relevant: false, score: 0, reason: 'school_context' };
  }

  // 3. Must mention Skool as a platform
  const mentionsSkool = /\bskool\b/i.test(text);

  let score = 0;
  const signals = [];

  // Creator ownership signals (+40 each)
  const creatorMatches = CREATOR_PATTERNS.filter(p => p.test(text));
  if (creatorMatches.length > 0) {
    score += creatorMatches.length * 40;
    signals.push('creator_signal');
  }

  // Problem signals (+25 each)
  const problemMatches = PROBLEM_PATTERNS.filter(p => p.test(text));
  if (problemMatches.length > 0) {
    score += problemMatches.length * 25;
    signals.push('problem_signal');
  }

  // Skool mention bonus
  if (mentionsSkool) {
    score += 15;
    signals.push('skool_mention');
  }

  // Long-form = more context = more likely genuine
  if (text.length > 300) score += 10;
  if (text.length > 600) score += 10;

  // Question mark = unresolved problem
  if (text.includes('?')) score += 8;

  // Must have at least one signal to be relevant
  const relevant = score >= 30 && (creatorMatches.length > 0 || problemMatches.length > 0);

  return {
    relevant,
    score: Math.min(score, 100),
    signals,
    reason: relevant ? 'passes' : 'no_relevant_signal',
  };
}

/**
 * Check if a post + its comments have any relevant content.
 * Returns true if we should deep-scrape this post.
 */
export function shouldFetchPost(title, preview = '') {
  const combined = `${title} ${preview}`;
  const { relevant, score } = scoreRelevance(combined);
  // Lower threshold for title-only check (we haven't seen full body yet)
  return relevant || score >= 20 || CREATOR_PATTERNS.some(p => p.test(combined));
}
