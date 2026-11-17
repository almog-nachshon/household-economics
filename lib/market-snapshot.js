// A single timestamped regular-session feed for holdings valuation and intraday widgets.
export async function marketSnapshot(symbol) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=5m`, {
    headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 60 }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Market HTTP ${response.status}`);
  const chart = (await response.json()).chart?.result?.[0];
  if (!chart?.meta) throw new Error("Missing market metadata");
  return chart;
}
import { finnhubEnabled, finnhubQuote } from "@/lib/finnhub";


export async function holdingSnapshots(symbol) {
  const chart = await marketSnapshot(symbol);
  const yahoo = { ...chart.meta, priceSource: "Yahoo Finance" };
  const alternatives = [yahoo];
  // Yahoo supplies listing/currency metadata; Finnhub's quote endpoint does not.
  if (finnhubEnabled() && yahoo.symbol === symbol && yahoo.currency === "USD" && ["EQUITY", "ETF"].includes(yahoo.instrumentType) && /^[A-Z][A-Z0-9-]{0,14}$/.test(symbol)) {
    try {
      const q = await finnhubQuote(symbol);
      const session = yahoo.currentTradingPeriod?.regular;
      if (q.t <= Date.now() / 1000 + 60 && (!session || (q.t >= session.start && q.t <= session.end + 60))) {
        alternatives.push({ ...yahoo, regularMarketPrice: q.c, regularMarketTime: q.t, priceSource: "Finnhub", valuationPreviousClose: q.pc });
      }
    } catch { /* Verified Yahoo quote remains available. */ }
  }
  return { chart, alternatives: alternatives.sort((a, b) => b.regularMarketTime - a.regularMarketTime || (a.priceSource === "Finnhub" ? -1 : 1)) };
}
