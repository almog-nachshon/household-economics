import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { loadData } from "@/lib/data";
import { startOfMonth, isActive } from "@/lib/budget";
import { DOMAINS, LOAN_DOMAINS, CARD_BILL, cardBillRest, loanPlan, fixedItems, monthlyIncome, impliedRate, monthsLeft } from "@/lib/base";
import { monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";

// The payment select's value: "standing", "cash" or "card:<id>".
const parsePayment = (v) => {
  const [kind, id] = String(v || "standing").split(":");
  return kind === "card" ? { kind: "credit", cardId: Number(id) || null } : { kind, cardId: null };
};
const paymentValue = (e) => (e.kind === "credit" ? `card:${e.cardId ?? ""}` : e.kind);
function PaymentSelect({ cards, value = "standing" }) {
  return (
    <select name="payment" defaultValue={value}>
      <option value="standing">הוראת קבע</option>
      {cards.map((c) => <option key={c.id} value={`card:${c.id}`}>אשראי ····{c.last4}{c.name ? ` ${c.name}` : ""}</option>)}
      {cards.length === 0 && <option value="card:">אשראי</option>}
      <option value="cash">מזומן</option>
    </select>
  );
}
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

// <input type="month"> value -> first of that month.
const monthOf = (v) => {
  if (!v) return null;
  const [y, m] = String(v).split("-").map(Number);
  return new Date(y, m - 1, 1);
};

async function setPayment(formData) {
  "use server";
  await db.expense.update({ where: { id: Number(formData.get("id")) }, data: parsePayment(formData.get("payment")) });
  revalidatePath("/expenses");
}

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
      ...parsePayment(formData.get("payment")),
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

// Updates a loan. With an end month but no rate, the rate is solved from balance, payment and months left.
async function updateLoan(formData) {
  "use server";
  const balance = Number(formData.get("balance"));
  const payment = Number(formData.get("payment")) || null;
  const endMonth = monthOf(formData.get("endMonth"));
  let annualRate = Number(formData.get("annualRate") || 0);
  if (!annualRate && endMonth && payment) annualRate = impliedRate(balance, payment, monthsLeft(endMonth, startOfMonth(new Date())));
  await db.loan.update({ where: { id: Number(formData.get("id")) }, data: { balance, payment, annualRate, endMonth } });
  revalidatePath("/expenses");
}

const monthValue = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "");


async function addCard(formData) {
  "use server";
  await db.card.create({ data: { last4: String(formData.get("last4")).slice(-4), name: String(formData.get("name") || "") } });
  revalidatePath("/expenses");
}

const TABLES = { income: db.income, expense: db.expense, loan: db.loan, card: db.card };
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
      <button type="submit" className="secondary" style={{ padding: "2px 8px" }} title="מחיקה">✕</button>
    </form>
  );
}

// A domain block: its total, one line per item and a folded "add" form.
function Block({ title, total, income, children, add }) {
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div className="value" style={{ margin: 0 }}>{ils(total)}</div>
      </div>
      {income > 0 && <div className="label">{((total / income) * 100).toFixed(1)}% מההכנסה</div>}
      {children}
      {add && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer" }}>+ הוספה</summary>
          <div style={{ marginTop: 8 }}>{add}</div>
        </details>
      )}
    </div>
  );
}

// One loan: payment, months left, interest, and a folded form to update rate / end date.
function LoanRow({ l, month }) {
  const p = loanPlan(l, month);
  return (
    <tr key={l.id}>
      <td style={{ whiteSpace: "normal" }}>
        {l.name} · {LOAN_DOMAINS[l.domain]}
        <div className="label">
          יתרה {ils(l.balance)} · {Number.isFinite(p.months) ? `${p.months} חודשים, עד ${monthLabel(p.end)}` : "התשלום לא מכסה את הריבית"}
          {l.annualRate
            ? ` · ${l.annualRate}% · ריבית שנותרה ${Number.isFinite(p.interestLeft) ? ils(p.interestLeft) : "—"}`
            : " · הזן ריבית או תאריך סיום לחישוב הריבית"}
        </div>
        <details>
          <summary style={{ cursor: "pointer", fontSize: 14 }}>עדכון ריבית / תאריך סיום</summary>
          <form action={updateLoan} style={{ marginTop: 6 }}>
            <input type="hidden" name="id" value={l.id} />
            <label>יתרה <input type="number" name="balance" step="1" defaultValue={l.balance} required /></label>
            <label>תשלום חודשי <input type="number" name="payment" step="1" defaultValue={l.payment ?? ""} /></label>
            <label>ריבית שנתית % <input type="number" name="annualRate" step="0.01" defaultValue={l.annualRate || ""} /></label>
            <label>תאריך סיום (מההסכם) <input type="month" name="endMonth" defaultValue={monthValue(l.endMonth)} /></label>
            <button type="submit">חשב ושמור</button>
            <span className="label">ריבית ריקה + תאריך סיום = הריבית מחושבת מהיתרה, מהתשלום ומהתאריך.</span>
          </form>
        </details>
      </td>
      <td>{ils(p.payment)}</td>
      <td><Delete table="loan" id={l.id} /></td>
    </tr>
  );
}

const when = (e) => [e.startMonth && `מ${monthLabel(e.startMonth)}`, e.endMonth && `עד ${monthLabel(e.endMonth)}`].filter(Boolean).join(" ");

// The fixed part of the household budget as blocks: income, each expense domain (with its loans), loans, cards.
export default async function BaseBudget() {
  const { settings, last } = await loadData();
  const month = startOfMonth(new Date());
  const [incomes, expenses, loans, cards] = await Promise.all([
    db.income.findMany({ orderBy: { amount: "desc" } }),
    db.expense.findMany({ orderBy: [{ category: "asc" }, { startMonth: "asc" }] }),
    db.loan.findMany({ orderBy: { balance: "desc" } }),
    db.card.findMany({ orderBy: { id: "asc" } }),
  ]);
  const income = monthlyIncome(incomes, settings, last);
  const items = fixedItems({ expenses, loans, settings, month });
  const active = expenses.filter((e) => isActive(e, month));
  const byDomain = Object.fromEntries(DOMAINS.map((d) => [d.key, items.filter((i) => i.domain === d.key).reduce((t, i) => t + i.amount, 0)]));
  const renewIn = (settings.rentRenewMonth - 1 - month.getMonth() + 12) % 12;

  return (
    <div className="blocks">
      <Block
        title="הכנסות"
        total={income}
        add={
          <form action={addIncome}>
            <label>שם <input name="name" required placeholder="משכורת נטו, תגמול משרד הביטחון..." /></label>
            <label>סכום נטו <input type="number" name="amount" min="0" step="1" required /></label>
            <label>מתי <select name="month"><option value="0">כל חודש</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>פעם בשנה: {m}</option>)}</select></label>
            <button type="submit">הוספה</button>
          </form>
        }
      >
        <table>
          <tbody>
            {incomes.map((i) => (
              <tr key={i.id} className={i.month ? "label" : ""}>
                <td style={{ whiteSpace: "normal" }}>{i.name}{i.month ? ` (ב${MONTHS[i.month - 1]})` : ""}</td>
                <td className="pos">{ils(i.amount)}</td>
                <td><Delete table="income" id={i.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {incomes.some((i) => i.month) && <p className="label">הכנסה שנתית (בונוס) לא נכנסת לתקציב החודשי.</p>}
      </Block>

      {DOMAINS.filter((d) => d.categories.length).map((d) => {
        const list = expenses.filter((e) => d.categories.includes(e.category));
        const domainLoans = loans.filter((l) => l.domain === d.key);
        return (
          <Block
            key={d.key}
            title={d.name}
            total={byDomain[d.key]}
            income={income}
            add={
              <>
                <form action={addExpense}>
                  <label>שם <input name="name" required /></label>
                  <label>סכום לחודש <input type="number" name="amount" min="0" step="0.01" required /></label>
                  <label>קטגוריה <select name="category">{d.categories.map((c) => <option key={c}>{c}</option>)}</select></label>
                  <label>אופן תשלום <PaymentSelect cards={cards} /></label>
                  <label>מחודש (לא חובה, למשל העלאת שכירות) <input type="month" name="startMonth" /></label>
                  <label>עד חודש (לא חובה, לתשלומים) <input type="month" name="endMonth" /></label>
                  <button type="submit">הוספה</button>
                </form>
              </>
            }
          >
            {d.key === "housing" && renewIn <= 1 && <p className="warn">חוזה השכירות מתחדש ב-1 ל{MONTHS[settings.rentRenewMonth - 1]}.</p>}
            <table>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className={isActive(e, month) ? "" : "label"}>
                    <td style={{ whiteSpace: "normal" }}>
                      {e.name}
                      {when(e) && <div className="label">{when(e)}</div>}
                      <form action={setPayment} style={{ display: "flex", gap: 4, maxWidth: "none", marginTop: 2 }}>
                        <input type="hidden" name="id" value={e.id} />
                        <PaymentSelect cards={cards} value={paymentValue(e)} />
                        <button type="submit" className="secondary" style={{ padding: "2px 8px", fontSize: 13 }}>עדכון</button>
                      </form>
                    </td>
                    <td>
                      {ils(e.amount)}
                      {e.category === CARD_BILL && e.kind === "credit" && cardBillRest(e, active) !== e.amount && (
                        <div className="label">מזה {ils(cardBillRest(e, active))} לא מפורט</div>
                      )}
                    </td>
                    <td><Delete table="expense" id={e.id} /></td>
                  </tr>
                ))}
                {domainLoans.map((l) => <LoanRow key={`l${l.id}`} l={l} month={month} />)}
              </tbody>
            </table>
          </Block>
        );
      })}

      <Block
        title="הלוואות"
        total={loans.filter((l) => l.domain === "loans").reduce((t, l) => t + loanPlan(l, month).payment, 0)}
        income={income}
        add={
          <form action={addLoan}>
            <label>שם <input name="name" required /></label>
            <label>סוג <select name="domain">{Object.entries(LOAN_DOMAINS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>יתרה היום <input type="number" name="balance" min="0" step="1" required /></label>
            <label>תשלום חודשי <input type="number" name="payment" min="0" step="1" /></label>
            <label>ריבית שנתית % (אם ידוע) <input type="number" name="annualRate" min="0" step="0.01" /></label>
            <label>או: חודש תשלום אחרון <input type="month" name="endMonth" /></label>
            <button type="submit">הוספה</button>
          </form>
        }
      >
        <table>
          <tbody>
            {loans.filter((l) => l.domain === "loans").map((l) => <LoanRow key={l.id} l={l} month={month} />)}
          </tbody>
        </table>
      </Block>
      <Block
        title="כרטיסי אשראי"
        total={items.filter((i) => i.kind === "credit").reduce((t, i) => t + i.amount, 0)}
        income={income}
        add={
          <form action={addCard}>
            <label>4 ספרות אחרונות <input name="last4" required pattern="\d{4}" inputMode="numeric" maxLength={4} /></label>
            <label>שם (לא חובה) <input name="name" placeholder="ויזה כאל, מקס..." /></label>
            <button type="submit">הוספה</button>
          </form>
        }
      >
        <table>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id}>
                <td>····{c.last4} {c.name}</td>
                <td>{ils(items.filter((i) => i.kind === "credit" && i.cardId === c.id).reduce((t, i) => t + i.amount, 0))}</td>
                <td><Delete table="card" id={c.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {cards.length === 0 && <p className="label">הוסף כרטיסים כדי לבחור לכל הוצאה באיזה כרטיס היא משולמת.</p>}
      </Block>
    </div>
  );
}
