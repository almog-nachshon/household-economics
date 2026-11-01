// One technical label per symbol, from Yahoo's daily bars (cached for 12 hours). The label is a ladder on the long trend,
// first chosen on a biased backtest. A cleaner test (docs/engine.md) found no proven edge in return for it: it describes the trend. Counting 23 indicators' votes, as Investing.com and TradingView
// do, did not separate later results and flipped about 30 times a year; the long trend did. See LADDER below.
//   strong buy: above the 200-day average, the 50-day above the 200-day, and at least 2 of the 3 medium checks;
//   buy: the same long trend with fewer medium checks; neutral: the long trend is mixed;
//   sell: below the 200-day, the 50-day below it, and at least 2 medium checks; strong sell: the same with fewer.
//   Medium checks: 6-month momentum skipping the last month, above the 50-day EMA, MACD above zero.
// A sell label is not a forecast of a fall. The 12 moving averages' and 11
// indicators' votes are still shown as detail. A snapshot only: what buys is the status in lib/research.js.
export const TECH = {
  "strong-buy": "קנייה חזקה",
  buy: "קנייה",
  neutral: "ניטרלי - אחזקה",
  sell: "מכירה",
  "strong-sell": "מכירה חזקה",
  "no-data": "אין מספיק נתונים להערכה",
};
const MA_PERIODS = [5, 10, 20, 50, 100, 200];
const HEADERS = { "User-Agent": "Mozilla/5.0" };

const sum = (a) => a.reduce((t, x) => t + x, 0);
const mean = (a) => sum(a) / a.length;
const sma = (a, n) => (a.length < n ? null : mean(a.slice(-n)));

// The whole EMA series, seeded with the first n values' average; shorter than the input by n - 1.
function emaSeries(a, n) {
  if (a.length < n) return [];
  const k = 2 / (n + 1);
  const out = [mean(a.slice(0, n))];
  for (let i = n; i < a.length; i++) out.push(a[i] * k + out[out.length - 1] * (1 - k));
  return out;
}
const lastOf = (a) => (a.length ? a[a.length - 1] : null);

// Wilder's smoothing of a series: the first n values' sum, then each step keeps (n - 1) / n of it.
function wilder(a, n) {
  if (a.length < n) return [];
  const out = [sum(a.slice(0, n))];
  for (let i = n; i < a.length; i++) out.push(out[out.length - 1] - out[out.length - 1] / n + a[i]);
  return out;
}

function rsi(c, n = 14) {
  const moves = c.slice(1).map((x, i) => x - c[i]);
  const up = wilder(moves.map((m) => Math.max(m, 0)), n);
  const down = wilder(moves.map((m) => Math.max(-m, 0)), n);
  if (!up.length) return null;
  const d = lastOf(down);
  return d === 0 ? 100 : 100 - 100 / (1 + lastOf(up) / d);
}

// Slow stochastic (14, 3, 3): %K is the raw value's 3-day average, %D is %K's.
function stochastic(b, n = 14) {
  const raw = [];
  for (let i = n - 1; i < b.length; i++) {
    const w = b.slice(i + 1 - n, i + 1);
    const hi = Math.max(...w.map((x) => x.high));
    const lo = Math.min(...w.map((x) => x.low));
    raw.push(hi === lo ? 50 : ((b[i].close - lo) / (hi - lo)) * 100);
  }
  const k = raw.slice(2).map((_, i) => mean(raw.slice(i, i + 3)));
  const d = k.slice(2).map((_, i) => mean(k.slice(i, i + 3)));
  return d.length ? { k: lastOf(k), d: lastOf(d) } : null;
}

function macd(c) {
  const fast = emaSeries(c, 12);
  const slow = emaSeries(c, 26);
  if (!slow.length) return null;
  const line = slow.map((s, i) => fast[i + 14] - s);
  const signal = emaSeries(line, 9);
  return signal.length ? { line: lastOf(line), signal: lastOf(signal), hist: lastOf(line) - lastOf(signal) } : null;
}

const trueRanges = (b) => b.slice(1).map((x, i) => Math.max(x.high - x.low, Math.abs(x.high - b[i].close), Math.abs(x.low - b[i].close)));

function atr(b, n = 14) {
  const s = wilder(trueRanges(b), n);
  return s.length ? lastOf(s) / n : null;
}

// ADX with +DI and -DI (14).
function adx(b, n = 14) {
  const plus = [], minus = [];
  for (let i = 1; i < b.length; i++) {
    const up = b[i].high - b[i - 1].high;
    const down = b[i - 1].low - b[i].low;
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  const tr = wilder(trueRanges(b), n), p = wilder(plus, n), m = wilder(minus, n);
  if (tr.length < n) return null;
  const pdi = p.map((x, i) => (tr[i] ? (x / tr[i]) * 100 : 0));
  const mdi = m.map((x, i) => (tr[i] ? (x / tr[i]) * 100 : 0));
  const dx = pdi.map((x, i) => (x + mdi[i] ? (Math.abs(x - mdi[i]) / (x + mdi[i])) * 100 : 0));
  return { adx: lastOf(wilder(dx, n)) / n, plus: lastOf(pdi), minus: lastOf(mdi) };
}

function cci(b, n = 20) {
  if (b.length < n) return null;
  const tp = b.slice(-n).map((x) => (x.high + x.low + x.close) / 3);
  const avg = mean(tp);
  const dev = mean(tp.map((x) => Math.abs(x - avg)));
  return dev ? (lastOf(tp) - avg) / (0.015 * dev) : 0;
}

function bollinger(c, n = 20) {
  if (c.length < n) return null;
  const w = c.slice(-n);
  const mid = mean(w);
  const sd = Math.sqrt(mean(w.map((x) => (x - mid) ** 2)));
  return { upper: mid + 2 * sd, lower: mid - 2 * sd };
}

// On Balance Volume against its own 20-day average; null without volume (some metals).
function obv(b) {
  if (!b.some((x) => x.volume)) return null;
  let v = 0;
  const line = [0];
  for (let i = 1; i < b.length; i++) {
    v += b[i].close > b[i - 1].close ? b[i].volume : b[i].close < b[i - 1].close ? -b[i].volume : 0;
    line.push(v);
  }
  return { obv: v, avg: sma(line, 20) };
}

// The volume-weighted average price of the last 20 days (a day trader's VWAP restarts daily; this is its daily-bar form).
function vwap(b, n = 20) {
  const w = b.slice(-n);
  const vol = sum(w.map((x) => x.volume ?? 0));
  return vol ? sum(w.map((x) => (((x.high + x.low + x.close) / 3) * (x.volume ?? 0)))) / vol : null;
}

// Parabolic SAR (0.02, up to 0.2): true when the last bar is in an uptrend, with the SAR level.
function parabolicSar(b, step = 0.02, max = 0.2) {
  if (b.length < 5) return null;
  let up = b[1].close >= b[0].close;
  let sar = up ? b[0].low : b[0].high;
  let ep = up ? b[1].high : b[1].low;
  let af = step;
  for (let i = 2; i < b.length; i++) {
    sar += af * (ep - sar);
    sar = up ? Math.min(sar, b[i - 1].low, b[i - 2].low) : Math.max(sar, b[i - 1].high, b[i - 2].high);
    if (up ? b[i].low < sar : b[i].high > sar) {
      up = !up;
      sar = ep;
      ep = up ? b[i].high : b[i].low;
      af = step;
    } else if (up ? b[i].high > ep : b[i].low < ep) {
      ep = up ? b[i].high : b[i].low;
      af = Math.min(af + step, max);
    }
  }
  return { up, sar };
}

const labelOf = (score) => (score >= 0.5 ? "strong-buy" : score >= 0.1 ? "buy" : score > -0.1 ? "neutral" : score > -0.5 ? "sell" : "strong-sell");

function tally(rows) {
  const count = (v) => rows.filter((r) => r.vote === v).length;
  const buy = count("buy"), sell = count("sell"), neutral = count("neutral");
  const score = rows.length ? (buy - sell) / rows.length : 0;
  return { buy, sell, neutral, score, key: labelOf(score), rows };
}

// The label and the five checks behind it. c: closes; a: dividend-adjusted closes; m: MACD; null with under 200 days.
function ladder(c, a, m) {
  const px = lastOf(c), s200 = sma(c, 200), s50 = sma(c, 50), e50 = lastOf(emaSeries(c, 50));
  if (s200 == null || a.length < 127) return null;
  const mom = a[a.length - 22] / a[a.length - 127] - 1;
  const up = px > s200 && s50 > s200;
  const down = px < s200 && s50 < s200;
  const medium = [mom > 0, px > e50, (m?.line ?? 0) > 0];
  const strong = medium.filter(Boolean).length >= 2;
  return {
    key: up ? (strong ? "strong-buy" : "buy") : down ? (strong ? "sell" : "strong-sell") : "neutral",
    checks: [
      { name: "מחיר מעל ממוצע 200 יום", ok: px > s200, value: px / s200 - 1 },
      { name: "ממוצע 50 מעל ממוצע 200", ok: s50 > s200, value: s50 / s200 - 1 },
      { name: "מומנטום 6 חודשים (בלי החודש האחרון)", ok: medium[0], value: mom },
      { name: "מחיר מעל ממוצע 50 (EMA)", ok: medium[1], value: px / e50 - 1 },
      { name: "MACD מעל אפס", ok: medium[2], value: null },
    ],
  };
}
const RANK = { "strong-sell": -2, sell: -1, neutral: 0, buy: 1, "strong-buy": 2, "no-data": null };

// bars: [{high, low, close, volume, open, adj}], oldest first; needs a month and a half at least. An indicator without
// enough history or data is left out of the count.
export function technicalsOf(bars) {
  const b = bars.filter((x) => x.high != null && x.low != null && x.close != null);
  if (b.length < 35) return null;
  const c = b.map((x) => x.close);
  const px = lastOf(c);
  const side = (level) => (px > level ? "buy" : px < level ? "sell" : "neutral");

  const mas = [];
  for (const n of MA_PERIODS) {
    const s = sma(c, n);
    if (s != null) mas.push({ name: `SMA ${n}`, value: s, vote: side(s) });
    const e = lastOf(emaSeries(c, n));
    if (e != null) mas.push({ name: `EMA ${n}`, value: e, vote: side(e) });
  }

  const ind = [];
  const add = (name, value, vote, note) => value != null && ind.push({ name, value, vote, note });
  const r = rsi(c);
  add("RSI (14)", r, r >= 70 || r <= 30 ? "neutral" : r > 55 ? "buy" : r < 45 ? "sell" : "neutral", r >= 70 ? "מחוממת" : r <= 30 ? "מכירת יתר" : null);
  const st = stochastic(b);
  if (st) add("Stochastic (14,3)", st.k, st.k > st.d && st.k < 80 ? "buy" : st.k < st.d && st.k > 20 ? "sell" : "neutral");
  const m = macd(c);
  if (m) add("MACD (12,26,9)", m.hist, m.hist > 0 ? "buy" : m.hist < 0 ? "sell" : "neutral");
  const a = adx(b);
  if (a) add("ADX (14)", a.adx, a.adx < 20 ? "neutral" : a.plus > a.minus ? "buy" : "sell", a.adx < 20 ? "בלי מגמה ברורה" : null);
  const cc = cci(b);
  add("CCI (20)", cc, cc > 100 ? "buy" : cc < -100 ? "sell" : "neutral");
  const roc = c.length > 12 ? (px / c[c.length - 13] - 1) * 100 : null;
  add("ROC (12)", roc, roc > 0 ? "buy" : roc < 0 ? "sell" : "neutral");
  const e13 = lastOf(emaSeries(c, 13));
  const power = e13 == null ? null : lastOf(b).high + lastOf(b).low - 2 * e13;
  add("Bull/Bear Power (13)", power, power > 0 ? "buy" : power < 0 ? "sell" : "neutral");
  const o = obv(b);
  if (o?.avg != null) add("OBV", o.obv - o.avg, o.obv > o.avg ? "buy" : o.obv < o.avg ? "sell" : "neutral");
  const vw = vwap(b);
  add("VWAP (20 יום)", vw, vw == null ? null : side(vw));
  const sar = parabolicSar(b);
  if (sar) add("Parabolic SAR", sar.sar, sar.up ? "buy" : "sell");
  const bb = bollinger(c);
  if (bb) add("Bollinger (20,2)", px > bb.upper ? bb.upper : px < bb.lower ? bb.lower : (bb.upper + bb.lower) / 2, px > bb.upper ? "buy" : px < bb.lower ? "sell" : "neutral", px > bb.upper ? "מעל הרצועה" : px < bb.lower ? "מתחת לרצועה" : null);

  const maSum = tally(mas);
  const indSum = tally(ind);
  const lad = ladder(c, b.map((x) => x.adj ?? x.close), m);
  const key = lad?.key ?? "no-data";
  const prev = b[b.length - 2];
  const pivot = (prev.high + prev.low + prev.close) / 3;
  const range = atr(b);
  return {
    key,
    score: RANK[key],
    checks: lad?.checks ?? null,
    ma: maSum,
    ind: indSum,
    atr: range,
    atrPct: range == null ? null : range / px,
    pivots: { s1: 2 * pivot - prev.high, pivot, r1: 2 * pivot - prev.low },
  };
}

// Daily bars, oldest first. While the market is open the last bar is still forming, so it is left out.
export async function dailyBars(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`, { headers: HEADERS, next: { revalidate: 43200 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = (await res.json()).chart.result[0];
  const q = r.indicators.quote[0];
  const adj = r.indicators.adjclose?.[0]?.adjclose ?? q.close;
  const session = r.meta.currentTradingPeriod?.regular;
  const open = session && Date.now() / 1000 < session.end;
  const rows = r.timestamp.map((t, i) => ({ t: new Date(t * 1000).toISOString().slice(0, 10), stamp: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] ?? 0, adj: adj[i] })).filter((x) => x.open != null && x.high != null && x.low != null && x.close != null && x.adj != null);
  return open && rows.length && rows[rows.length - 1].stamp >= session.start ? rows.slice(0, -1) : rows;
}

// The summary per symbol, 8 at a time so Yahoo does not refuse a burst; a symbol whose history fails is left out, and
// the page shows "—" for it.
export async function technicalsFor(symbols) {
  const out = {};
  const list = [...new Set(symbols)];
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(list.slice(i, i + 8).map(async (s) => {
      try {
        const t = technicalsOf(await dailyBars(s));
        if (t) out[s] = t;
      } catch {
        // No history for now: no summary for this symbol.
      }
    }));
  }
  return out;
}
