const DAY = 24 * 3600 * 1000;
const STALE_DAYS = 30;

// Claude and ChatGPT, 50/50 (the user's choice, 8.11.2026): the score is the average of the two, and the verdict
// comes from it by the same thresholds, except that when one says buy and the other sell, it is a wait. ChatGPT's
// research counts only when it is no more than STALE_DAYS older than Claude's. Pure, for lib/research.test.mjs.
export const verdictOf = (score) => (score >= 0.6 ? "buy" : score <= -0.4 ? "sell" : "wait");
export function combine(claude, gpt) {
  const one = { score: claude.score, verdict: claude.verdict, claude: { score: claude.score, verdict: claude.verdict }, gpt: null };
  if (!gpt || claude.asOf - gpt.asOf > STALE_DAYS * DAY) return one;
  const score = Math.round(((claude.score + gpt.score) / 2) * 100) / 100;
  const split = [claude.verdict, gpt.verdict].includes("buy") && [claude.verdict, gpt.verdict].includes("sell");
  return { score, verdict: split ? "wait" : verdictOf(score), split, claude: one.claude, gpt: { score: gpt.score, verdict: gpt.verdict, asOf: gpt.asOf } };
}


// ChatGPT's target split by theme (% of the whole account), from the research the user entered on the site on
// 7.11.2026 (55% index funds, 20% AI and chips, 15% defense, 5% defense AI = PLTR, which the app keeps under AI, 5% cash).
// Claude's is BUCKETS in lib/portfolio.js; the table shows both and their 50/50 average.
export const GPT_TARGETS = { asOf: "2026-11-07", pct: { index: 55, sector: 0, defense: 15, ai: 25, risk: 0, space: 0, nuclear: 0, photonics: 0, metals: 0, cash: 5 } };
export const mixTarget = (claude, gpt) => (claude == null && gpt == null ? null : ((claude ?? 0) + (gpt ?? 0)) / 2);
