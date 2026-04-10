/**
 * Relevance filter v2 — Skool signal OBAVEZAN.
 *
 * Post/komentar mora:
 *  1. Eksplicitno pominjati "skool" kao platformu (ne "school" typo)
 *  2. Imati creator ili problem signal
 *  3. Proći anti-spam/promo check
 *
 * Bez "skool" reči → automatski odbacuje, bez obzira na pain score.
 */

// ── SPAM / PROMO — odmah odbaci ─────────────────────────────────────────────
const SPAM_PATTERNS = [
  /join\s+my\s+skool/i,
  /check\s+out\s+my\s+skool/i,
  /use\s+my\s+(link|code|referral)/i,
  /affiliate\s+(link|code|program)/i,
  /discount\s+code|promo\s+code/i,
  /sign\s+up\s+(using|with|through)\s+my/i,
  /dm\s+(me\s+)?for\s+(access|invite|link)/i,
  /free\s+skool\s+community.*join/i,
];

// ── "school" kontekst — odbaci ───────────────────────────────────────────────
const SCHOOL_PATTERNS = [
  /skool\s+(bus|teacher|student|class|grade|homework|lesson|kid|child|K-12|principal|curriculum|district)/i,
  /(teacher|student|principal|homework|curriculum)\s+.*skool/i,
  /back\s+to\s+skool/i,
];

// ── Creator ownership signals ─────────────────────────────────────────────────
const CREATOR_PATTERNS = [
  /(my|our)\s+(skool\s+(community|group|membership)|community\s+on\s+skool)/i,
  /I\s+(run|own|manage|built|launched|created|started|have)\s+(a\s+)?skool/i,
  /running\s+(a|my)\s+skool/i,
  /skool\s+community\s+owner/i,
  /community\s+owner.{0,50}skool/i,
  /course\s+creator.{0,60}skool/i,
  /membership\s+site.{0,60}skool/i,
  /coaching\s+(business|program).{0,60}skool/i,
  /(moved?|switch(ed|ing)?|migrat).{0,40}(to|from)\s+skool/i,
  /(considering|thinking\s+about|evaluating)\s+skool/i,
  /(left|leaving|cancel).{0,30}skool/i,
];

// ── Problem / technical signals ───────────────────────────────────────────────
const PROBLEM_PATTERNS = [
  // Direct failures
  /skool.{0,80}(can'?t|doesn'?t|won'?t|not\s+working|broken|missing|no\s+way|impossible)/i,
  /skool.{0,80}(problem|issue|bug|error|limitation|frustrat|failing|failed)/i,
  /(problem|issue|struggle|frustrat|stuck|help).{0,80}skool/i,
  // API / automation technical
  /skool.{0,60}(zapier|webhook|api|make\.com|n8n|pabbly|automation)/i,
  /(zapier|webhook|make\.com|n8n).{0,60}skool/i,
  /skool.{0,40}(429|403|404|invalid|expired|auth|token|session_id)/i,
  // CRM / email
  /skool.{0,60}(email|crm|ghl|gohighlevel|activecampaign|mailchimp|convertkit|hubspot)/i,
  // Payment / cancellation
  /skool.{0,60}(stripe|payment|checkout|cancel|refund|subscription|billing)/i,
  /(cancel|remov|revok).{0,40}skool.{0,40}(member|access|account|subscription)/i,
  // Engagement pain
  /(ghost\s+town|nobody\s+posts|members?\s+not\s+(engaging|posting|active)|churn).{0,60}skool/i,
  /skool.{0,60}(ghost\s+town|churn|retention|engagement\s+(problem|issue|dropping))/i,
  // How-to (unresolved)
  /how\s+(do\s+I|can\s+I|to).{0,60}skool/i,
  /skool.{0,60}how\s+(do\s+I|can\s+I|to)/i,
  // Wish / missing
  /(wish|need|missing|lacks?).{0,40}skool/i,
  /skool.{0,40}(wish|need|missing|lacks?)/i,
  // Comparison
  /skool\s+vs\s+\w+/i,
  /(\w+)\s+vs\s+skool/i,
  // Course / content delivery
  /skool.{0,60}(drip|course|lesson|module|classroom|certificate|quiz|video)/i,
  // Manual work
  /doing.{0,20}manually.{0,40}skool/i,
  /skool.{0,40}(manually|manual\s+(work|process|removal|approval))/i,
  // Onboarding
  /skool.{0,60}(onboarding|welcome\s+(dm|message|sequence)|new\s+member)/i,
];

// ─── Score ────────────────────────────────────────────────────────────────────
export function scoreRelevance(text) {
  if (!text || text.length < 20) return { relevant: false, score: 0, reason: 'too_short' };

  // 1. Spam → reject
  if (SPAM_PATTERNS.some(p => p.test(text))) {
    return { relevant: false, score: 0, reason: 'spam_promo' };
  }

  // 2. School context → reject
  if (SCHOOL_PATTERNS.some(p => p.test(text))) {
    return { relevant: false, score: 0, reason: 'school_context' };
  }

  // 3. MUST mention Skool explicitly — hard gate
  const mentionsSkool = /\bskool\b/i.test(text);
  if (!mentionsSkool) {
    return { relevant: false, score: 0, reason: 'no_skool_mention' };
  }

  let score = 0;
  const signals = [];

  // Skool mention base (+15)
  score += 15;
  signals.push('skool_mention');

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

  // Length bonus
  if (text.length > 300) score += 10;
  if (text.length > 600) score += 10;

  // Question = unresolved problem
  if (text.includes('?')) score += 8;

  // Must have at least creator OR problem signal (not just Skool mention)
  const relevant = (creatorMatches.length > 0 || problemMatches.length > 0);

  return {
    relevant,
    score:   Math.min(score, 100),
    signals,
    reason:  relevant ? 'passes' : 'skool_mention_only',
  };
}

export function shouldFetchPost(title, preview = '') {
  const combined = `${title} ${preview}`;
  // Hard gate: must mention skool
  if (!/\bskool\b/i.test(combined)) return false;
  const { relevant, score } = scoreRelevance(combined);
  return relevant || score >= 20 || CREATOR_PATTERNS.some(p => p.test(combined));
}
