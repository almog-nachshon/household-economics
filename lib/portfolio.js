import { quote, ilsRates } from "@/lib/market";

// The monthly split: 6 holdings in four fixed buckets. Each bucket's share is split evenly between its picks.
// Every candidate gets real 1-year numbers (lib/market.js); the Claude advisor (lib/advisor.js) picks which
// candidates fill the places, and without it the best risk-adjusted momentum score does.
// London (.L) funds are Irish UCITS: no US estate tax and 15% dividend withholding instead of 25% for Israelis.
export const BUCKETS = [
  {
    key: "index",
    name: "קרנות סל מחקות מדד",
    pct: 45,
    count: 2,
    candidates: [
      ["VOO", "Vanguard S&P 500", "sp500"],
      ["CSPX.L", "iShares Core S&P 500 (UCITS, צוברת)", "sp500"],
      ["VUAA.L", "Vanguard S&P 500 (UCITS, צוברת)", "sp500"],
      ["VWRA.L", "Vanguard FTSE All-World (UCITS, צוברת)"],
      ["VTI", "Vanguard Total US Stock Market"],
      ["QQQM", "Invesco Nasdaq 100"],
    ],
  },
  {
    key: "sector",
    name: "קרנות סל סקטוריאליות",
    pct: 10,
    count: 1,
    candidates: [
      ["SMH", "VanEck Semiconductor"],
      ["XLK", "Technology Select Sector SPDR"],
      ["XLV", "Health Care Select Sector SPDR"],
      ["XLF", "Financial Select Sector SPDR"],
      ["XLE", "Energy Select Sector SPDR"],
      ["XLI", "Industrial Select Sector SPDR"],
    ],
  },
  {
    key: "defense",
    name: "ביטחוניות",
    pct: 25,
    count: 2,
    candidates: [
      ["ITA", "iShares U.S. Aerospace & Defense (קרן)"],
      ["XAR", "SPDR S&P Aerospace & Defense (קרן)"],
      ["LMT", "Lockheed Martin"],
      ["RTX", "RTX (Raytheon)"],
      ["NOC", "Northrop Grumman"],
      ["GD", "General Dynamics"],
      ["ESLT", "Elbit Systems (אלביט)"],
    ],
  },
  {
    key: "risk",
    name: "מניות סיכון",
    pct: 20,
    count: 1,
    candidates: [
      ["NVDA", "NVIDIA"],
      ["AMD", "AMD"],
      ["PLTR", "Palantir"],
      ["TSLA", "Tesla"],
      ["RKLB", "Rocket Lab"],
      ["IONQ", "IonQ"],
    ],
  },
];

export const CANDIDATES = Object.fromEntries(
  BUCKETS.flatMap((b) => b.candidates.map(([symbol, name, index]) => [symbol, { symbol, name, index, bucket: b.key }])),
);

// IBKR buys fractions of US shares; London funds are bought in whole units.
export const fractional = (symbol) => !symbol.endsWith(".L");

// Real numbers for every candidate plus the ILS rates to price them.
export async function loadMarket() {
  const quotes = await Promise.all(Object.keys(CANDIDATES).map(quote));
  const bySymbol = Object.fromEntries(quotes.map((q) => [q.symbol, { ...CANDIDATES[q.symbol], ...q }]));
  let rates = {};
  let rateError = null;
  try {
    rates = await ilsRates(quotes.filter((q) => !q.error).map((q) => q.currency));
  } catch (e) {
    rateError = e.message;
  }
  for (const q of quotes) if (rates[q.currency]) bySymbol[q.symbol].priceIls = q.price * rates[q.currency];
  return { bySymbol, usdIls: rates.USD, rateError };
}

// A London fund whose single unit costs more than its monthly amount can't be bought this month.
export const affordable = (q, monthlyInvest, bucket) =>
  fractional(q.symbol) || !q.priceIls || q.priceIls <= (monthlyInvest * bucket.pct) / 100 / bucket.count;

// Fills each bucket's places: the advisor's choices first (when valid), then the best scores.
// Two funds tracking the same index are never picked together.
export function completePicks(chosen, bySymbol, monthlyInvest) {
  return BUCKETS.flatMap((b) => {
    const picks = [];
    const fits = (q) =>
      q && !q.error && q.bucket === b.key && affordable(q, monthlyInvest, b) &&
      !picks.some((p) => p.symbol === q.symbol || (q.index && p.index === q.index));
    for (const c of chosen) {
      const q = bySymbol[c.symbol];
      if (picks.length < b.count && fits(q)) picks.push({ ...q, reason: c.reason, by: "ai" });
    }
    const ranked = b.candidates.map(([s]) => bySymbol[s]).filter((q) => !q.error).sort((x, y) => y.score - x.score);
    for (const q of ranked) if (picks.length < b.count && fits(q)) picks.push({ ...q, reason: null, by: "score" });
    return picks.map((p) => ({ ...p, pct: b.pct / b.count }));
  });
}

// ILS amount and units to buy for each pick.
export function sizePicks(picks, monthlyInvest) {
  const sized = picks.map((p) => {
    const amount = (monthlyInvest * p.pct) / 100;
    const units = p.priceIls ? (fractional(p.symbol) ? amount / p.priceIls : Math.floor(amount / p.priceIls)) : null;
    return { ...p, amount, units, cost: units != null ? units * p.priceIls : amount };
  });
  return { picks: sized, leftover: monthlyInvest - sized.reduce((t, p) => t + p.cost, 0) };
}

// The monthly review and deposit day: the 10th, when the salary is in.
export const REVIEW_DAY = 10;
export function reviewStatus(today = new Date()) {
  const due = today.getDate() >= REVIEW_DAY;
  const next = new Date(today.getFullYear(), today.getMonth() + (due ? 1 : 0), REVIEW_DAY);
  return { due, next };
}
