// Saves the deep research done in Claude Code (one verdict per stock, fund or metal) into the Research table.
// Run inside the container with the JSON on stdin, like scripts/save-plan.js:
//   ssh voltshare-server "cd /opt/finance && docker compose exec -T finance-app sh -c 'cat > /app/r.json'" < research.json
//   ssh voltshare-server "cd /opt/finance && docker compose exec -T finance-app sh -c 'cat > /app/s.js && node /app/s.js < /app/r.json; rm /app/s.js /app/r.json'" < scripts/save-research.js
// JSON: { asOf: "YYYY-MM-DD", results: [{ symbol, verdict: buy|wait|sell, score, confidence, summary_he, reasons_he,
//   components: {analysts|revisions|technicals|valuation|sentiment: {score, note_he}}, consensus, timingNote_he,
//   nextEarnings, price, sources: [{name, url, kind, tier, rating, date, note_he}], checked }] }
// The verdict comes from the fixed rule (score = 0.35 analysts + 0.20 revisions + 0.25 technicals + 0.10 valuation +
// 0.10 sentiment; buy >= 0.6, sell <= -0.4), checked again here. Only candidates verified at IBKR are saved.
const { PrismaClient } = require("@prisma/client");

const W = { analysts: 0.35, revisions: 0.2, technicals: 0.25, valuation: 0.1, sentiment: 0.1 };
const db = new PrismaClient();
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", async () => {
  const { asOf, results } = JSON.parse(input);
  const verified = new Set((await db.ibkrContract.findMany({ where: { conid: { not: null } } })).map((c) => c.symbol));
  const before = Object.fromEntries((await db.research.findMany()).map((r) => [r.symbol, r.verdict]));
  let saved = 0;
  for (const r of results) {
    if (verified.size && !verified.has(r.symbol)) {
      console.error("not verified at IBKR, skipped:", r.symbol);
      continue;
    }
    const score = Math.round(Object.entries(W).reduce((t, [k, w]) => t + w * (r.components?.[k]?.score ?? 0), 0) * 100) / 100;
    if (Math.abs(score - r.score) > 0.011) console.error(`${r.symbol}: score ${r.score} does not match its parts (${score})`);
    const data = {
      verdict: r.verdict,
      score: r.score,
      confidence: r.confidence,
      summary: r.summary_he,
      reasons: JSON.stringify(r.reasons_he ?? []),
      components: JSON.stringify(r.components ?? {}),
      consensus: JSON.stringify(r.consensus ?? {}),
      timing: r.timingNote_he ?? "",
      earnings: /^\d{4}-\d{2}-\d{2}$/.test(r.nextEarnings ?? "") ? new Date(`${r.nextEarnings}T00:00:00Z`) : null,
      price: r.price ?? null,
      sources: JSON.stringify(r.sources ?? []),
      checked: r.checked ?? "",
      prevVerdict: before[r.symbol] ?? "",
      asOf: new Date(`${asOf}T12:00:00Z`),
    };
    await db.research.upsert({ where: { symbol: r.symbol }, update: data, create: { symbol: r.symbol, ...data } });
    saved += 1;
  }
  console.log(`saved ${saved} of ${results.length} (as of ${asOf})`);
});
