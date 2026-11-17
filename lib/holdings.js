import { db } from "@/lib/db";
import { quote, ilsRates } from "@/lib/market";
import { CANDIDATES } from "@/lib/portfolio";
import { brokerState } from "@/lib/ibkr";
import { holdingSnapshots } from "@/lib/market-snapshot";
import { valuePosition } from "@/lib/valuation.mjs";

// The portfolio: from Interactive Brokers once it has synced (lib/ibkr.js), otherwise built from every confirmed
// purchase ("קניתי"). value = holdings + cash in the account; profit and pct are the holdings' own.
export async function portfolio() {
  const broker = await brokerState();
  if (broker?.asOf) return brokerPortfolio(broker);
  const buys = await db.investPick.findMany({ orderBy: { month: "asc" } });
  const bySymbol = {};
  for (const b of buys) {
    const h = (bySymbol[b.symbol] ??= { symbol: b.symbol, bucket: b.bucket, units: 0, cost: 0, first: b.month });
    h.units += b.units;
    h.cost += b.units ? b.units * b.price : b.amount;
  }
  const rows = Object.values(bySymbol);
  if (!rows.length) return { rows, cost: 0, held: 0, cash: 0, value: 0, profit: 0, pct: 0 };

  const quotes = await Promise.all(rows.map((h) => quote(h.symbol)));
  let rates = {};
  try {
    rates = await ilsRates(quotes.filter((q) => !q.error).map((q) => q.currency));
  } catch {
    // Without rates the holdings are shown at cost.
  }
  for (const [i, h] of rows.entries()) {
    const q = quotes[i];
    h.name = CANDIDATES[h.symbol]?.name ?? h.symbol;
    h.priceIls = !q.error && rates[q.currency] ? q.price * rates[q.currency] : null;
    h.value = h.priceIls && h.units ? h.units * h.priceIls : h.cost;
    h.profit = h.value - h.cost;
    h.pct = h.cost ? h.profit / h.cost : 0;
  }
  const cost = rows.reduce((t, h) => t + h.cost, 0);
  const value = rows.reduce((t, h) => t + h.value, 0);
  return { rows: rows.sort((a, b) => b.value - a.value), cost, held: value, cash: 0, value, profit: value - cost, pct: cost ? (value - cost) / cost : 0 };
}

// IBKR quantities/cost/cash, repriced with verified timestamped market quotes when available.
// Use one FX basis for cost, cash and value: broker rates, with a market fallback only for missing currencies.
// Statement history is kept separate from market valuation; neither difference is a cash-flow-adjusted return.
async function brokerPortfolio(b) {
  const contracts = await db.ibkrContract.findMany();
  const baseline = b.todayFills ? b.fetchedAt.getTime() : b.asOf.getTime();
  const valuations = await Promise.all(b.positions.map(async (p) => {
    const verified = contracts.some((c) => c.symbol === p.symbol && c.conid === p.conid && c.currency === p.currency);
    let alternatives = [];
    if (verified && ["STK", "ETF"].includes(p.assetClass)) {
      try { alternatives = (await holdingSnapshots(p.symbol)).alternatives; } catch { /* Keep the broker mark. */ }
    }
    const values = alternatives.map((meta) => valuePosition(p, meta, { verified, baseline }));
    return values.find((value) => value.source !== "IBKR") ?? valuePosition(p, null, { verified, baseline });
  }));
  const currencies = [...b.positions.map((p) => p.currency), ...b.cash.map((c) => c.currency)];
  let live = {};
  if (currencies.some((c) => !b.rates[c])) {
    try {
      live = await ilsRates(currencies);
    } catch {
      // nothing more to go on
    }
  }
  const rate = (c) => b.rates[c] ?? live[c] ?? 0;
  const rows = b.positions.map((p, index) => {
    const valuation = valuations[index];
    const r = rate(p.currency);
    const [cost, value] = [p.cost * r, valuation.value * r];
    const c = CANDIDATES[p.symbol];
    return {
      symbol: p.symbol, ibSymbol: p.ibSymbol, conid: p.conid, bucket: c?.bucket, name: c?.name ?? p.name, currency: p.currency,
      units: p.units, priceIls: valuation.price * r, cost, value, profit: value - cost, pct: cost ? (value - cost) / cost : 0,
      brokerValue: p.value * r, priceSource: valuation.source, priceTime: valuation.time, priceReason: valuation.reason,
    };
  });
  const cost = rows.reduce((t, h) => t + h.cost, 0);
  const held = rows.reduce((t, h) => t + h.value, 0);
  const cash = b.cash.reduce((t, c) => t + c.amount * rate(c.currency), 0);
  const weekAgo = new Date(b.asOf.getTime() - 6 * 24 * 3600 * 1000);
  const before = await db.brokerDay.findFirst({ where: { date: { lte: weekAgo } }, orderBy: { date: "desc" } });
  return {
    rows: rows.sort((a, b) => b.value - a.value), cost, held, cash, cashBy: b.cash, value: held + cash, profit: held - cost,
    pct: cost ? (held - cost) / cost : 0, week: null,
    statementWeek: before ? rows.reduce((sum, h) => sum + h.brokerValue - h.cost, 0) - before.profit : null,
    brokerValue: rows.reduce((sum, h) => sum + h.brokerValue, 0) + cash,
    marketCount: rows.filter((h) => h.priceSource !== "IBKR").length,
    valuationAt: new Date(),
    broker: true, asOf: b.asOf, fetchedAt: b.fetchedAt, todayFills: b.todayFills, error: b.error, usdIls: rate("USD"),
    missingFx: [...new Set(currencies)].filter((c) => !(rate(c) > 0)),
  };
}

export { projectPortfolio } from "@/lib/funds";
