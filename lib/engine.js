// The candidate technical engine, in comparison mode next to the active label (lib/technicals.js): it never decides a
// purchase. Deterministic code with a documented model (lib/engine-model.json, research/engine/). See docs/engine.md.
// It grades a stock's expected 3-month return against SPY. A grade is a signal for the stock, not an instruction: the
// portfolio layer (20% cap, targets) decides. Funds and metals have no graded model, because no edge was validated.
const DAY = 86400000;
export const MIN_BARS = 273; // 12-1 month momentum needs 252 + 21 days
const MAX_AGE_DAYS = 6; // a calendar week with a long weekend
const GRADES = { "strong-buy": "קנייה חזקה", buy: "קנייה", neutral: "נייטרלי — החזקה", sell: "מכירה", "strong-sell": "מכירה חזקה" };
export const NO_DATA = "אין מספיק נתונים להערכה";
export { GRADES };

const rolling = (a, n, f) => a.map((_, i) => (i + 1 < n || a.slice(i + 1 - n, i + 1).some((x) => x == null || Number.isNaN(x)) ? null : f(a.slice(i + 1 - n, i + 1))));
const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((t, x) => t + (x - m) ** 2, 0) / (a.length - 1));
};
// pandas' ewm(adjust=False): starts at the first value; `min` hides the first values, as min_periods does.
function ewm(a, alpha, min = 1) {
  let cur = null, seen = 0;
  return a.map((x) => {
    if (x != null && !Number.isNaN(x)) {
      cur = cur == null ? x : alpha * x + (1 - alpha) * cur;
      seen += 1;
    }
    return seen >= min ? cur : null;
  });
}
const rma = (a, n) => ewm(a, 1 / n, n);
const div = (x, y) => (x == null || y == null || y === 0 ? null : x / y);

// Split- and dividend-adjusted bars. Each bar: {t: "YYYY-MM-DD", o, h, l, c, v, a}; a is Yahoo's adjusted close.
const adjust = (bars) => bars.map((b) => {
  const k = b.a / b.c;
  return { t: b.t, o: b.o * k, h: b.h * k, l: b.l * k, c: b.a, v: b.v ?? 0, dv: b.c * (b.v ?? 0) };
});

// The features of the last bar. Reads nothing after it. spy and sector: bars of the same dates or more (sector optional).
export function features(rawBars, spyBars, sectorBars = null) {
  const b = adjust(rawBars);
  const n = b.length, last = n - 1;
  const c = b.map((x) => x.c), h = b.map((x) => x.h), l = b.map((x) => x.l), v = b.map((x) => x.v);
  const align = (bars) => {
    const m = new Map(adjust(bars).map((x) => [x.t, x.c]));
    let prev = null;
    return b.map((x) => (prev = m.get(x.t) ?? prev));
  };
  const lr = c.map((x, i) => (i ? Math.log(x / c[i - 1]) : null));
  const vol = rolling(lr, 63, sd).map((x) => (x == null ? null : x * Math.sqrt(252)));
  const unit = (d) => (vol[last] == null ? null : vol[last] * Math.sqrt(d / 252));
  const sma50 = rolling(c, 50, mean), sma200 = rolling(c, 200, mean);
  const tr = b.map((x, i) => (i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1]), Math.abs(x.l - c[i - 1])) : x.h - x.l));
  const pdm = [], mdm = [];
  for (let i = 0; i < n; i++) {
    const up = i ? h[i] - h[i - 1] : null, dn = i ? l[i - 1] - l[i] : null;
    pdm.push(i && up > dn && up > 0 ? up : 0);
    mdm.push(i && dn > up && dn > 0 ? dn : 0);
  }
  const atr = rma(tr, 14), pS = rma(pdm, 14), mS = rma(mdm, 14);
  const pdi = pS.map((x, i) => (x == null ? null : (100 * x) / atr[i])), mdi = mS.map((x, i) => (x == null ? null : (100 * x) / atr[i]));
  const dx = pdi.map((x, i) => (x == null ? null : (100 * Math.abs(x - mdi[i])) / (x + mdi[i])));
  const adx = rma(dx, 14);
  const ch = c.map((x, i) => (i ? x - c[i - 1] : null));
  const up = rma(ch.map((x) => (x == null ? null : Math.max(x, 0))), 14), dn = rma(ch.map((x) => (x == null ? null : Math.max(-x, 0))), 14);
  const rsi = up[last] == null ? null : dn[last] === 0 ? 100 : 100 - 100 / (1 + up[last] / dn[last]);
  const ago = (a, k) => (last - k >= 0 ? a[last - k] : null);
  const ret = (a, k) => {
    const p = ago(a, k);
    return p == null || a[last] == null ? null : a[last] / p - 1;
  };
  const f = {};
  f.t_d200 = sma200[last] == null ? null : div(c[last] / sma200[last] - 1, vol[last]);
  f.t_d50 = sma50[last] == null ? null : div(c[last] / sma50[last] - 1, vol[last]);
  f.t_slope50 = ago(sma50, 21) == null ? null : div(sma50[last] / ago(sma50, 21) - 1, unit(21));
  f.t_cross = sma200[last] == null ? null : div(sma50[last] / sma200[last] - 1, vol[last]);
  f.t_adx = adx[last] == null ? null : (Math.sign(pdi[last] - mdi[last]) * adx[last]) / 50;
  f.m_21 = div(ret(c, 21), unit(21));
  f.m_63 = div(ret(c, 63), unit(63));
  f.m_6_1 = ago(c, 126) == null ? null : div(ago(c, 21) / ago(c, 126) - 1, unit(105));
  f.m_12_1 = ago(c, 252) == null ? null : div(ago(c, 21) / ago(c, 252) - 1, unit(231));
  const mr = rsi == null ? null : (rsi - 50) / 50;
  const above = sma200[last] != null && c[last] > sma200[last];
  f.m_rsi = mr;
  f.m_rsi_up = mr == null ? null : above ? mr : 0;
  f.m_rsi_dn = mr == null ? null : above ? 0 : mr;
  const sp = align(spyBars);
  f.m_rs63 = ret(c, 63) == null || ret(sp, 63) == null ? null : div(ret(c, 63) - ret(sp, 63), unit(63));
  if (sectorBars) {
    const se = align(sectorBars);
    f.m_rsec63 = ret(c, 63) == null || ret(se, 63) == null ? null : div(ret(c, 63) - ret(se, 63), unit(63));
  } else f.m_rsec63 = 0;
  const v20 = rolling(v, 20, mean)[last], v60 = rolling(v, 60, mean), v120 = rolling(v, 120, mean)[last];
  f.v_rel = v20 == null || v120 == null ? null : Math.log((v20 + 1) / (v120 + 1));
  const wr = lr.map((x, i) => (x == null || v60[i] == null ? null : x * (v[i] / v60[i])));
  f.v_conf = last >= 20 && wr.slice(-21).every((x) => x != null) ? div(wr.slice(-21).reduce((t, x) => t + x, 0), unit(21)) : null;
  let o = 0;
  const obv = ch.map((x, i) => (x == null ? null : (o += Math.sign(x) * v[i])));
  f.v_obv = v120 == null || obv.slice(-20).some((x) => x == null) ? null : (obv[last] - mean(obv.slice(-20))) / (v120 * 20 + 1);
  f.k_atr = atr[last] == null ? null : atr[last] / c[last];
  f.k_vol = vol[last];
  const neg = rolling(lr.map((x) => (x == null ? null : Math.min(x, 0))), 63, sd)[last];
  f.k_dvol = neg == null ? null : neg * Math.sqrt(252);
  f.k_dd = n >= 252 ? c[last] / Math.max(...h.slice(-252)) - 1 : null;
  f.x_spy200 = rolling(sp, 200, mean)[last] == null ? null : sp[last] / rolling(sp, 200, mean)[last] - 1;
  const lsp = sp.map((x, i) => (i && x != null && sp[i - 1] != null ? Math.log(x / sp[i - 1]) : null));
  const sv = rolling(lsp, 63, sd)[last];
  f.x_spyvol = sv == null ? null : sv * Math.sqrt(252);
  return f;
}

// Data checks before any grade. Returns the Hebrew reasons it cannot be graded (empty when fine). now: for the age.
export function dataProblems(bars, now = Date.now()) {
  const out = [];
  if (!bars?.length) return ["אין נתוני מחיר"];
  if (bars.length < MIN_BARS) out.push(`רק ${bars.length} ימי מסחר, צריך ${MIN_BARS}`);
  const age = (now - new Date(`${bars[bars.length - 1].t}T00:00:00Z`).getTime()) / DAY;
  if (age > MAX_AGE_DAYS) out.push(`הנתון האחרון בן ${Math.floor(age)} ימים`);
  const bad = bars.slice(-MIN_BARS).filter((x) => !(x.c > 0 && x.o > 0 && x.h >= x.l && x.a > 0)).length;
  if (bad) out.push(`${bad} נרות לא תקינים`);
  for (let i = Math.max(1, bars.length - MIN_BARS); i < bars.length; i++) {
    const days = (new Date(`${bars[i].t}T00:00:00Z`) - new Date(`${bars[i - 1].t}T00:00:00Z`)) / DAY;
    if (days > 10) {
      out.push("פער של יותר מ-10 ימים בנתונים");
      break;
    }
  }
  return out;
}

// The prediction, and each feature's part in it, from the features; a missing feature counts as its training average.
export function predict(f, model) {
  const parts = model.features.map((name, i) => {
    const x = f[name];
    const z = x == null || Number.isNaN(x) ? 0 : Math.max(-3, Math.min(3, (x - model.mu[i]) / model.sd[i]));
    return { name, part: z * model.w[i] };
  });
  return { p: model.b0 + parts.reduce((t, x) => t + x.part, 0), parts };
}

export function rawGrade(p, model) {
  const [p10, p30, p70, p90] = model.thresholds;
  const c = model.cost;
  if (p >= p90 && p > c) return "strong-buy";
  if (p >= p70 && p > c) return "buy";
  if (p <= p10 && p < -c) return "strong-sell";
  if (p <= p30 && p < -c) return "sell";
  return "neutral";
}
// A grade the validation did not support is not published: it falls back to neutral.
export const published = (g, model) => (g === "neutral" || model.enabled.includes(g) ? g : "neutral");
// The two-month confirmation: a change holds only when the new grade repeats at the next month-end.
export function confirmed(raws) {
  let cur = null, prev = null;
  for (const g of raws) {
    if (cur == null || g === cur) cur = g;
    else if (g === prev) cur = g;
    prev = g;
  }
  return cur;
}
// Indexes of each month's last bar, oldest first. The last month counts only when complete, unless it is the only data.
export function monthEnds(bars, today) {
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const next = bars[i + 1];
    if (next ? next.t.slice(0, 7) !== bars[i].t.slice(0, 7) : bars[i].t.slice(0, 7) < today.slice(0, 7)) out.push(i);
  }
  return out;
}

const NAMES = {
  t_d200: "מרחק מממוצע 200", t_d50: "מרחק מממוצע 50", t_slope50: "שיפוע ממוצע 50", t_cross: "ממוצע 50 מול 200", t_adx: "כיוון וחוזק מגמה (ADX)",
  m_21: "תשואת חודש", m_63: "תשואת 3 חודשים", m_6_1: "מומנטום 6 חודשים", m_12_1: "מומנטום 12 חודשים", m_rsi_up: "RSI במגמת עלייה", m_rsi_dn: "RSI במגמת ירידה", m_rs63: "חוזק מול S&P 500", m_rsec63: "חוזק מול הסקטור",
  v_rel: "נפח יחסי", v_conf: "אישור תנועה בנפח", v_obv: "OBV", k_atr: "ATR יחסי", k_vol: "תנודתיות", k_dvol: "תנודתיות ירידות", k_dd: "מרחק מהשיא", x_spy200: "מגמת השוק", x_spyvol: "תנודתיות השוק",
};

// One symbol's result. bars: complete daily bars, oldest first. kind: "stock" gets graded; "fund" and "metal" have no
// validated model. Returns {state: "graded" | "no-data" | "no-model", ...}.
export function evaluate({ symbol, kind, bars, spy, sector, model, now = Date.now() }) {
  const base = { symbol, version: model.version, horizonDays: model.horizonDays, asOf: bars?.length ? bars[bars.length - 1].t : null };
  if (kind !== "stock") return { ...base, state: "no-model", grade: "neutral", why: ["בבדיקה הסופית לא נמצא יתרון מוכח ב-12 חודשים לקרנות ולמתכות, לכן אין דירוג ממודל."] };
  const problems = dataProblems(bars, now);
  if (!problems.length && !spy?.length) problems.push("אין נתוני מדד ייחוס");
  if (!problems.length) {
    const dv = bars.slice(-126).map((x) => x.c * (x.v ?? 0)).sort((a, b) => a - b)[63];
    if (dv < model.minDollarVolume) problems.push("נזילות נמוכה מהיקום שנבדק (150 המניות הנסחרות ביותר): לא מדורגת");
  }
  if (problems.length) return { ...base, state: "no-data", grade: null, why: problems };
  const today = new Date(now).toISOString().slice(0, 10);
  const ends = monthEnds(bars, today).slice(-7).filter((i) => i + 1 >= MIN_BARS);
  if (!ends.length) return { ...base, state: "no-data", grade: null, why: ["אין מספיק סופי חודש"] };
  const run = ends.map((i) => {
    const asOf = bars[i].t;
    const r = predict(features(bars.slice(0, i + 1), spy.filter((x) => x.t <= asOf), sector ? sector.filter((x) => x.t <= asOf) : null), model);
    return { asOf, ...r, raw: rawGrade(r.p, model) };
  });
  const lastRun = run[run.length - 1];
  const held = confirmed(run.map((x) => x.raw));
  const before = run.length > 1 ? confirmed(run.slice(0, -1).map((x) => x.raw)) : null;
  const sorted = [...lastRun.parts].sort((a, b) => b.part - a.part);
  const name = (x) => NAMES[x.name] ?? x.name;
  return {
    ...base,
    state: "graded",
    asOf: lastRun.asOf,
    grade: published(held, model),
    raw: held,
    prevGrade: before == null ? null : published(before, model),
    score: lastRun.p,
    range: model.gradeStats[published(held, model)],
    pros: sorted.filter((x) => x.part > 0).slice(0, 3).map(name),
    cons: sorted.filter((x) => x.part < 0).slice(-3).reverse().map(name),
  };
}
