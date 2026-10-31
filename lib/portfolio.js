import { db } from "@/lib/db";
import { quote, ilsRates } from "@/lib/market";

// The monthly split: 7 holdings in five buckets with fixed shares, plus physical metals whose share (0-15%)
// the advisor decides each month; the other buckets shrink in proportion. A bucket's share is split evenly
// between its picks.
// Every candidate gets real 1-year numbers (lib/market.js); the Claude advisor (lib/advisor.js) picks which
// candidates fill the places, and without it the best risk-adjusted momentum score does.
// London (.L) funds are Irish UCITS: no US estate tax and 15% dividend withholding instead of 25% for Israelis.
export const BUCKETS = [
  {
    key: "index",
    name: "קרנות סל מחקות מדד",
    pct: 40,
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
    pct: 5,
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
    // Photonics (optical networking for AI data centers), the user's pick: one stock in their priority order, not by
    // score (COHR first), and an alert when one of them turns to a buy signal. Very volatile.
    key: "photonics",
    name: "פוטוניקה",
    pct: 10,
    count: 1,
    ordered: true,
    watch: true,
    candidates: [
      ["COHR", "Coherent"],
      ["AAOI", "Applied Optoelectronics"],
      ["AXTI", "AXT Inc"],
      ["GLW", "Corning"],
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
    const listed = b.candidates.map(([s]) => bySymbol[s]).filter((q) => !q.error && !broken(q));
    const ranked = b.ordered ? listed : listed.sort((x, y) => y.score - x.score);
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
  COHR: "קוהרנט: לייזרים ומשדרי-מקלט אופטיים (טרנסיברים) לחיבור שרתי AI במרכזי נתונים. השחקנית המרכזית בפוטוניקה.",
  AAOI: "אפלייד אופטואלקטרוניקס: טרנסיברים אופטיים מהירים למרכזי נתונים (לקוחות כמו מיקרוסופט ואמזון). קטנה ותנודתית מאוד.",
  AXTI: "AXT: מצעים (ווייפרים) מאינדיום-פוספיד וגליום-ארסניד, חומר הגלם ללייזרים אופטיים. ייצור בסין, סיכון רגולטורי.",
  GLW: "קורנינג: סיבים אופטיים וכבלים למרכזי נתונים, וגם זכוכית Gorilla לטלפונים. הוותיקה והיציבה מבין הארבע.",
  "GC=F": "זהב: מקלט בזמני משבר ואינפלציה. בנקים מרכזיים קונים.",
  "SI=F": "כסף: מתכת יקרה ותעשייתית (סולארי, אלקטרוניקה). תנודתי יותר מזהב.",
  "HG=F": "נחושת: מדד לצמיחה התעשייתית וחשמול. לא נסחרת כספוט באינטראקטיב.",
};

// What goes on the buy list: only a 🟢 "time to enter" signal (lib/signals.js), and for a stock with analyst coverage
// a buy-side consensus (Finnhub's average 2.5 or better on the 1 strong buy - 5 strong sell scale, like Finviz's Recom).
export const greenLight = (g) => g?.level === "enter" && (!g.analysts || g.analysts.score <= 2.5);

// Cash the split leaves over goes straight down the ranking (best score first), to a holding already in the
// portfolio or a new name alike, as long as it is green (greenLight), so nothing waits idle: each next one gets up
// to a third of it in whole units, then what remains buys more of the first ones while a unit fits. Skips what is
// already on the list (`taken`) and a second fund on an index already held (`indexes`, except that fund itself:
// `held`). Amounts in ILS.
export function extraPicks(ranked, signals, leftover, taken, indexes, held = new Set()) {
  const slice = leftover / 3;
  let left = leftover;
  const out = [];
  for (const q of ranked) {
    const g = signals[q.symbol];
    if (!q.priceIls || !greenLight(g) || taken.has(q.symbol) || (q.index && indexes.has(q.index) && !held.has(q.symbol))) continue;
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

// Funds and stocks that lean on the same big tech names, for the concentration check.
const TECH = new Set(["NVDA", "AMD", "XLK", "SMH", "QQQM", "COHR", "AAOI", "AXTI"]);

// "What next" for the portfolio as it is: buckets well over / under their target (the next deposits fix it, no
// selling), tech concentration, earnings coming for what is held, exit signals, cash kept for a pick that waits,
// metals, and that new cash is split here on the next refresh. rows: holdings in ILS with their bucket; signals from lib/signals.js. Each step: {icon, text}.
export function nextSteps({ rows, cash, signals, waiting, metalsPct, money }) {
  const held = rows.reduce((t, h) => t + h.value, 0);
  const steps = [];
  if (!held) return steps;
  const pctOf = (x) => Math.round((x / held) * 100);
  for (const b of BUCKETS) {
    const target = bucketPct(b, metalsPct);
    const value = rows.filter((h) => h.bucket === b.key).reduce((t, h) => t + h.value, 0);
    const share = pctOf(value);
    if (share > target + 5) steps.push({ icon: "⬆️", text: `${b.name}: ${share}% מהתיק מול יעד של ${Math.round(target)}%. לא מוסיפים לשם כסף חדש (גם לא באופציות); הכסף הבא שייכנס יאזן את זה לבד.` });
    else if (target > 0 && share < target - 5) {
      const buyable = b.candidates.map(([s]) => s).filter((s) => greenLight(signals[s]));
      steps.push({
        icon: "⬇️",
        text: buyable.length
          ? `${b.name}: ${share}% מהתיק מול יעד של ${Math.round(target)}%. הכסף הפנוי יופנה לשם קודם.`
          : `${b.name}: ${share}% מהתיק מול יעד של ${Math.round(target)}%, אבל לאף מניה בתחום (${b.candidates.map(([s]) => s).join(", ")}) אין כרגע סימן קנייה. הכסף מחכה, ותגיע התראה כשאחת תהפוך ל-🟢.`,
      });
    }
  }
  const tech = rows.filter((h) => TECH.has(h.symbol));
  const techShare = pctOf(tech.reduce((t, h) => t + h.value, 0));
  if (techShare >= 30) steps.push({ icon: "⚠️", text: `ריכוז בטכנולוגיה: ${techShare}% מהתיק ב-${tech.map((h) => h.symbol).join(", ")}, ועוד חלק בקרנות המדד (NVIDIA ואפל ומיקרוסופט בכולן). כדאי לא להוסיף טכנולוגיה עד שהחלק הזה יירד.` });
  for (const h of rows) {
    const g = signals[h.symbol];
    if (g?.earnings && g.days != null && g.days >= 0 && g.days <= 30)
      steps.push({ icon: "📅", text: `דוח רבעוני של ${h.symbol} ב-${g.earnings.toLocaleDateString("he-IL", { timeZone: "UTC" })}: תנודה חדה אפשרית. לא לקנות עוד יום-יומיים לפני הדוח.` });
    if (g?.level === "exit") steps.push({ icon: "🔴", text: `${h.symbol}: ${g.reasons[0]}. לבדוק אם להמשיך להחזיק.` });
  }
  if (waiting.length) steps.push({ icon: "⏳", text: `${waiting.map((p) => p.symbol).join(", ")}: בתוכנית אבל עוד לא בירוק. לא שומרים להן כסף; הכסף הולך עכשיו למה שבירוק, והן ייכנסו כשהסימן יתחלף.` });
  if (!metalsPct) steps.push({ icon: "🥇", text: "מתכות: 0% כרגע. להוסיף אחרי שאינטראקטיב יאשר את ההרשאה, ורק אם מגמת הירידה של הזהב והכסף תיגמר." });
  steps.push({ icon: "🔄", text: "כל כסף שנכנס לחשבון מתחלק כאן לבד אחרי ״רענון מאינטראקטיב״: לפי מה שחסר בתיק, עם סימני כניסה מעודכנים, כך שהחשבון מנוצל במלואו." });
  steps.push({ icon: "🧾", text: "לא למכור כדי לאזן: מכירה ברווח = 25% מס רווחי הון ועמלות. מאזנים דרך ההפקדות הבאות." });
  return steps;
}

// With holdings: the cash tops up the buckets furthest below target (gapShares), one holding per bucket, preferably
// one already held there, so the money adds units rather than names. It needs the green light (greenLight: 🟢 and
// analysts on the buy side) and a unit that fits the bucket's slice; a new name only when nothing held fits (the plan's pick
// first, then the best score, never a second fund on an index already held). Plan picks skipped for a 🟡 / 🔴 signal
// come back in `waiting`.
export function topUp({ held, bySymbol, signals, amount, metalsPct, chosen }) {
  const shares = gapShares(held, amount, metalsPct) ?? Object.fromEntries(BUCKETS.map((b) => [b.key, bucketPct(b, metalsPct)]));
  const level = (s) => signals[s]?.level;
  const buyable = (s) => bySymbol[s] && !bySymbol[s].error && bySymbol[s].buyable && bySymbol[s].priceIls && greenLight(signals[s]);
  const heldIndexes = new Set(held.map((h) => bySymbol[h.symbol]?.index).filter(Boolean));
  const plan = Object.fromEntries(chosen.map((c) => [c.symbol, c]));
  const picks = [];
  const waiting = [];
  for (const b of BUCKETS) {
    const pct = shares[b.key] ?? 0;
    const budget = (amount * pct) / 100;
    if (budget < 1) continue;
    const mine = held.filter((h) => h.bucket === b.key).map((h) => h.symbol)
      .sort((x, y) => (level(x) === "enter" ? 0 : 1) - (level(y) === "enter" ? 0 : 1) || (bySymbol[y]?.score ?? -9) - (bySymbol[x]?.score ?? -9));
    const planned = chosen.map((c) => c.symbol).filter((s) => CANDIDATES[s]?.bucket === b.key && !mine.includes(s));
    const listed = b.candidates.map(([s]) => s).filter((s) => !mine.includes(s) && !planned.includes(s));
    const others = b.ordered ? listed : listed.sort((x, y) => (bySymbol[y]?.score ?? -9) - (bySymbol[x]?.score ?? -9));
    const fresh = (s) => !bySymbol[s]?.index || !heldIndexes.has(bySymbol[s].index);
    const s = [...mine, ...planned.filter(fresh), ...others.filter(fresh)].find((s) => buyable(s) && bySymbol[s].priceIls <= budget);
    for (const p of planned) if (p !== s && ["wait", "exit"].includes(level(p))) waiting.push({ ...bySymbol[p], reason: plan[p]?.reason });
    if (!s) continue;
    const c = plan[s] ?? {};
    picks.push({
      ...bySymbol[s], pct, topUp: mine.includes(s), by: c.reason ? "ai" : "score",
      reason: c.reason ?? null, about: c.about, sector: c.sector, eps: c.eps, analysts: c.analysts, outlook: c.outlook, conviction: c.conviction,
    });
  }
  return { picks, waiting, shares };
}
