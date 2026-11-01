import { db } from "@/lib/db";
import model from "@/lib/engine-model.json";
import { BUCKETS, CANDIDATES } from "@/lib/portfolio";
import { FUNDS } from "@/lib/overlap";
import { dailyBars, technicalsFor } from "@/lib/technicals";
import { evaluate } from "@/lib/engine";

// Runs the candidate engine (lib/engine.js) on live data and logs its dated predictions for a forward test. It only
// reads prices and writes its own table: it places no trades and changes no status.
const kindOf = (s) => {
  const bucket = CANDIDATES[s]?.bucket;
  if (bucket === "metals") return "metal";
  return FUNDS[s] || bucket === "index" || bucket === "sector" ? "fund" : "stock";
};
const toBars = (rows) => rows.map((x) => ({ t: x.t, o: x.open, h: x.high, l: x.low, c: x.close, v: x.volume, a: x.adj }));
async function loadBars(s) {
  try {
    return toBars(await dailyBars(s));
  } catch {
    return [];
  }
}

// Each symbol's result, 8 downloads at a time, sharing lib/technicals.js's cached history.
export async function engineFor(symbols) {
  const list = [...new Set(symbols)];
  const sectors = [...new Set(Object.values(model.sectors))];
  const cache = {};
  for (const group of [["SPY", ...sectors], list]) {
    for (let i = 0; i < group.length; i += 8) {
      await Promise.all(group.slice(i, i + 8).map(async (s) => (cache[s] ??= await loadBars(s))));
    }
  }
  return Object.fromEntries(list.map((s) => [s, evaluate({
    symbol: s,
    kind: kindOf(s),
    bars: cache[s],
    spy: cache.SPY,
    sector: model.sectors[s] ? cache[model.sectors[s]] : null,
    model,
  })]));
}

// Called by the daily cron. One row per symbol, model version and data date, next to what the active label said.
export async function logEngine() {
  const symbols = BUCKETS.flatMap((b) => b.candidates.map(([s]) => s));
  const [results, active] = await Promise.all([engineFor(symbols), technicalsFor(symbols)]);
  let saved = 0;
  for (const r of Object.values(results)) {
    if (!r.asOf) continue;
    const data = { state: r.state, grade: r.grade, raw: r.raw ?? null, score: r.score ?? null, active: active[r.symbol]?.key ?? null, horizonDays: r.horizonDays, why: JSON.stringify(r.why ?? []) };
    await db.enginePrediction.upsert({
      where: { symbol_asOf_version: { symbol: r.symbol, asOf: new Date(`${r.asOf}T00:00:00Z`), version: r.version } },
      create: { symbol: r.symbol, asOf: new Date(`${r.asOf}T00:00:00Z`), version: r.version, ...data },
      update: data,
    });
    saved += 1;
  }
  return { saved, version: model.version };
}
