// Dummy data only. Real numbers live in the server DB, never in git.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

await db.settings.upsert({
  where: { id: 1 },
  update: {},
  create: { targetHomePrice: 3000000, equityRatio: 0.3, targetDate: new Date("2030-06-01"), emergencyTarget: 90000 },
});

for (let i = 0; i < 6; i++) {
  const month = new Date(2026, 4 + i, 1);
  await db.snapshot.upsert({
    where: { month },
    update: {},
    create: {
      month,
      netIncome: 30000,
      expenses: 21000,
      emergencyFund: 20000 + i * 5000,
      homeSavings: 50000 + i * 4000,
      kerenOld: 90000 + i * 500,
      kerenNew: 10000 + i * 3500,
      investments: 5000 + i * 2500,
      loanBalance: 180000 - i * 2000,
      carLoanBalance: 95000 - i * 1200,
    },
  });
}
await db.$disconnect();
