import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { loadData } from "@/lib/data";
import { CATEGORIES, monthBudget, endingSoon, startOfMonth } from "@/lib/budget";
import { fixedItems, monthlyIncome } from "@/lib/base";
import { monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";
import BaseBudget from "@/components/BaseBudget";
import Balances from "@/components/Balances";

export const dynamic = "force-dynamic";

async function addSpend(formData) {
  "use server";
  const [y, m, d] = String(formData.get("date")).split("-").map(Number);
  await db.spend.create({
    data: {
      date: new Date(y, m - 1, d),
      amount: Number(formData.get("amount")),
      category: String(formData.get("category")),
      note: String(formData.get("note") || ""),
    },
  });
  revalidatePath("/expenses");
}

async function remove(formData) {
  "use server";
  const id = Number(formData.get("id"));
  if (formData.get("table") === "spend") await db.spend.delete({ where: { id } });
  else await db.expense.delete({ where: { id } });
  revalidatePath("/expenses");
}

function Delete({ table, id }) {
  return (
    <form action={remove} style={{ display: "inline" }}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="secondary" style={{ padding: "2px 8px" }}>מחיקה</button>
    </form>
  );
}

const CategorySelect = () => (
  <select name="category" required>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
);

export default async function Expenses() {
  const { settings, last } = await loadData();
  const today = new Date();
  const month = startOfMonth(today);
  const [expenses, loans, incomes, spends] = await Promise.all([
    db.expense.findMany(),
    db.loan.findMany(),
    db.income.findMany(),
    db.spend.findMany({ where: { date: { gte: month } }, orderBy: { date: "desc" } }),
  ]);
  const income = monthlyIncome(incomes, settings, last);
  // Fixed items are already this month's (start/end applied), so the budget sees them all as active.
  const b = monthBudget({ income, expenses: fixedItems({ expenses, loans, settings, month }), spends, savingsGoal: settings.savingsGoal, today });
  const ending = endingSoon(expenses, today);
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <>
      <h1>הוצאות / הכנסות: {monthLabel(month)}</h1>
      <p className="label">
        הכנסה: {ils(income)} {incomes.length ? "(מהטבלה למטה)" : settings.monthlyIncome ? "(מההגדרות)" : last ? "(מהעדכון החודשי האחרון)" : ""}.
        יעד חיסכון חודשי: {ils(settings.savingsGoal)} (משנים ב<a href="/settings">הגדרות</a>).
      </p>
      {!income && <p className="warn">אין הכנסה. הוסף הכנסות בטבלה למטה.</p>}

      <div className="card hero">
        <div className="hero-row">
          <div><div className="label">הכנסות</div><div className="value pos">{ils(income)}</div></div>
          <div><div className="label">כל ההוצאות הקבועות</div><div className="value neg">{ils(b.standing + b.credit)}</div></div>
          <div><div className="label">יעד חיסכון</div><div className="value">{ils(b.savingsGoal)}</div></div>
          <div>
            <div className="label">נשאר להוצאות שוטפות החודש</div>
            <div className={`value big ${b.remaining < 0 ? "neg" : "pos"}`}>{ils(b.remaining)}</div>
          </div>
        </div>
        <div className="meter" style={{ marginTop: 12 }}>
          <div style={{ width: `${Math.min(100, b.variableBudget ? (b.spent / b.variableBudget) * 100 : 100)}%`, background: b.remaining < 0 ? "var(--neg)" : undefined }} />
        </div>
        <div className="label" style={{ marginTop: 6 }}>
          {b.goalReachable
            ? `הוצאת ${ils(b.spent)} מתוך ${ils(b.variableBudget)} להוצאות שוטפות · ${ils(b.perDay)} ליום · ${ils(b.perWeek)} לשבוע · ${b.daysLeft} ימים לסוף החודש`
            : `ההוצאות הקבועות משאירות ${ils(b.leftAfterFixed)}, פחות מיעד החיסכון. אפשר לחסוך עד ${ils(b.maxSaving)} בלי הוצאות שוטפות בכלל.`}
          {" "}· חיסכון צפוי בסוף החודש: <b className={b.projectedSaving < b.savingsGoal ? "neg" : "pos"}>{ils(b.projectedSaving)}</b>
          {" "}· תקרת אשראי: {ils(b.cardCeiling)}
        </div>
      </div>

      <BaseBudget />
      <Balances />

      <div className="card" style={{ marginTop: 12 }}>
        <h2>הוספת הוצאה משתנה (קנייה)</h2>
        <form action={addSpend}>
          <label>תאריך <input type="date" name="date" defaultValue={todayValue} required /></label>
          <label>סכום <input type="number" name="amount" min="0" step="0.01" required /></label>
          <label>קטגוריה <CategorySelect /></label>
          <label>הערה <input name="note" /></label>
          <button type="submit">הוספה</button>
        </form>
      </div>

      {spends.length > 0 && (
        <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <h2>הוצאות משתנות החודש</h2>
          <table>
            <thead><tr><th>תאריך</th><th>קטגוריה</th><th>הערה</th><th>סכום</th><th /></tr></thead>
            <tbody>
              {spends.map((s) => (
                <tr key={s.id}>
                  <td>{s.date.toLocaleDateString("he-IL")}</td><td>{s.category}</td><td>{s.note}</td><td>{ils(s.amount)}</td>
                  <td><Delete table="spend" id={s.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      {b.byCategory.length > 0 && (
        <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <h2>לפי קטגוריה החודש</h2>
          <table>
            <thead><tr><th>קטגוריה</th><th>סכום</th><th>% מההכנסה</th></tr></thead>
            <tbody>
              {b.byCategory.map(([c, amount]) => (
                <tr key={c}><td>{c}</td><td>{ils(amount)}</td><td>{income ? `${((amount / income) * 100).toFixed(1)}%` : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ending.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2>תשלומים שמסתיימים בקרוב</h2>
          <ul>
            {ending.map((e) => (
              <li key={e.id}>{e.name}: אחרי {monthLabel(e.endMonth)} מתפנים {ils(e.amount)} בחודש</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
