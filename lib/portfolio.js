import { quote, ilsRates } from "@/lib/market";

// Investment buckets, from safest to riskiest. Every bucket has 5-6 real candidates; each month the
// best-scoring ones (lib/market.js: risk-adjusted momentum) get that month's money.
// London (.L) funds are Irish UCITS: no US estate tax and 15% dividend withholding instead of 25% for Israelis.
export const BUCKETS = [
  {
    key: "core",
    name: "קרנות סל מחקות מדד (ליבה)",
    count: 2,
    candidates: [
      ["CSPX.L", "iShares Core S&P 500 (UCITS, צוברת)", "sp500"],
      ["VUAA.L", "Vanguard S&P 500 (UCITS, צוברת)", "sp500"],
      ["VWRA.L", "Vanguard FTSE All-World (UCITS, צוברת)"],
      ["SWDA.L", "iShares Core MSCI World (UCITS, צוברת)"],
      ["CNDX.L", "iShares Nasdaq 100 (UCITS, צוברת)"],
      ["EIMI.L", "iShares Core MSCI Emerging Markets (UCITS, צוברת)"],
    ],
  },
  {
    key: "sector",
    name: "קרנות סל סקטוריאליות",
    count: 2,
    candidates: [
      ["SMH", "VanEck Semiconductor"],
      ["IUIT.L", "iShares S&P 500 Information Technology (UCITS)"],
      ["XLV", "Health Care Select Sector SPDR"],
      ["XLF", "Financial Select Sector SPDR"],
      ["ITA", "iShares U.S. Aerospace & Defense"],
      ["XLE", "Energy Select Sector SPDR"],
    ],
  },
  {
    key: "stocks",
    name: "מניות בודדות",
    count: 3,
    candidates: [
      ["MSFT", "Microsoft"],
      ["NVDA", "NVIDIA"],
      ["GOOGL", "Alphabet"],
      ["AMZN", "Amazon"],
      ["META", "Meta Platforms"],
      ["AVGO", "Broadcom"],
    ],
  },
  {
    key: "risk",
    name: "סיכון גבוה (חלופה להון סיכון)",
    count: 2,
    candidates: [
      ["ARKK", "ARK Innovation ETF"],
      ["IBIT", "iShares Bitcoin Trust"],
      ["IWM", "iShares Russell 2000 (חברות קטנות)"],
      ["PLTR", "Palantir"],
      ["IONQ", "IonQ"],
      ["RKLB", "Rocket Lab"],
    ],
  },
];

// Share of the monthly deposit per bucket.
export const PROFILES = {
  conservative: { name: "שמרני", split: { core: 80, sector: 10, stocks: 10, risk: 0 } },
  balanced: { name: "מאוזן", split: { core: 65, sector: 15, stocks: 15, risk: 5 } },
  aggressive: { name: "אגרסיבי", split: { core: 50, sector: 15, stocks: 20, risk: 15 } },
};

// IBKR buys fractions of US shares only; London-listed funds are bought in whole units.
export const fractional = (symbol) => !symbol.includes(".");

// Keeps last month's holdings while they still rank within count + 1, so a small dip doesn't
// cause a switch every month; the remaining places go to the best-scoring candidates.
// Two funds tracking the same index (same `index` tag) are never picked together.
function choose(bucket, ranked, held) {
  const keepLimit = bucket.count + 1;
  const chosen = [];
  const fits = (q) => !chosen.includes(q) && !(q.index && chosen.some((c) => c.index === q.index));
  for (const q of ranked.filter((q, i) => held.includes(q.symbol) && i < keepLimit)) {
    if (chosen.length < bucket.count && fits(q)) chosen.push(q);
  }
  for (const q of ranked) {
    if (chosen.length >= bucket.count) break;
    if (fits(q)) chosen.push(q);
  }
  return chosen.map((q) => ({ ...q, action: held.length === 0 ? "start" : held.includes(q.symbol) ? "keep" : "new" }));
}

// The month's plan: every candidate's numbers, the picks per bucket, and ILS/share amounts.
export async function buildPlan({ monthlyInvest, profile, held }) {
  const split = (PROFILES[profile] || PROFILES.balanced).split;
  const info = Object.fromEntries(BUCKETS.flatMap((b) => b.candidates.map(([s, name, index]) => [s, { name, index }])));
  const quotes = await Promise.all(Object.keys(info).map(quote));
  const bySymbol = Object.fromEntries(quotes.map((q) => [q.symbol, { ...q, ...info[q.symbol] }]));
  let rates = {};
  let rateError = null;
  try {
    rates = await ilsRates(quotes.filter((q) => !q.error).map((q) => q.currency));
  } catch (e) {
    rateError = e.message;
  }

  const buckets = BUCKETS.map((b) => {
    const all = b.candidates.map(([s]) => bySymbol[s]);
    const ranked = all.filter((q) => !q.error).sort((x, y) => y.score - x.score);
    const heldHere = held.filter((h) => h.bucket === b.key).map((h) => h.symbol);
    const pct = split[b.key];
    const chosen = pct > 0 ? choose(b, ranked, heldHere) : [];
    const priceOf = (q) => (rates[q.currency] ? q.price * rates[q.currency] : null);
    const picks = chosen.map((pick) => {
      const amount = (monthlyInvest * pct) / 100 / chosen.length;
      // A whole unit this month's amount can't buy: switch to a cheaper fund on the same index (CSPX -> VUAA).
      const twin = !fractional(pick.symbol) && priceOf(pick) > amount
        && ranked.find((t) => t !== pick && t.index && t.index === pick.index && priceOf(t) <= amount);
      const q = twin ? { ...twin, action: pick.action, swappedFrom: pick.symbol } : pick;
      const priceIls = priceOf(q);
      const units = priceIls ? (fractional(q.symbol) ? amount / priceIls : Math.floor(amount / priceIls)) : null;
      return { ...q, bucket: b.key, pct: pct / chosen.length, amount, priceIls, units, cost: units != null ? units * priceIls : null };
    });
    const dropped = heldHere.filter((s) => !picks.some((p) => p.symbol === s)).map((s) => bySymbol[s] || { symbol: s });
    return { ...b, pct, all: ranked.concat(all.filter((q) => q.error)), picks, dropped };
  });

  const picks = buckets.flatMap((b) => b.picks);
  const spent = picks.reduce((t, p) => t + (p.cost ?? 0), 0);
  return { buckets, picks, usdIls: rates.USD, rateError, leftover: monthlyInvest - spent };
}

// The monthly review window: when the salary has arrived, between the 10th and the 12th.
export const REVIEW_DAYS = [10, 12];
export function reviewStatus(today = new Date()) {
  const d = today.getDate();
  const open = d >= REVIEW_DAYS[0] && d <= REVIEW_DAYS[1];
  const next = d < REVIEW_DAYS[0]
    ? new Date(today.getFullYear(), today.getMonth(), REVIEW_DAYS[0])
    : new Date(today.getFullYear(), today.getMonth() + 1, REVIEW_DAYS[0]);
  return { open, next };
}
