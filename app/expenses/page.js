import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { loadData } from "@/lib/data";
import { CATEGORIES, monthBudget, endingSoon, isActive, startOfMonth } from "@/lib/budget";
import { monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";
import Stat from "@/components/Stat";

export const dynamic = "force-dynamic";

const KINDS = { standing: "הוראת קבע", credit: "חיוב קבוע באשראי" };

async function addExpense(formData) {
  "use server";
  const end = formData.get("endMonth");
  const [y, m] = end ? end.split("-").map(Number) : [];
  await db.expense.create({
    data: {
      name: String(formData.get("name")),
      amount: Number(formData.get("amount")),
      kind: String(formData.get("kind")),
      category: String(formData.get("category")),
      endMonth: end ? new Date(y, m - 1, 1) : null,
    },
  });
  revalidatePath("/expenses");
}

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
  const [expenses, spends] = await Promise.all([
    db.expense.findMany({ orderBy: { amount: "desc" } }),
    db.spend.findMany({ where: { date: { gte: month } }, orderBy: { date: "desc" } }),
  ]);
  const income = settings.monthlyIncome || last?.netIncome || 0;
  const b = monthBudget({ income, expenses, spends, savingsGoal: settings.savingsGoal, today });
  const ending = endingSoon(expenses, today);
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <>
      <h1>הוצאות ותקציב: {monthLabel(month)}</h1>
      <p className="label">
        הכנסה: {ils(income)} {settings.monthlyIncome ? "(מההגדרות)" : last ? "(מהעדכון החודשי האחרון)" : ""}.
        יעד חיסכון חודשי: {ils(settings.savingsGoal)}. את שניהם משנים ב<a href="/settings">הגדרות</a>.
      </p>
      {!income && <p className="warn">אין הכנסה. הכנס הכנסה חודשית בהגדרות או בעדכון החודשי.</p>}

      <div className="grid">
        <Stat label="הוראות קבע" value={ils(b.standing)} />
        <Stat label="חיובים קבועים באשראי" value={ils(b.credit)} />
        <Stat label="נשאר אחרי הוצאות קבועות" value={ils(b.leftAfterFixed)} warn={b.leftAfterFixed <= 0} />
        <Stat
          label="מותר להוציא החודש (משתנות)"
          value={ils(b.variableBudget)}
          warn={!b.goalReachable}
          hint={b.goalReachable ? "אחרי יעד החיסכון" : `היעד גבוה מדי: אפשר לחסוך עד ${ils(b.maxSaving)}`}
        />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">תקרת אשראי לחודש (חיובים קבועים + הוצאות משתנות)</div>
        <div className="value">{ils(b.cardCeiling)}</div>
        <div className="meter" style={{ marginTop: 8 }}>
          <div style={{ width: `${Math.min(100, b.variableBudget ? (b.spent / b.variableBudget) * 100 : 100)}%`, background: b.remaining < 0 ? "var(--warn)" : undefined }} />
        </div>
        <div className="label" style={{ marginTop: 4 }}>
          הוצאת {ils(b.spent)} מתוך {ils(b.variableBudget)} של ההוצאות המשתנות
        </div>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <Stat label="נשאר להוציא החודש" value={ils(b.remaining)} warn={b.remaining < 0} hint={b.remaining < 0 ? "חרגת מהתקציב" : undefined} />
        <Stat label="מותר ליום" value={ils(b.perDay)} hint={`${b.daysLeft} ימים עד סוף החודש, כולל היום`} />
        <Stat label="מותר לשבוע" value={ils(b.perWeek)} />
        <Stat
          label="חיסכון צפוי בסוף החודש"
          value={ils(b.projectedSaving)}
          warn={b.projectedSaving < b.savingsGoal}
          hint={`בקצב ההוצאות הנוכחי (${ils(b.projectedSpend)} עד סוף החודש)`}
        />
      </div>

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

      <div className="card" style={{ marginTop: 12 }}>
        <h2>הוספת הוצאה קבועה</h2>
        <form action={addExpense}>
          <label>שם <input name="name" required placeholder="שכירות, חשמל, נטפליקס..." /></label>
          <label>סכום חודשי <input type="number" name="amount" min="0" step="0.01" required /></label>
          <label>
            איך משולם
            <select name="kind">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label>קטגוריה <CategorySelect /></label>
          <label>חודש תשלום אחרון (לתשלומים, אחרת ריק) <input type="month" name="endMonth" /></label>
          <button type="submit">הוספה</button>
        </form>
      </div>

      {Object.entries(KINDS).map(([kind, title]) => {
        const list = expenses.filter((e) => e.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className="card" style={{ marginTop: 12, overflowX: "auto" }}>
            <h2>{title}</h2>
            <table>
              <thead><tr><th>שם</th><th>קטגוריה</th><th>סכום</th><th>עד</th><th /></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className={isActive(e, month) ? "" : "label"}>
                    <td>{e.name}</td><td>{e.category}</td><td>{ils(e.amount)}</td>
                    <td>{e.endMonth ? monthLabel(e.endMonth) + (isActive(e, month) ? "" : " (הסתיים)") : "קבוע"}</td>
                    <td><Delete table="expense" id={e.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

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
