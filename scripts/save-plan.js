// Saves an investment plan researched in Claude Code (no API cost) as the coming deposit's AiPlan.
// Run inside the container with the plan JSON on stdin:
//   ssh voltshare-server "cd /opt/finance && docker compose exec -T finance-app sh -c 'cat > /app/p.json'" < plan.json
//   ssh voltshare-server "cd /opt/finance && docker compose exec -T finance-app sh -c 'cat > /app/s.js && node /app/s.js < /app/p.json; rm /app/s.js /app/p.json'" < scripts/save-plan.js
// JSON: { summary, metalsPct, picks: [{symbol, reason, analysts, outlook, conviction}], changes: [{symbol, action, reason}], risks: [string], research }
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", async () => {
  const plan = JSON.parse(input);
  const today = new Date();
  // Same as depositMonth in lib/invest-run.js: this month's 10th until the 10th, then next month's.
  const month = new Date(today.getFullYear(), today.getMonth() + (today.getDate() <= 10 ? 0 : 1), 1);
  const data = {
    final: true,
    metalsPct: plan.metalsPct,
    summary: plan.summary,
    picks: JSON.stringify(plan.picks),
    changes: JSON.stringify(plan.changes || []),
    risks: JSON.stringify(plan.risks),
    research: plan.research,
    model: "claude-opus-5-5 (Claude Code)",
    createdAt: today,
  };
  await db.aiPlan.upsert({ where: { month }, update: data, create: { month, ...data } });
  console.log("saved plan for", month.toISOString().slice(0, 10));
});
