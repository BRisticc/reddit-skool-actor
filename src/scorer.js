/**
 * scorer.js
 * Čist keyword-based pain scoring. Nema AI, nema external API.
 * Sve reči dolaze iz Apify Input-a — 100% konfigurisano od strane korisnika.
 */

// Skool-specifični regex amplifikatori (uvek se proveravaju, nezavisno od korisnikovih reči)
const SKOOL_AMPLIFIERS = [
  { pattern: /\d+\s*members?\s*(left|leaving|gone|churned)/i, weight: 20 },
  { pattern: /lost\s+\d+\s*members?/i,                        weight: 20 },
  { pattern: /hours?\s+(a\s+)?(week|day)\s*(on|doing|just)/i, weight: 16 },
  { pattern: /nobody\s+(posts?|engages?|responds?|comments?)/i, weight: 18 },
  { pattern: /members\s+aren'?t\s+(posting|engaging|active)/i, weight: 18 },
  { pattern: /can'?t\s+(collect|get|find|send|export)\s+email/i, weight: 16 },
  { pattern: /doing\s+(this\s+)?manually/i,                    weight: 14 },
  { pattern: /skool\s+(doesn'?t|can'?t|has\s+no|is\s+missing)/i, weight: 16 },
  { pattern: /wish\s+skool\s+(had|would|could|supported)/i,    weight: 14 },
  { pattern: /\$\d+.*wast/i,                                   weight: 16 },
  { pattern: /not\s+scalable/i,                                weight: 14 },
  { pattern: /ghost\s+town/i,                                  weight: 18 },
  { pattern: /rented\s+land/i,                                 weight: 18 },
  { pattern: /leaky\s+bucket/i,                                weight: 16 },
  { pattern: /black\s+box/i,                                   weight: 14 },
  { pattern: /after\s+\d+\s+months?\s+still/i,                weight: 18 },
];

// Kategorije — keyword mapping
export const CATEGORIES = {
  'Onboarding & Engagement':   ['onboard', 'welcome', 'engage', 'nobody posts', 'ghost town', 'new member', 'first post', 'activate', 'drop off after joining'],
  'Churn & Retention':         ['churn', 'leaving', 'cancel', 'quit', 'retention', 'drop off', 'losing members', 'leaky bucket', 'shrinking'],
  'Email & CRM Integration':   ['email', 'crm', 'activecampaign', 'gohighlevel', 'ghl', 'mailchimp', 'collect email', 'email list', 'zapier', 'rented land'],
  'Platform Limitations':      ['limitation', "can't", "skool doesn't", "skool can't", 'no way to', 'manually', 'missing feature', 'no automation'],
  'Funnel Architecture':        ['funnel', 'landing page', 'upsell', 'free to paid', 'conversion', 'upgrade path', 'paid tier'],
  'Automation & Integrations': ['automate', 'automation', 'webhook', 'make.com', 'zapier', 'api', 'trigger', 'workflow'],
  'Analytics & Reporting':     ['analytics', 'dashboard', 'report', 'metrics', 'stats', 'kpi', 'insight'],
  'Community Management':      ['manage', 'moderate', 'content calendar', 'admin', 'posting schedule'],
};

/**
 * Scoruje post/komentar za pain signal.
 * @param {string} text - Tekst koji se scoruje
 * @param {string[]} userPainWords - Pain reči iz Apify Input-a
 * @returns {{ painScore, signal, matchedWords, matchedPatterns }}
 */
export function scorePain(text, userPainWords) {
  if (!text) return { painScore: 0, signal: '🔵 Low', matchedWords: [], matchedPatterns: [] };

  const lower = text.toLowerCase();

  // 1. Broji korisnikove pain reči
  const matchedWords = userPainWords.filter(w => lower.includes(w.toLowerCase()));

  // 2. Broji Skool-specifične pattern-e
  const matchedPatterns = SKOOL_AMPLIFIERS.filter(a => a.pattern.test(text));
  const patternScore    = matchedPatterns.reduce((sum, a) => sum + a.weight, 0);

  // 3. Bonus za specifičnost
  const bonus =
    (/\$\d+/.test(text)                          ? 12 : 0) +
    (/\d+\s*(members?|hours?|months?|%)/i.test(text) ? 10 : 0) +
    (/skool/i.test(text)                          ? 8  : 0) +
    (text.includes('?')                           ? 6  : 0);

  const score = Math.min(matchedWords.length * 13 + patternScore + bonus, 100);

  return {
    painScore:       score,
    signal:          score >= 50 ? '🔥 High' : score >= 25 ? '🟡 Medium' : '🔵 Low',
    matchedWords:    matchedWords.slice(0, 6),
    matchedPatterns: matchedPatterns.map(a => a.pattern.source).slice(0, 4),
  };
}

/**
 * Kategorišiše tekst na osnovu keyword mapping-a.
 */
export function categorize(text) {
  const lower = text.toLowerCase();
  let best = { cat: 'General / Other', score: 0 };
  for (const [cat, kws] of Object.entries(CATEGORIES)) {
    const s = kws.filter(kw => lower.includes(kw)).length;
    if (s > best.score) best = { cat, score: s };
  }
  return best.cat;
}

/**
 * Izvlači konkretne VOC rečenice koje sadrže pain language.
 */
export function extractVocQuotes(text, userPainWords, max = 5) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 28 && s.length < 280)
    .filter(s => {
      const lower = s.toLowerCase();
      return userPainWords.some(w => lower.includes(w.toLowerCase())) ||
             SKOOL_AMPLIFIERS.some(a => a.pattern.test(s)) ||
             /skool|members?|community|zapier|email|churn/i.test(s);
    })
    .slice(0, max);
}
