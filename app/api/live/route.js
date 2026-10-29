// Live price and today's change for a few symbols (the invest page polls it every minute).
export const dynamic = "force-dynamic";

export async function GET(req) {
  const symbols = (new URL(req.url).searchParams.get("symbols") || "").split(",").filter(Boolean).slice(0, 20);
  const rows = await Promise.all(
    symbols.map(async (s) => {
      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=5m`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          next: { revalidate: 60 },
        });
        const r = (await res.json()).chart.result[0];
        const m = r.meta;
        // The last session's 5-minute closes, for the card's intraday chart.
        const closes = r.indicators.quote[0].close;
        const points = r.timestamp.map((t, i) => [t, closes[i]]).filter(([, c]) => c != null);
        const prev = m.chartPreviousClose ?? m.previousClose;
        return [s, { price: m.regularMarketPrice, change: prev ? m.regularMarketPrice / prev - 1 : null, currency: m.currency, prev, points }];
      } catch {
        return [s, null];
      }
    }),
  );
  return Response.json(Object.fromEntries(rows));
}
