// Monthly deposit rules:
// 1. keep checkingBuffer in the current account
// 2. deposit monthlyInvest into the ETF portfolio, split by allocation pct
// 3. fill the emergency fund up to its target
// 4. everything else goes to the home savings
export function planMonth(surplus, emergencyFund, settings) {
  const available = Math.max(0, surplus - settings.checkingBuffer);
  const invest = Math.min(settings.monthlyInvest, available);
  const rest = available - invest;
  const toEmergency = Math.min(rest, Math.max(0, settings.emergencyTarget - emergencyFund));
  const toHome = rest - toEmergency;
  const allocations = JSON.parse(settings.allocations || "[]");
  const investSplit = allocations.map((a) => ({ ...a, amount: (invest * a.pct) / 100 }));
  return {
    surplus,
    buffer: Math.min(Math.max(0, surplus), settings.checkingBuffer),
    invest,
    investSplit,
    toEmergency,
    toHome,
    total: invest + toEmergency + toHome,
  };
}

// Average surplus of the last few snapshots, so one odd month doesn't skew the plan.
export function monthlySurplus(snapshots, n = 3) {
  const recent = snapshots.slice(-n);
  return recent.reduce((sum, s) => sum + s.netIncome - s.expenses, 0) / recent.length;
}

// The deposit day: today if it is the 1st, otherwise the 1st of next month.
export function nextFirst(today = new Date()) {
  const offset = today.getDate() === 1 ? 0 : 1;
  return new Date(today.getFullYear(), today.getMonth() + offset, 1);
}

// Projects `months` deposits starting at `start`, carrying balances forward (no returns assumed).
export function planYear(snapshots, settings, start, months = 12) {
  const last = snapshots[snapshots.length - 1];
  const surplus = monthlySurplus(snapshots);
  let { emergencyFund, homeSavings, investments } = last;
  const rows = [];
  for (let i = 0; i < months; i++) {
    const month = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const p = planMonth(surplus, emergencyFund, settings);
    emergencyFund += p.toEmergency;
    homeSavings += p.toHome;
    investments += p.invest;
    rows.push({ month, ...p, emergencyFund, homeSavings, investments });
  }
  return rows;
}

export const monthLabel = (d) => new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(d);
