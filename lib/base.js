import { startOfMonth, isActive } from "@/lib/budget";

// The base budget's domains. Fixed expenses carry one of these categories; loans have their own model.
export const DOMAINS = [
  { key: "housing", name: "דירה", categories: ["שכר דירה", "ועד בית", "חשמל", "מים", "גז", "ביטוח דירה", "אחר (דירה)"] },
  { key: "car", name: "רכב", categories: ["ביטוח רכב", "דלק / טעינה", "טסט ורישוי", "טיפולים", "חניה וכבישי אגרה"] },
  {
    key: "current",
    name: "הוצאות שוטפות",
    categories: ["מזון", "תקשורת ומנויים", "בריאות", "ילדים וחינוך", "בילויים ומסעדות", "קניות", "ביגוד", "ביטוחים", "אחר"],
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

// Arnona: the discount applies to the first discountSqm m² only; the bill is per year.
export function arnona(s) {
  const yearly = s.arnonaArea * s.arnonaRate;
  const discount = Math.min(s.arnonaArea, s.arnonaDiscountSqm) * s.arnonaRate * (s.arnonaDiscountPct / 100);
  return { yearly: yearly - discount, monthly: (yearly - discount) / 12, saved: discount / 12 };
}

// Every fixed monthly item this month: expenses, loan payments and arnona, each with its domain.
export function fixedItems({ expenses, loans, settings, month = startOfMonth(new Date()) }) {
  const items = expenses
    .filter((e) => isActive(e, month))
    .map((e) => ({ name: e.name, amount: e.amount, kind: e.kind, category: e.category, domain: domainOf(e.category) }));
  for (const l of loans) {
    const { payment } = loanPlan(l, month);
    if (payment > 0) items.push({ name: l.name, amount: payment, kind: "standing", category: "הלוואות", domain: l.domain });
  }
  const a = arnona(settings);
  if (a.monthly > 0) items.push({ name: "ארנונה", amount: a.monthly, kind: "standing", category: "ארנונה", domain: "housing" });
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
