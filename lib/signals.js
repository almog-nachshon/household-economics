// When to enter and exit: a signal per holding from its own price trend (RSI and the 50 / 200-day averages, from
// lib/market.js) plus, for US stocks, the analysts' consensus and the next earnings date from Finnhub's official API
// (free key, FINNHUB_API_KEY). The Finviz page is linked for a look by eye.
const FINNHUB = "https://finnhub.io/api/v1";
const DAY = 24 * 3600 * 1000;

export const finvizUrl = (symbol) => `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}`;
// Finviz covers US listings only: not the London funds (.L) or the metals (=F).
export const onFinviz = (symbol) => !/[.=]/.test(symbol);

async function get(path) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${FINNHUB}${path}&token=${key}`, { next: { revalidate: 43200 } });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

// The latest month's analyst counts as a 1 (strong buy) to 5 (strong sell) average, like Finviz's "Recom".
async function analysts(symbol) {
  const r = (await get(`/stock/recommendation?symbol=${encodeURIComponent(symbol)}`))?.[0];
  const n = r ? r.strongBuy + r.buy + r.hold + r.sell + r.strongSell : 0;
  if (!n) return null;
  return { score: (r.strongBuy + 2 * r.buy + 3 * r.hold + 4 * r.sell + 5 * r.strongSell) / n, buy: r.strongBuy + r.buy, hold: r.hold, sell: r.sell + r.strongSell };
}

async function nextEarnings(symbol) {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 90 * DAY).toISOString().slice(0, 10);
  const list = (await get(`/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(symbol)}`))?.earningsCalendar ?? [];
  const date = list.map((e) => e.date).sort()[0];
  return date ? new Date(`${date}T00:00:00Z`) : null;
}

const pct = (x) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;

// enter (🟢 a dip inside an uptrend) / ok (⚪ nothing special, buy by the plan) / wait (🟡 overheated or results due)
// / exit (🔴 the long trend broke or analysts turned against it), with the reasons in Hebrew.
export function signalOf(q, extra = {}) {
  const { an, earnings } = extra;
  const exit = [], wait = [], enter = [];
  if (q.sma200 != null && q.sma200 <= -0.05) exit.push(`${pct(q.sma200)} מתחת לממוצע 200 הימים: מגמת העלייה הארוכה נשברה`);
  if (an && an.score >= 3.5) exit.push(`רוב האנליסטים לא ממליצים (${an.sell} מכירה, ${an.hold} החזקה, ${an.buy} קנייה)`);
  if (q.rsi != null && q.rsi >= 70) wait.push(`RSI ${Math.round(q.rsi)}: עלתה מהר, ״מחוממת״. עדיף לחכות לירידה`);
  const days = earnings ? Math.ceil((earnings - Date.now()) / DAY) : null;
  if (days != null && days >= 0 && days <= 7) wait.push(`דוח רבעוני בעוד ${days} ימים: תנודה חדה אפשרית`);
  if (q.sma200 != null && q.sma200 > 0 && q.rsi != null && q.rsi <= 45) enter.push(`ירידה זמנית (RSI ${Math.round(q.rsi)}) בתוך מגמת עלייה (מעל ממוצע 200 הימים)`);
  if (an && an.score <= 2 && enter.length) enter.push(`האנליסטים ממליצים לקנות (${an.buy} מתוך ${an.buy + an.hold + an.sell})`);
  const [level, reasons] = exit.length ? ["exit", exit] : wait.length ? ["wait", wait] : enter.length ? ["enter", enter] : ["ok", ["אין סימן מיוחד: אפשר לקנות לפי התוכנית"]];
  return { level, reasons, rsi: q.rsi, sma50: q.sma50, sma200: q.sma200, fromHigh: q.fromHigh, analysts: an, earnings, days };
}

// Signals for these candidates (from loadMarket's bySymbol), with Finnhub's analysts and earnings for US stocks.
export async function signalsFor(bySymbol, symbols) {
  const out = {};
  await Promise.all(
    [...new Set(symbols)].filter((s) => bySymbol[s] && !bySymbol[s].error).map(async (s) => {
      const q = bySymbol[s];
      const stock = onFinviz(s) && q.type === "EQUITY"; // Yahoo's instrumentType: funds have no analysts or earnings
      const [an, earnings] = stock ? await Promise.all([analysts(s), nextEarnings(s)]) : [null, null];
      out[s] = signalOf(q, { an, earnings });
    }),
  );
  return out;
}

export const SIGNAL = {
  enter: ["🟢", "זמן טוב להיכנס"],
  ok: ["⚪", "אפשר לקנות לפי התוכנית"],
  wait: ["🟡", "עדיף לחכות"],
  exit: ["🔴", "לשקול יציאה"],
};
