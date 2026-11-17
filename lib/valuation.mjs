// Never substitute futures for spot, a different listing, or an unverified contract.
export function valuePosition(position, meta, { verified, baseline, now = Date.now() }) {
  const fallback = { price: position.markPrice, value: position.value, source: "IBKR", time: null, reason: "broker" };
  if (!verified || !["STK", "ETF"].includes(position.assetClass)) return { ...fallback, reason: "instrument" };
  if (!meta || meta.symbol !== position.symbol || meta.currency !== position.currency || !["EQUITY", "ETF"].includes(meta.instrumentType)) return { ...fallback, reason: "identity" };
  const price = meta.regularMarketPrice, time = meta.regularMarketTime * 1000;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time) || time < baseline || time > now + 60000) return { ...fallback, reason: "timestamp" };
  const session = meta.currentTradingPeriod?.regular;
  if (meta.priceSource === "Finnhub" && session && (time < session.start * 1000 || time > session.end * 1000 + 60000)) return { ...fallback, reason: "session" };
  const closed = session && (now / 1000 < session.start || now / 1000 >= session.end);
  // Accept a recent trade, or the latest completed session's close. Older closes remain broker marks.
  const latestClose = closed && time >= (session.end - 1800) * 1000 && time <= session.end * 1000;
  if (now - time > 20 * 60000 && !latestClose) return { ...fallback, reason: "stale" };
  return { price, value: position.units * price, source: meta.priceSource === "Finnhub" ? "Finnhub" : "Yahoo Finance", time, reason: latestClose ? "close" : "market" };
}
