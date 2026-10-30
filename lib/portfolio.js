import { db } from "@/lib/db";
import { quote, ilsRates } from "@/lib/market";

// The monthly split: 6 holdings in four buckets with fixed shares, plus physical metals whose share (0-15%)
// the advisor decides each month; the other buckets shrink in proportion. A bucket's share is split evenly
// between its picks.
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
  {
    key: "metals",
    name: "מתכות (המתכת עצמה, לא קרן)",
    pct: null,
    count: 1,
    candidates: [
      ["GC=F", "זהב: באינטראקטיב XAUUSD (ספוט)"],
      ["SI=F", "כסף: באינטראקטיב XAGUSD (ספוט)"],
      ["HG=F", "נחושת: אין ספוט באינטראקטיב, רק חוזה עתידי (למעקב בלבד)", null, false],
    ],
  },
];

export const METALS_MAX = 15;
export const DEFAULT_METALS_PCT = 10;

// Each bucket's share of the deposit once the month's metals share is set.
export const bucketPct = (b, metalsPct) => (b.key === "metals" ? metalsPct : (b.pct * (100 - metalsPct)) / 100);

export const CANDIDATES = Object.fromEntries(
  BUCKETS.flatMap((b) => b.candidates.map(([symbol, name, index, buyable = true]) => [symbol, { symbol, name, index, buyable, bucket: b.key }])),
);

// Everything is bought in whole units (shares, fund units, ounces of metal): the user's IBKR account
// does not trade fractions.
export const fractional = () => false;
export const isMetal = (symbol) => CANDIDATES[symbol]?.bucket === "metals";

// Real numbers for every candidate plus the ILS rates to price them.
// A candidate that the IBKR product search did not find (lib/ibkr.js) is not bought or picked; each one found
// carries its exact instrument (conid) for the link to IBKR.
export async function loadMarket() {
  const [quotes, contracts] = await Promise.all([Promise.all(Object.keys(CANDIDATES).map(quote)), db.ibkrContract.findMany()]);
  const ib = Object.fromEntries(contracts.map((c) => [c.symbol, c]));
  const bySymbol = Object.fromEntries(quotes.map((q) => {
    const c = ib[q.symbol];
    return [q.symbol, { ...CANDIDATES[q.symbol], ...q, ...(c && { ibkr: c.conid ? c : null, buyable: CANDIDATES[q.symbol].buyable && Boolean(c.conid) }) }];
  }));
  let rates = {};
  let rateError = null;
  try {
    rates = await ilsRates(quotes.filter((q) => !q.error).map((q) => q.currency));
  } catch (e) {
    rateError = e.message;
  }
  for (const q of quotes) if (rates[q.currency]) bySymbol[q.symbol].priceIls = q.price * rates[q.currency];
  return { bySymbol, usdIls: rates.USD, usdFx: rates.fx?.USD, rateError };
}

// A holding whose single unit costs more than its whole bucket's amount can't be bought this month.
export const affordable = (q, amount, pct) => !q.priceIls || q.priceIls <= (amount * pct) / 100;

// With holdings, a deposit tops up the buckets furthest below their share of the whole (holdings + deposit) instead
// of splitting by the fixed shares, so the portfolio moves toward the target split. held: [{bucket, value}] in ILS.
// Returns each bucket's % of this deposit, or null when nothing is held yet.
export function gapShares(held, amount, metalsPct) {
  const total = held.reduce((t, h) => t + h.value, 0);
  if (!total) return null;
  const now = {};
  for (const h of held) now[h.bucket] = (now[h.bucket] ?? 0) + h.value;
  const need = Object.fromEntries(BUCKETS.map((b) => [b.key, Math.max(0, (bucketPct(b, metalsPct) / 100) * (total + amount) - (now[b.key] ?? 0))]));
  const sum = Object.values(need).reduce((t, x) => t + x, 0);
  return sum ? Object.fromEntries(Object.entries(need).map(([k, x]) => [k, (x / sum) * 100])) : null;
}

// Fills each bucket's places: the advisor's choices first (when valid), then the best scores.
// Two funds tracking the same index are never picked together. `shares` (from gapShares) overrides the fixed split.
// `done`: symbols already bought for this deposit; each takes up its place in its bucket and is not offered again, and
// the places left keep their own slice (the bucket's share / its count), so what was bought is not re-split.
export function completePicks(chosen, bySymbol, amount, metalsPct, shares = null, done = new Set()) {
  return BUCKETS.flatMap((b) => {
    const pct = shares ? shares[b.key] ?? 0 : bucketPct(b, metalsPct);
    const places = b.count - [...done].filter((s) => CANDIDATES[s]?.bucket === b.key).length;
    if (pct <= 0 || places <= 0) return [];
    const picks = [];
    const fits = (q) =>
      q && !q.error && q.buyable && q.bucket === b.key && !done.has(q.symbol) && affordable(q, amount, pct) &&
      !picks.some((p) => p.symbol === q.symbol || (q.index && p.index === q.index));
    for (const c of chosen) {
      const q = bySymbol[c.symbol];
      if (picks.length < places && fits(q)) picks.push({ ...q, reason: c.reason, about: c.about, sector: c.sector, eps: c.eps, analysts: c.analysts, outlook: c.outlook, conviction: c.conviction, by: "ai" });
    }
    // By score, never one whose long trend broke (5%+ under its 200-day average, the exit signal in lib/signals.js):
    // its money stays as cash instead.
    const broken = (q) => q.sma200 != null && q.sma200 <= -0.05;
    const ranked = b.candidates.map(([s]) => bySymbol[s]).filter((q) => !q.error && !broken(q)).sort((x, y) => y.score - x.score);
    for (const q of ranked) if (picks.length < places && fits(q)) picks.push({ ...q, reason: null, by: "score" });
    return picks.map((p) => ({ ...p, pct: pct / b.count }));
  });
}

// Whole units to buy for each pick: first as many as fit in its share, then the cash left buys extra units for
// the picks furthest below their target (rounding to the nearest unit, never over the total). The shown amount
// and % are what is actually bought.
export function sizePicks(picks, monthlyInvest) {
  const sized = picks.map((p) => {
    const target = (monthlyInvest * p.pct) / 100;
    return { ...p, target, units: p.priceIls ? Math.floor(target / p.priceIls) : null };
  });
  const cost = (p) => (p.units != null ? p.units * p.priceIls : p.target);
  let left = monthlyInvest - sized.reduce((t, p) => t + cost(p), 0);
  for (;;) {
    const next = sized
      .filter((p) => p.units != null && p.priceIls <= left && p.target - cost(p) >= p.priceIls / 2)
      .sort((x, y) => (y.target - cost(y)) / y.priceIls - (x.target - cost(x)) / x.priceIls)[0];
    if (!next) break;
    next.units += 1;
    left -= next.priceIls;
  }
  const out = sized.map((p) => ({ ...p, amount: cost(p), cost: cost(p), pct: (cost(p) / monthlyInvest) * 100, targetPct: p.pct }));
  // A pick whose single unit costs more than its share gets no units this month: it is listed apart, not bought.
  return { picks: out.filter((p) => p.units !== 0), skipped: out.filter((p) => p.units === 0), leftover: left };
}

// The monthly review and deposit day: the 10th, when the salary is in.
export const REVIEW_DAY = 10;
export function reviewStatus(today = new Date()) {
  const due = today.getDate() >= REVIEW_DAY;
  const next = new Date(today.getFullYear(), today.getMonth() + (due ? 1 : 0), REVIEW_DAY);
  return { due, next };
}

// One line about each candidate, shown in the candidates table.
export const ABOUT = {
  VOO: "500 החברות הגדולות בארה״ב. דמי ניהול 0.03%. רשומה בארה״ב (מס דיבידנד 25%).",
  "CSPX.L": "S&P 500, קרן אירית צוברת. דמי ניהול 0.07%, מס דיבידנד 15%, בלי מס עיזבון אמריקאי.",
  "VUAA.L": "S&P 500 של ונגארד, קרן אירית צוברת. דמי ניהול 0.07%, יחידה זולה יותר מ-CSPX.",
  "VWRA.L": "כ-3,700 מניות מכל העולם (כ-60% ארה״ב). קרן אירית צוברת, דמי ניהול 0.19%.",
  VTI: "כל שוק המניות האמריקאי, כולל חברות בינוניות וקטנות. דמי ניהול 0.03%.",
  QQQM: "100 החברות הגדולות בנאסד״ק, מוטה טכנולוגיה. דמי ניהול 0.15%.",
  SMH: "25 חברות השבבים הגדולות (NVIDIA, TSMC, Broadcom). תנודתית.",
  XLK: "סקטור הטכנולוגיה ב-S&P 500 (Apple, Microsoft, NVIDIA).",
  XLV: "סקטור הבריאות: תרופות, ביטוח בריאות, ציוד רפואי. דפנסיבי יחסית.",
  XLF: "סקטור הפיננסים: בנקים, ביטוח, כרטיסי אשראי.",
  XLE: "סקטור האנרגיה: נפט וגז (Exxon, Chevron). תלוי במחיר הנפט.",
  XLI: "סקטור התעשייה: תעופה, רכבות, מכונות, ביטחון.",
  ITA: "קרן ביטחון ותעופה אמריקאית, משוקללת לפי גודל (RTX, Lockheed, GE Aerospace).",
  XAR: "קרן ביטחון ותעופה במשקל שווה: יותר חשיפה לחברות בינוניות.",
  LMT: "לוקהיד מרטין: F-35, טילים, חלל. הספקית הגדולה של הפנטגון.",
  RTX: "ריית׳און: מנועי מטוסים (Pratt & Whitney) ומערכות טילים (Patriot).",
  NOC: "נורת׳רופ גרומן: מפציץ B-21, חלל, טילים בליסטיים.",
  GD: "ג׳נרל דיינמיקס: צוללות, טנקים, מטוסי Gulfstream.",
  ESLT: "אלביט מערכות: החברה הביטחונית הגדולה בישראל, נסחרת בנאסד״ק.",
  NVDA: "המובילה בשבבי AI למרכזי נתונים.",
  AMD: "מעבדים ושבבי AI, המתחרה העיקרית של NVIDIA ו-Intel.",
  PLTR: "תוכנה לניתוח נתונים וממשלות, AI ארגוני. מכפילים גבוהים מאוד.",
  TSLA: "רכבים חשמליים, אגירת אנרגיה, נהיגה אוטונומית ורובוטיקה. תנודתית מאוד.",
  RKLB: "שיגורי לוויינים קטנים ורכיבי חלל. חברה צעירה, סיכון גבוה.",
  IONQ: "מחשוב קוונטי. בשלב מוקדם, סיכון גבוה מאוד.",
  "GC=F": "זהב: מקלט בזמני משבר ואינפלציה. בנקים מרכזיים קונים.",
  "SI=F": "כסף: מתכת יקרה ותעשייתית (סולארי, אלקטרוניקה). תנודתי יותר מזהב.",
  "HG=F": "נחושת: מדד לצמיחה התעשייתית וחשמול. לא נסחרת כספוט באינטראקטיב.",
};

// Cash a deposit leaves over goes down the ranking to more candidates with a buy signal (lib/signals.js: enter or ok,
// never wait / exit), so it does not sit idle: each next one gets up to a third of it in whole units, then what remains
// buys more of the first ones while a unit fits. Skips what is already planned or bought (`taken`) and a second fund
// on an index already held (`indexes`). ranked: candidates best score first; amounts in ILS.
export function extraPicks(ranked, signals, leftover, taken, indexes) {
  const slice = leftover / 3;
  let left = leftover;
  const out = [];
  for (const q of ranked) {
    const g = signals[q.symbol];
    if (!q.priceIls || !g || !["enter", "ok"].includes(g.level) || taken.has(q.symbol) || (q.index && indexes.has(q.index))) continue;
    const units = Math.floor(Math.min(slice, left) / q.priceIls) || (q.priceIls <= left ? 1 : 0);
    if (!units) continue;
    out.push({ ...q, units, signal: g });
    left -= units * q.priceIls;
    if (q.index) indexes.add(q.index);
  }
  for (const p of out) {
    while (p.priceIls <= left) {
      p.units += 1;
      left -= p.priceIls;
    }
  }
  return { extras: out.map((p) => ({ ...p, cost: p.units * p.priceIls })), left };
}
