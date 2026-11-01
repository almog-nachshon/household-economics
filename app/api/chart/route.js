// Price history for the details panel's chart: the last week (30-minute points), month (hourly) or year (daily), from
// Yahoo's chart endpoint, cached for 5 minutes. Returns {points: [[unix seconds, close]], prev, currency}; prev is the
// close before the range, the base for the range's change.
export const dynamic = "force-dynamic";

const INTERVAL = { "5d": "30m", "1mo": "60m", "1y": "1d" };

export async function GET(req) {
  const u = new URL(req.url);
  const symbol = u.searchParams.get("symbol") || "";
  const range = INTERVAL[u.searchParams.get("range")] ? u.searchParams.get("range") : "5d";
  if (!/^[A-Z0-9.=^-]{1,12}$/i.test(symbol)) return Response.json({ error: "bad symbol" }, { status: 400 });
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${INTERVAL[range]}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });
    const r = (await res.json()).chart.result[0];
    const closes = r.indicators.quote[0].close;
    const points = r.timestamp.map((t, i) => [t, closes[i]]).filter(([, c]) => c != null);
    return Response.json({ points, prev: r.meta.chartPreviousClose ?? null, currency: r.meta.currency });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
