import { redirect } from "next/navigation";
import { db } from "@/lib/db";

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

export default function Update() {
  return (
    <>
      <h1>עדכון חודשי</h1>
      <form action={save}>
        <label>חודש <input type="month" name="month" required /></label>
        {FIELDS.map(([k, label]) => (
          <label key={k}>{label} <input type="number" name={k} step="1" min="0" required /></label>
        ))}
        <button type="submit">שמירה</button>
      </form>
    </>
  );
}
