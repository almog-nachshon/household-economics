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

// IBKR buys fractions of US shares; London funds are bought in whole units. Metals are shown in ounces.
export const fractional = (symbol) => !symbol.endsWith(".L");
export const isMetal = (symbol) => CANDIDATES[symbol]?.bucket === "metals";

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
export const affordable = (q, amount, pct, count) => fractional(q.symbol) || !q.priceIls || q.priceIls <= (amount * pct) / 100 / count;

// Fills each bucket's places: the advisor's choices first (when valid), then the best scores.
// Two funds tracking the same index are never picked together.
export function completePicks(chosen, bySymbol, amount, metalsPct) {
  return BUCKETS.flatMap((b) => {
    const pct = bucketPct(b, metalsPct);
    if (pct <= 0) return [];
    const picks = [];
    const fits = (q) =>
      q && !q.error && q.buyable && q.bucket === b.key && affordable(q, amount, pct, b.count) &&
      !picks.some((p) => p.symbol === q.symbol || (q.index && p.index === q.index));
    for (const c of chosen) {
      const q = bySymbol[c.symbol];
      if (picks.length < b.count && fits(q)) picks.push({ ...q, reason: c.reason, about: c.about, analysts: c.analysts, outlook: c.outlook, conviction: c.conviction, by: "ai" });
    }
    const ranked = b.candidates.map(([s]) => bySymbol[s]).filter((q) => !q.error).sort((x, y) => y.score - x.score);
    for (const q of ranked) if (picks.length < b.count && fits(q)) picks.push({ ...q, reason: null, by: "score" });
    return picks.map((p) => ({ ...p, pct: pct / b.count }));
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
