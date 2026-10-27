import { startOfMonth, isActive } from "@/lib/budget";

// The base budget's domains. Fixed expenses carry one of these categories; loans have their own model.
export const DOMAINS = [
  {
    key: "housing",
    name: "הוצאות משק הבית",
    categories: ["שכר דירה", "ארנונה", "ועד בית", "חשמל", "מים", "גז", "ביטוח דירה", "כרטיס אשראי / מזומן", "תקשורת ומנויים", "מזון", "ניקיון ומוצרי בית", "אחר (בית)"],
  },
  { key: "car", name: "רכב", categories: ["ביטוח רכב", "דלק / טעינה", "טסט ורישוי", "טיפולים", "חניה וכבישי אגרה"] },
  {
    key: "current",
    name: "הוצאות שוטפות",
    categories: ["בריאות", "ילדים וחינוך", "בילויים ומסעדות", "קניות", "ביגוד", "ביטוחים", "אחר"],
  },
  { key: "loans", name: "הלוואות", categories: [] },
];

export const LOAN_DOMAINS = { loans: "הלוואה", car: "הלוואת רכב", housing: "דירה" };

export const domainOf = (category) => DOMAINS.find((d) => d.categories.includes(category))?.key ?? "current";

// Months from `month` until `end`, both included.
export const monthsLeft = (end, month) => Math.max(0, (end.getFullYear() - month.getFullYear()) * 12 + end.getMonth() - month.getMonth() + 1);

// Loan schedule. With a known payment: months left follow from balance and rate (or balance / payment at 0%).
// Without one: the Shpitzer payment that clears the balance by the end month.
export function loanPlan(loan, month = startOfMonth(new Date())) {
  const r = loan.annualRate / 100 / 12;
  let payment = loan.payment;
  let months;
  if (payment) {
    if (r && loan.balance * r >= payment) return { months: Infinity, payment, interestThisMonth: loan.balance * r, interestLeft: Infinity, end: null };
    months = Math.ceil(r ? -Math.log(1 - (loan.balance * r) / payment) / Math.log(1 + r) : loan.balance / payment);
  } else {
    months = loan.endMonth ? monthsLeft(loan.endMonth, month) : 0;
    payment = months === 0 ? 0 : r ? (loan.balance * r) / (1 - (1 + r) ** -months) : loan.balance / months;
  }
  // The last payment is usually smaller; total paid is the balance plus the interest it accrues.
  let b = loan.balance;
  let interest = 0;
  for (let i = 0; i < months && b > 0; i++) {
    interest += b * r;
    b = b * (1 + r) - payment;
  }
  return {
    months,
    payment,
    interestThisMonth: loan.balance * r,
    interestLeft: interest,
    end: new Date(month.getFullYear(), month.getMonth() + months - 1, 1),
  };
}

// Balance after `k` more payments.
export function loanBalanceAfter(loan, k, month = startOfMonth(new Date())) {
  const { payment } = loanPlan(loan, month);
  const r = loan.annualRate / 100 / 12;
  let b = loan.balance;
  for (let i = 0; i < k && b > 0; i++) b = b * (1 + r) - payment;
  return Math.max(0, b);
}

export const CARD_BILL = "כרטיס אשראי / מזומן";

// The card-bill line is the whole monthly card total; card-paid items listed in their own domain are part of it.
// So the line counts only what is left after those items (same card, or any card when the line names none).
export function cardBillRest(bill, active) {
  const inside = active.filter((e) => e !== bill && e.kind === "credit" && e.category !== CARD_BILL && (!bill.cardId || e.cardId === bill.cardId));
  return Math.max(0, bill.amount - inside.reduce((t, e) => t + e.amount, 0));
}

// Every fixed monthly item this month: expenses and loan payments, each with its domain.
export function fixedItems({ expenses, loans, settings, month = startOfMonth(new Date()) }) {
  const active = expenses.filter((e) => isActive(e, month));
  const items = active.map((e) => ({
    name: e.name,
    amount: e.category === CARD_BILL && e.kind === "credit" ? cardBillRest(e, active) : e.amount,
    kind: e.kind,
    cardId: e.cardId,
    category: e.category,
    domain: domainOf(e.category),
  }));
  for (const l of loans) {
    const { payment } = loanPlan(l, month);
    if (payment > 0) {
      items.push({ name: l.name, amount: payment, kind: l.cardId ? "credit" : "standing", cardId: l.cardId, category: "הלוואות", domain: l.domain, loan: true });
    }
  }
  return items;
}

// Household income: the base budget's income lines, else the settings value, else the last snapshot.
export function monthlyIncome(incomes, settings, last) {
  const total = incomes.filter((i) => !i.month).reduce((t, i) => t + i.amount, 0);
  return total || settings.monthlyIncome || last?.netIncome || 0;
}

// The yearly rate (%) at which `payment` clears `balance` in `months` payments (bisection).
export function impliedRate(balance, payment, months) {
  if (!balance || !payment || !months || payment * months <= balance) return 0;
  const paymentAt = (yearly) => {
    const r = yearly / 100 / 12;
    return (balance * r) / (1 - (1 + r) ** -months);
  };
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (paymentAt(mid) > payment) hi = mid;
    else lo = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

// Fixed costs per payment method: standing orders (incl. loans and arnona), each card, cash.
export function byPayment(items, cards) {
  const rows = [{ key: "standing", name: "הוראות קבע", total: 0 }];
  for (const c of cards) rows.push({ key: `card${c.id}`, name: `אשראי ····${c.last4}${c.name ? ` (${c.name})` : ""}`, total: 0 });
  rows.push({ key: "card", name: "אשראי (כרטיס לא צוין)", total: 0 }, { key: "cash", name: "מזומן", total: 0 });
  const find = (k) => rows.find((r) => r.key === k);
  for (const i of items) {
    const row = i.kind === "credit" ? find(i.cardId ? `card${i.cardId}` : "card") ?? find("card") : find(i.kind === "cash" ? "cash" : "standing");
    row.total += i.amount;
  }
  return rows.filter((r) => r.total > 0);
}
