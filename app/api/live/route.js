import { holdingSnapshots } from "@/lib/market-snapshot";
// Latest available regular-session quote; this public feed may be delayed.
export const dynamic = "force-dynamic";

export async function GET(req) {
  const symbols = (new URL(req.url).searchParams.get("symbols") || "").split(",").filter(Boolean).slice(0, 20);
  const rows = await Promise.all(
    symbols.map(async (s) => {
      try {
        const { chart: r, alternatives } = await holdingSnapshots(s);
        const m = alternatives[0];
        // 5 sessions of 5-minute closes: the last session draws the card's chart, the session before it gives
        // yesterday's close (today's change), and the close before the 5 sessions gives the week's change.
        const closes = r.indicators.quote[0].close;
        const all = r.timestamp.map((t, i) => [t, closes[i]]).filter(([, c]) => c != null);
        const day = (t) => new Date((t + m.gmtoffset) * 1000).toISOString().slice(0, 10);
        const lastDay = day(all[all.length - 1][0]);
        const points = all.filter(([t]) => day(t) === lastDay);
        const before = all.filter(([t]) => day(t) < lastDay);
        const prev = m.valuationPreviousClose > 0 ? m.valuationPreviousClose : before.length ? before[before.length - 1][1] : m.chartPreviousClose;
        const price = m.regularMarketPrice;
        const weekBase = m.chartPreviousClose;
        return [s, { price, currency: m.currency, prev, points, change: prev ? price / prev - 1 : null, week: weekBase ? price / weekBase - 1 : null, time: m.regularMarketTime, source: m.priceSource }];
      } catch {
        return [s, null];
      }
    }),
  );
  return Response.json(Object.fromEntries(rows));
}
