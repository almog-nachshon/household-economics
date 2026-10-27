import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { loadData } from "@/lib/data";
import { startOfMonth } from "@/lib/budget";
import { fixedItems, monthlyIncome } from "@/lib/base";
import { project } from "@/lib/funds";
import { ils } from "@/lib/goal";

const FIELDS = [
  ["emergencyFund", "קרן חירום"],
  ["homeSavings", "חיסכון לבית"],
  ["investments", "תיק השקעות"],
];

// This month's snapshot (used by the goal, year, cashflow and emergency pages). Only the three balances are
// typed in; income, expenses, kerens and loans come from the tables on this page and the funds page.
async function saveBalances() {
  const { settings } = await loadData();
  const now = new Date();
  const month = startOfMonth(now);
  const [incomes, expenses, loans, funds, spends] = await Promise.all([
    db.income.findMany(), db.expense.findMany(), db.loan.findMany(), db.fund.findMany(),
    db.spend.findMany({ where: { date: { gte: month } } }),
  ]);
  const sum = (list, fn) => list.reduce((t, x) => t + fn(x), 0);
  const kerens = funds.filter((f) => f.kind === "keren");
  const liquidByTarget = (f) => f.liquidDate && f.liquidDate <= settings.targetDate;
  return {
    month,
    netIncome: monthlyIncome(incomes, settings, null),
    expenses: sum(fixedItems({ expenses, loans, settings, month }), (i) => i.amount) + sum(spends, (s) => s.amount),
    kerenOld: sum(kerens.filter(liquidByTarget), (f) => project(f, now).value),
    kerenNew: sum(kerens.filter((f) => !liquidByTarget(f)), (f) => project(f, now).value),
    loanBalance: sum(loans.filter((l) => l.domain !== "car"), (l) => l.balance),
    carLoanBalance: sum(loans.filter((l) => l.domain === "car"), (l) => l.balance),
  };
}

async function save(formData) {
  "use server";
  const { month, ...data } = await saveBalances();
  for (const [k] of FIELDS) data[k] = Number(formData.get(k) || 0);
  await db.snapshot.upsert({ where: { month }, update: data, create: { month, ...data } });
  revalidatePath("/expenses");
  revalidatePath("/");
}

export default async function Balances() {
  const { last } = await loadData();
  const month = startOfMonth(new Date());
  const saved = last && last.month.getTime() === month.getTime();
  return (
    <div className="card" id="balances" style={{ marginTop: 12 }}>
      <h2>יתרות החודש</h2>
      <form action={save} style={{ maxWidth: "none" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          {FIELDS.map(([k, label]) => (
            <label key={k} style={{ display: "grid", gap: 4 }}>
              {label} <input type="number" name={k} min="0" step="1" defaultValue={last ? Math.round(last[k]) : ""} style={{ width: 130 }} />
            </label>
          ))}
          <button type="submit">שמירה</button>
        </div>
      </form>
      <p className="label">
        {saved ? `נשמר החודש (${ils(last.emergencyFund + last.homeSavings + last.investments)} ביחד). ` : "עוד לא נשמר החודש. "}
        הכנסות, הוצאות, קרנות והלוואות נלקחים אוטומטית מהטבלאות. היתרות מזינות את דף היעד, התזרים וקרן החירום.
      </p>
    </div>
  );
}
