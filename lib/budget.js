export const CATEGORIES = [
  "דיור", "חשבונות", "מזון", "רכב ותחבורה", "ביטוחים", "תקשורת ומנויים",
  "ילדים וחינוך", "בריאות", "בילויים ומסעדות", "קניות", "הלוואות", "אחר",
];

export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

// An installment plan counts until (and including) its last month.
export const isActive = (e, month) => !e.endMonth || e.endMonth >= month;

// Monthly budget:
// income - standing orders - fixed card charges = left after fixed
// left after fixed - savings goal = what may be spent on variable purchases this month
// The card ceiling is the fixed card charges plus that variable budget (variable purchases go on the card).
export function monthBudget({ income, expenses, spends, savingsGoal, today = new Date() }) {
  const month = startOfMonth(today);
  const active = expenses.filter((e) => isActive(e, month));
  const sum = (list) => list.reduce((t, x) => t + x.amount, 0);
  const standing = sum(active.filter((e) => e.kind === "standing"));
  const credit = sum(active.filter((e) => e.kind === "credit"));
  const leftAfterFixed = income - standing - credit;
  const variableBudget = Math.max(0, leftAfterFixed - savingsGoal);

  const spent = sum(spends);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const day = today.getDate();
  const daysLeft = daysInMonth - day + 1; // today counts
  const remaining = variableBudget - spent;
  const perDay = Math.max(0, remaining) / daysLeft;
  // Spending pace so far, carried to the end of the month.
  const projectedSpend = (spent / day) * daysInMonth;

  const byCategory = {};
  for (const x of [...active, ...spends]) byCategory[x.category] = (byCategory[x.category] || 0) + x.amount;

  return {
    income,
    standing,
    credit,
    leftAfterFixed,
    savingsGoal,
    goalReachable: leftAfterFixed >= savingsGoal,
    maxSaving: Math.max(0, leftAfterFixed),
    variableBudget,
    cardCeiling: credit + variableBudget,
    spent,
    remaining,
    perDay,
    perWeek: perDay * Math.min(7, daysLeft),
    daysLeft,
    projectedSpend,
    projectedSaving: leftAfterFixed - projectedSpend,
    byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
  };
}

// Installments ending in the coming months, and how much they free up.
export function endingSoon(expenses, today = new Date(), months = 6) {
  const month = startOfMonth(today);
  const until = new Date(month.getFullYear(), month.getMonth() + months, 1);
  return expenses.filter((e) => e.endMonth && e.endMonth >= month && e.endMonth < until).sort((a, b) => a.endMonth - b.endMonth);
}
