import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { loadData } from "@/lib/data";
import { startOfMonth } from "@/lib/budget";
import { fixedItems, monthlyIncome } from "@/lib/base";
import { project } from "@/lib/funds";

const FIELDS = [
  ["netIncome", "הכנסה נטו של משק הבית"],
  ["expenses", "הוצאות החודש"],
  ["emergencyFund", "קרן חירום"],
  ["homeSavings", "חיסכון לבית"],
  ["kerenOld", "קרן השתלמות ישנה"],
  ["kerenNew", "קרן השתלמות חדשה"],
  ["investments", "תיק השקעות"],
  ["loanBalance", "יתרת הלוואה"],
  ["carLoanBalance", "יתרת הלוואת רכב"],
];

async function save(formData) {
  "use server";
  const [y, m] = formData.get("month").split("-").map(Number);
  const month = new Date(y, m - 1, 1);
  const data = Object.fromEntries(FIELDS.map(([k]) => [k, Number(formData.get(k) || 0)]));
  await db.snapshot.upsert({ where: { month }, update: data, create: { month, ...data } });
  redirect("/");
}

export const dynamic = "force-dynamic";

// Defaults: income and fixed costs from the base budget, keren balances from the funds page (projected to
// today), loan balances from the loans; everything else from the last update.
async function defaults() {
  const { settings, last } = await loadData();
  const month = startOfMonth(new Date());
  const [incomes, expenses, loans, funds] = await Promise.all([db.income.findMany(), db.expense.findMany(), db.loan.findMany(), db.fund.findMany()]);
  const fixed = fixedItems({ expenses, loans, settings, month }).reduce((t, i) => t + i.amount, 0);
  const sum = (list, fn) => list.reduce((t, x) => t + fn(x), 0);
  const kerens = funds.filter((f) => f.kind === "keren");
  const today = (f) => project(f, new Date()).value;
  return {
    ...(last || {}),
    netIncome: monthlyIncome(incomes, settings, last) || last?.netIncome,
    expenses: fixed || last?.expenses,
    ...(kerens.length && {
      kerenOld: sum(kerens.filter((f) => f.liquidDate && f.liquidDate <= settings.targetDate), today),
      kerenNew: sum(kerens.filter((f) => !f.liquidDate || f.liquidDate > settings.targetDate), today),
    }),
    ...(loans.length && {
      loanBalance: sum(loans.filter((l) => l.domain !== "car"), (l) => l.balance),
      carLoanBalance: sum(loans.filter((l) => l.domain === "car"), (l) => l.balance),
    }),
  };
}

export default async function Update() {
  const d = await defaults();
  return (
    <>
      <h1>עדכון חודשי</h1>
      <p className="label">השדות ממולאים מתקציב הבסיס, מהקרנות ומהעדכון הקודם. מתקנים מה שהשתנה ושומרים.</p>
      <form action={save}>
        <label>חודש <input type="month" name="month" required /></label>
        {FIELDS.map(([k, label]) => (
          <label key={k}>{label} <input type="number" name={k} step="1" min="0" required defaultValue={d[k] != null ? Math.round(d[k]) : ""} /></label>
        ))}
        <button type="submit">שמירה</button>
      </form>
    </>
  );
}
