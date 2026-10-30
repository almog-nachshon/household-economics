import { db } from "@/lib/db";
import { quote, ilsRates } from "@/lib/market";
import { CANDIDATES } from "@/lib/portfolio";
import { brokerState } from "@/lib/ibkr";

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

// The IBKR statement in shekels: holdings at the statement's closing prices, cost as IBKR keeps it (with commissions),
// both in the holding's currency at today's rate (the statement's own rate when the live one fails). `week` is the
// change in the holdings' profit since the statement about a week earlier.
async function brokerPortfolio(b) {
  let live = {};
  try {
    live = await ilsRates([...b.positions.map((p) => p.currency), ...b.cash.map((c) => c.currency)]);
  } catch {
    // the statement's rates below
  }
  const rate = (c) => live[c] ?? b.rates[c] ?? 0;
  const rows = b.positions.map((p) => {
    const r = rate(p.currency);
    const [cost, value] = [p.cost * r, p.value * r];
    const c = CANDIDATES[p.symbol];
    return {
      symbol: p.symbol, ibSymbol: p.ibSymbol, conid: p.conid, bucket: c?.bucket, name: c?.name ?? p.name, currency: p.currency,
      units: p.units, priceIls: p.markPrice * r, cost, value, profit: value - cost, pct: cost ? (value - cost) / cost : 0,
    };
  });
  const cost = rows.reduce((t, h) => t + h.cost, 0);
  const held = rows.reduce((t, h) => t + h.value, 0);
  const cash = b.cash.reduce((t, c) => t + c.amount * rate(c.currency), 0);
  const weekAgo = new Date(b.asOf.getTime() - 6 * 24 * 3600 * 1000);
  const before = await db.brokerDay.findFirst({ where: { date: { lte: weekAgo } }, orderBy: { date: "desc" } });
  return {
    rows: rows.sort((a, b) => b.value - a.value), cost, held, cash, cashBy: b.cash, value: held + cash, profit: held - cost,
    pct: cost ? (held - cost) / cost : 0, week: before ? held - cost - before.profit : null,
    broker: true, asOf: b.asOf, fetchedAt: b.fetchedAt, todayFills: b.todayFills, error: b.error,
  };
}

// Portfolio value at a future date: today's value plus the monthly deposits, growing at `yearlyReturn` %.
export function projectPortfolio(value, monthly, months, yearlyReturn = 5) {
  const r = (1 + yearlyReturn / 100) ** (1 / 12) - 1;
  let v = value;
  for (let i = 0; i < months; i++) v = v * (1 + r) + monthly;
  return v;
}
