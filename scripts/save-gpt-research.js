// Saves ChatGPT's research (pasted from ChatGPT, prompt in docs/chatgpt-prompt.md) into ResearchGpt. lib/research.js
// averages it 50/50 with Claude's Research for the status. Run inside the container like scripts/save-research.js:
//   ssh voltshare-server "cd /opt/finance && docker compose exec -T finance-app sh -c 'cat > /app/g.json'" < gpt.json
//   ssh voltshare-server "cd /opt/finance && docker compose exec -T finance-app sh -c 'cat > /app/s.js && node /app/s.js < /app/g.json; rm /app/s.js /app/g.json'" < scripts/save-gpt-research.js
// JSON: { asOf: "YYYY-MM-DD", results: [{ symbol, components: {analysts|revisions|technicals|valuation|sentiment: {score, note_he}},
//   confidence, summary_he, reasons_he, sources: [{name, url, kind, date, note_he}] }] }
// The score and verdict are computed here from the parts by the same weights, not taken from ChatGPT.
const { PrismaClient } = require("@prisma/client");

const W = { analysts: 0.35, revisions: 0.2, technicals: 0.25, valuation: 0.1, sentiment: 0.1 };
const db = new PrismaClient();
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", async () => {
  const { asOf, results } = JSON.parse(input);
  let saved = 0;
  for (const r of results) {
    const parts = Object.keys(W).map((k) => Math.max(-2, Math.min(2, Number(r.components?.[k]?.score ?? 0))));
    const score = Math.round(Object.values(W).reduce((t, w, i) => t + w * parts[i], 0) * 100) / 100;
    const verdict = score >= 0.6 ? "buy" : score <= -0.4 ? "sell" : "wait";
    if (!(r.sources ?? []).length) console.error(`${r.symbol}: no sources`);
    const data = {
      verdict, score, confidence: Math.max(1, Math.min(5, r.confidence ?? 3)), summary: r.summary_he ?? "",
      reasons: JSON.stringify(r.reasons_he ?? []), components: JSON.stringify(r.components ?? {}),
      sources: JSON.stringify(r.sources ?? []), asOf: new Date(`${asOf}T12:00:00Z`),
    };
    await db.researchGpt.upsert({ where: { symbol: r.symbol }, update: data, create: { symbol: r.symbol, ...data } });
    console.log(r.symbol, verdict, score);
    saved += 1;
  }
  console.log(`saved ${saved} (as of ${asOf})`);
});
