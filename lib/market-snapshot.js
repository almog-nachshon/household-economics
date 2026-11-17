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
