import { quote, ilsRates } from "@/lib/market";

// What the monthly review chooses from. Every candidate gets real 1-year numbers (lib/market.js);
// the Claude advisor (lib/advisor.js) picks 5-6 of them and the split each month.
// London (.L) funds are Irish UCITS: no US estate tax and 15% dividend withholding instead of 25% for Israelis.
export const BUCKETS = [
  {
    key: "long",
    name: "טווח ארוך: קרנות מחקות מדד",
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
    key: "metals",
    name: "מתכות (המתכת עצמה, לא קרן)",
    candidates: [
      ["GC=F", "זהב: באינטראקטיב XAUUSD (ספוט)"],
      ["SI=F", "כסף: באינטראקטיב XAGUSD (ספוט)"],
      ["HG=F", "נחושת: אין ספוט באינטראקטיב, רק חוזה עתידי (HG/MHG)", null, false],
    ],
  },
  {
    key: "stocks",
    name: "טווח בינוני-קצר: מניות",
    candidates: [
      ["NVDA", "NVIDIA"],
      ["AMD", "AMD"],
      ["MSFT", "Microsoft"],
      ["GOOGL", "Alphabet"],
      ["AMZN", "Amazon"],
      ["META", "Meta Platforms"],
      ["AVGO", "Broadcom"],
      ["TSM", "TSMC"],
      ["AAPL", "Apple"],
      ["PLTR", "Palantir"],
    ],
  },
];

// Target share of the monthly deposit per bucket; the advisor may move each by up to 5 points.
export const PROFILES = {
  conservative: { name: "שמרני", split: { long: 70, metals: 20, stocks: 10 } },
  balanced: { name: "מאוזן", split: { long: 55, metals: 15, stocks: 30 } },
  aggressive: { name: "אגרסיבי", split: { long: 40, metals: 10, stocks: 50 } },
};

export const CANDIDATES = Object.fromEntries(
  BUCKETS.flatMap((b) => b.candidates.map(([symbol, name, index, buyable = true]) => [symbol, { symbol, name, index, buyable, bucket: b.key }])),
);

// IBKR buys fractions of US shares; London funds are bought in whole units. Metals are shown in ounces.
export const isMetal = (symbol) => CANDIDATES[symbol]?.bucket === "metals";
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

// Turns the advisor's percentages into this month's ILS amounts and units to buy.
export function sizePicks(picks, monthlyInvest, bySymbol) {
  const sized = picks.map((p) => {
    const q = bySymbol[p.symbol] || {};
    const amount = (monthlyInvest * p.pct) / 100;
    const units = q.priceIls ? (fractional(p.symbol) ? amount / q.priceIls : Math.floor(amount / q.priceIls)) : null;
    return { ...p, name: q.name, bucket: q.bucket, priceIls: q.priceIls, amount, units, cost: units != null ? units * q.priceIls : amount };
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
