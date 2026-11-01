// Price history for the details panel's chart, from Yahoo's chart endpoint, cached for 5 minutes. The last week
// (30-minute bars), month (hourly), 3 months or year (daily), or 5 years (weekly). Returns {candles: [{time, open, high,
// low, close, volume}], prev, currency, ma50, ma200}; prev is the close before the range, the base for its change, and
// the 50 and 200 day averages come with the daily ranges, from a longer history so they start at the chart's left edge.
export const dynamic = "force-dynamic";

const FETCH = { "5d": ["5d", "30m"], "1mo": ["1mo", "60m"], "3mo": ["2y", "1d"], "1y": ["2y", "1d"], "5y": ["5y", "1wk"] };
const DAYS = { "3mo": 91, "1y": 365 };

const average = (bars, n) =>
  bars.map((b, i) => (i + 1 < n ? null : { time: b.time, value: bars.slice(i + 1 - n, i + 1).reduce((t, x) => t + x.close, 0) / n })).filter(Boolean);

export async function GET(req) {
  const u = new URL(req.url);
  const symbol = u.searchParams.get("symbol") || "";
  const range = FETCH[u.searchParams.get("range")] ? u.searchParams.get("range") : "5d";
  if (!/^[A-Z0-9.=^-]{1,12}$/i.test(symbol)) return Response.json({ error: "bad symbol" }, { status: 400 });
  const [span, interval] = FETCH[range];
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${span}&interval=${interval}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });
    const r = (await res.json()).chart.result[0];
    const q = r.indicators.quote[0];
    const all = r.timestamp
      .map((time, i) => ({ time, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] ?? 0 }))
      .filter((b) => b.open != null && b.high != null && b.low != null && b.close != null);
    if (!DAYS[range]) return Response.json({ candles: all, prev: range === "5y" ? null : r.meta.chartPreviousClose ?? null, currency: r.meta.currency });
    const from = Date.now() / 1000 - DAYS[range] * 86400;
    const visible = (line) => line.filter((b) => b.time >= from);
    const candles = visible(all);
    const before = all[all.length - candles.length - 1];
    return Response.json({ candles, prev: before?.close ?? null, currency: r.meta.currency, ma50: visible(average(all, 50)), ma200: visible(average(all, 200)) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
