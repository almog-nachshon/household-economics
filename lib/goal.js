// Money counted toward the home down payment. The new keren hishtalmut is
// only liquid in 2032, so it is excluded (it can back a balloon loan instead).
export function homeEquity(s) {
  return s.homeSavings + s.kerenOld;
}

export function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function goalStatus(snapshots, settings) {
  const last = snapshots[snapshots.length - 1];
  const first = snapshots[0];
  const required = settings.targetHomePrice * settings.equityRatio;
  const current = homeEquity(last);
  const span = Math.max(1, monthsBetween(first.month, last.month));
  const pace = snapshots.length > 1 ? (current - homeEquity(first)) / span : 0;
  const monthsLeft = Math.max(1, monthsBetween(last.month, settings.targetDate));
  const projected = current + pace * monthsLeft;
  return {
    required,
    current,
    pct: Math.min(1, current / required),
    pace,
    requiredPace: Math.max(0, (required - current) / monthsLeft),
    projected,
    affordablePrice: projected / settings.equityRatio,
    monthsLeft,
  };
}

export const ils = (n) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
