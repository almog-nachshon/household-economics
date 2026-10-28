import { db } from "@/lib/db";
import { quote, ilsRates } from "@/lib/market";
import { CANDIDATES } from "@/lib/portfolio";

// The portfolio built from every confirmed purchase ("קניתי"): units and cost per symbol, valued at today's prices.
export async function portfolio() {
  const buys = await db.investPick.findMany({ orderBy: { month: "asc" } });
  const bySymbol = {};
  for (const b of buys) {
    const h = (bySymbol[b.symbol] ??= { symbol: b.symbol, bucket: b.bucket, units: 0, cost: 0, first: b.month });
    h.units += b.units;
    h.cost += b.units ? b.units * b.price : b.amount;
  }
  const rows = Object.values(bySymbol);
  if (!rows.length) return { rows, cost: 0, value: 0, profit: 0, pct: 0 };

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
  return { rows: rows.sort((a, b) => b.value - a.value), cost, value, profit: value - cost, pct: cost ? (value - cost) / cost : 0 };
}

// Portfolio value at a future date: today's value plus the monthly deposits, growing at `yearlyReturn` %.
export function projectPortfolio(value, monthly, months, yearlyReturn = 5) {
  const r = (1 + yearlyReturn / 100) ** (1 / 12) - 1;
  let v = value;
  for (let i = 0; i < months; i++) v = v * (1 + r) + monthly;
  return v;
}
