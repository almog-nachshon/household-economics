// Projections for pension and keren hishtalmut accounts.
// Net yearly return = assumed return minus the balance fee; each deposit loses the deposit fee.
export const monthlyDeposit = (f) => f.employeeMonthly + f.employerMonthly + f.severanceMonthly;

export function project(f, until) {
  const months = Math.max(0, (until.getFullYear() - f.balanceDate.getFullYear()) * 12 + until.getMonth() - f.balanceDate.getMonth());
  const r = (1 + (f.returnPct - f.feeBalancePct) / 100) ** (1 / 12) - 1;
  const dep = monthlyDeposit(f) * (1 - f.feeDepositPct / 100);
  let b = f.balance;
  for (let i = 0; i < months; i++) b = b * (1 + r) + dep;
  return { value: b, deposits: dep * months, months };
}

// Yearly cost of the balance fee at today's balance.
export const yearlyFee = (f) => (f.balance * f.feeBalancePct) / 100 + (monthlyDeposit(f) * 12 * f.feeDepositPct) / 100;

// Rough monthly pension: balance at retirement divided by a conversion factor (about 200 in Israeli funds).
export const PENSION_FACTOR = 200;

// Month-by-month value of each keren from now until the last one is liquid.
export function timeline(kerens, from = new Date()) {
  const last = kerens.reduce((m, f) => (f.liquidDate && f.liquidDate > m ? f.liquidDate : m), from);
  const rows = [];
  for (let d = new Date(from.getFullYear(), from.getMonth() + 1, 1); d <= new Date(last.getFullYear(), last.getMonth() + 1, 1); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const values = kerens.map((f) => ({ id: f.id, value: project(f, d).value, liquid: f.liquidDate && f.liquidDate < d }));
    rows.push({ month: d, values, liquidTotal: values.filter((v) => v.liquid).reduce((t, v) => t + v.value, 0) });
  }
  return rows;
}
