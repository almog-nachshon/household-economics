import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { loadData } from "@/lib/data";
import { startOfMonth, isActive } from "@/lib/budget";
import { DOMAINS, LOAN_DOMAINS, loanPlan, arnona, fixedItems, monthlyIncome } from "@/lib/base";
import { monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";

const KINDS = { standing: "הוראת קבע", credit: "אשראי" };
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

// <input type="month"> value -> first of that month.
const monthOf = (v) => {
  if (!v) return null;
  const [y, m] = String(v).split("-").map(Number);
  return new Date(y, m - 1, 1);
};

async function addIncome(formData) {
  "use server";
  const month = Number(formData.get("month"));
  await db.income.create({ data: { name: String(formData.get("name")), amount: Number(formData.get("amount")), month: month || null } });
  revalidatePath("/expenses");
}

async function addExpense(formData) {
  "use server";
  await db.expense.create({
    data: {
      name: String(formData.get("name")),
      amount: Number(formData.get("amount")),
      kind: String(formData.get("kind")),
      category: String(formData.get("category")),
      startMonth: monthOf(formData.get("startMonth")),
      endMonth: monthOf(formData.get("endMonth")),
    },
  });
  revalidatePath("/expenses");
}

async function addLoan(formData) {
  "use server";
  await db.loan.create({
    data: {
      name: String(formData.get("name")),
      domain: String(formData.get("domain")),
      balance: Number(formData.get("balance")),
      payment: Number(formData.get("payment")) || null,
      annualRate: Number(formData.get("annualRate") || 0),
      endMonth: monthOf(formData.get("endMonth")),
    },
  });
  revalidatePath("/expenses");
}

async function saveHousing(formData) {
  "use server";
  const data = Object.fromEntries(
    ["arnonaArea", "arnonaRate", "arnonaDiscountPct", "arnonaDiscountSqm", "rentRenewMonth"].map((k) => [k, Number(formData.get(k) || 0)]),
  );
  await db.settings.update({ where: { id: 1 }, data });
  revalidatePath("/expenses");
}

const TABLES = { income: db.income, expense: db.expense, loan: db.loan };
async function remove(formData) {
  "use server";
  await TABLES[formData.get("table")].delete({ where: { id: Number(formData.get("id")) } });
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

const Row = ({ children }) => <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>{children}</div>;
const inline = { display: "grid", gap: 4, maxWidth: "none" };

// The fixed part of the household budget: income lines, fixed expenses by domain, arnona and loans.
export default async function BaseBudget() {
  const { settings, last } = await loadData();
  const month = startOfMonth(new Date());
  const [incomes, expenses, loans] = await Promise.all([
    db.income.findMany({ orderBy: { amount: "desc" } }),
    db.expense.findMany({ orderBy: [{ category: "asc" }, { startMonth: "asc" }] }),
    db.loan.findMany({ orderBy: { endMonth: "asc" } }),
  ]);
  const income = monthlyIncome(incomes, settings, last);
  const items = fixedItems({ expenses, loans, settings, month });
  const byDomain = Object.fromEntries(DOMAINS.map((d) => [d.key, items.filter((i) => i.domain === d.key).reduce((t, i) => t + i.amount, 0)]));
  const fixed = items.reduce((t, i) => t + i.amount, 0);
  const a = arnona(settings);
  const renewIn = (settings.rentRenewMonth - 1 - month.getMonth() + 12) % 12;

  return (
    <>
      <h2 style={{ marginTop: 24 }}>הטבלה הקבועה: לפי תחום</h2>
      <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
        <table>
          <thead><tr><th>תחום</th><th>לחודש</th><th>% מההכנסה</th></tr></thead>
          <tbody>
            {DOMAINS.map((d) => (
              <tr key={d.key}><td>{d.name}</td><td>{ils(byDomain[d.key])}</td><td>{income ? `${((byDomain[d.key] / income) * 100).toFixed(1)}%` : "—"}</td></tr>
            ))}
            <tr><td><b>סה״כ</b></td><td><b>{ils(fixed)}</b></td><td><b>{income ? `${((fixed / income) * 100).toFixed(1)}%` : "—"}</b></td></tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
        <h2>הכנסות: {ils(income)} נטו לחודש</h2>
        {incomes.length > 0 && (
          <table>
            <thead><tr><th>שם</th><th>סכום</th><th>מתי</th><th /></tr></thead>
            <tbody>
              {incomes.map((i) => (
                <tr key={i.id} className={i.month ? "label" : ""}>
                  <td>{i.name}</td><td>{ils(i.amount)}</td><td>{i.month ? `פעם בשנה, ב${MONTHS[i.month - 1]}` : "כל חודש"}</td>
                  <td><Delete table="income" id={i.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {incomes.some((i) => i.month) && <p className="label">הכנסות שנתיות (כמו בונוס) לא נכנסות לתקציב החודשי. הן מופיעות ככסף נוסף לחיסכון בחודש שלהן.</p>}
        <form action={addIncome} style={{ maxWidth: "none", marginTop: 8 }}>
          <Row>
            <label style={inline}>שם <input name="name" required placeholder="משכורת נטו, תגמול משרד הביטחון..." /></label>
            <label style={inline}>סכום <input type="number" name="amount" min="0" step="1" required /></label>
            <label style={inline}>מתי <select name="month"><option value="0">כל חודש</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>פעם בשנה: {m}</option>)}</select></label>
            <button type="submit">הוספה</button>
          </Row>
        </form>
      </div>

      {DOMAINS.filter((d) => d.categories.length).map((d) => {
        const list = expenses.filter((e) => d.categories.includes(e.category));
        return (
          <div key={d.key} className="card" style={{ marginTop: 12, overflowX: "auto" }}>
            <h2>{d.name}: {ils(byDomain[d.key])} לחודש</h2>
            {d.key === "housing" && renewIn <= 1 && (
              <p className="warn">חוזה השכירות מתחדש ב-1 ל{MONTHS[settings.rentRenewMonth - 1]}. הוסף שורת שכר דירה עם ״מחודש״ לסכום החדש.</p>
            )}
            {(list.length > 0 || (d.key === "housing" && a.monthly > 0)) && (
              <table>
                <thead><tr><th>שם</th><th>קטגוריה</th><th>סכום</th><th>תשלום</th><th>מ-</th><th>עד</th><th /></tr></thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id} className={isActive(e, month) ? "" : "label"}>
                      <td>{e.name}</td><td>{e.category}</td><td>{ils(e.amount)}</td><td>{KINDS[e.kind]}</td>
                      <td>{e.startMonth ? monthLabel(e.startMonth) : "—"}</td>
                      <td>{e.endMonth ? monthLabel(e.endMonth) : "קבוע"}</td>
                      <td><Delete table="expense" id={e.id} /></td>
                    </tr>
                  ))}
                  {d.key === "housing" && a.monthly > 0 && (
                    <tr><td>ארנונה (מחושב)</td><td>ארנונה</td><td>{ils(a.monthly)}</td><td>הוראת קבע</td><td>—</td><td>קבוע</td><td /></tr>
                  )}
                </tbody>
              </table>
            )}
            <form action={addExpense} style={{ maxWidth: "none", marginTop: 8 }}>
              <Row>
                <label style={inline}>שם <input name="name" required /></label>
                <label style={inline}>סכום לחודש <input type="number" name="amount" min="0" step="0.01" required style={{ width: 110 }} /></label>
                <label style={inline}>קטגוריה <select name="category">{d.categories.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label style={inline}>תשלום <select name="kind">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label style={inline}>מחודש (לא חובה) <input type="month" name="startMonth" /></label>
                <label style={inline}>עד חודש (לא חובה) <input type="month" name="endMonth" /></label>
                <button type="submit">הוספה</button>
              </Row>
            </form>

            {d.key === "housing" && (
              <form action={saveHousing} style={{ maxWidth: "none", marginTop: 16 }}>
                <h2>ארנונה וחוזה</h2>
                <Row>
                  <label style={inline}>שטח הדירה (מ״ר) <input type="number" name="arnonaArea" step="0.1" defaultValue={settings.arnonaArea} style={{ width: 100 }} /></label>
                  <label style={inline}>תעריף לשנה (₪ למ״ר) <input type="number" name="arnonaRate" step="0.01" defaultValue={settings.arnonaRate} style={{ width: 110 }} /></label>
                  <label style={inline}>הנחה % <input type="number" name="arnonaDiscountPct" step="1" defaultValue={settings.arnonaDiscountPct} style={{ width: 80 }} /></label>
                  <label style={inline}>על המ״ר הראשונים <input type="number" name="arnonaDiscountSqm" step="1" defaultValue={settings.arnonaDiscountSqm} style={{ width: 80 }} /></label>
                  <label style={inline}>חידוש חוזה (חודש) <select name="rentRenewMonth" defaultValue={settings.rentRenewMonth}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
                  <button type="submit" className="secondary">שמירה</button>
                </Row>
                {a.monthly > 0 && (
                  <p className="label">ארנונה: {ils(a.yearly)} לשנה = {ils(a.monthly)} לחודש. ההנחה חוסכת {ils(a.saved)} לחודש ({ils(a.saved * 12)} לשנה).</p>
                )}
              </form>
            )}
          </div>
        );
      })}

      <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
        <h2>הלוואות: {ils(loans.reduce((t, l) => t + loanPlan(l, month).payment, 0))} לחודש</h2>
        {loans.length > 0 && (
          <table>
            <thead><tr><th>שם</th><th>סוג</th><th>יתרה</th><th>תשלום חודשי</th><th>ריבית שנתית</th><th>חודשים שנותרו</th><th>סיום משוער</th><th>ריבית שנשארה</th><th /></tr></thead>
            <tbody>
              {loans.map((l) => {
                const p = loanPlan(l, month);
                return (
                  <tr key={l.id}>
                    <td>{l.name}</td><td>{LOAN_DOMAINS[l.domain]}</td><td>{ils(l.balance)}</td><td><b>{ils(p.payment)}</b></td>
                    <td>{l.annualRate ? `${l.annualRate}%` : "לא הוזנה"}</td>
                    <td>{Number.isFinite(p.months) ? p.months : "התשלום לא מכסה את הריבית"}</td>
                    <td>{p.end ? monthLabel(p.end) : "—"}</td>
                    <td className="neg">{l.annualRate ? (Number.isFinite(p.interestLeft) ? ils(p.interestLeft) : "—") : "הזן ריבית לחישוב"}</td>
                    <td><Delete table="loan" id={l.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <form action={addLoan} style={{ maxWidth: "none", marginTop: 8 }}>
          <Row>
            <label style={inline}>שם <input name="name" required /></label>
            <label style={inline}>סוג <select name="domain">{Object.entries(LOAN_DOMAINS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label style={inline}>יתרה היום <input type="number" name="balance" min="0" step="1" required style={{ width: 120 }} /></label>
            <label style={inline}>תשלום חודשי <input type="number" name="payment" min="0" step="1" style={{ width: 110 }} /></label>
            <label style={inline}>ריבית שנתית % (אם ידוע) <input type="number" name="annualRate" min="0" step="0.01" style={{ width: 90 }} /></label>
            <label style={inline}>או: חודש תשלום אחרון <input type="month" name="endMonth" /></label>
            <button type="submit">הוספה</button>
          </Row>
        </form>
        <p className="label">
          עם תשלום ויתרה מחושב כמה חודשים נשארו. עם הריבית מחושבת גם הריבית שנשארה לשלם (שפיצר). בלי תשלום, התשלום
          מחושב מהיתרה, מהריבית ומחודש הסיום. כדאי לעדכן את היתרה מדי פעם לפי הבנק.
        </p>
      </div>
    </>
  );
}
