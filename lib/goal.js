import { project } from "@/lib/funds";

export function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

// The home goal. Equity today = home savings + the investment portfolio + the kerens marked "for home" that are
// liquid by the target date. At the target date it adds what is saved each month (after fixed costs and the
// investment deposit), the portfolio with its monthly deposits, and the kerens' growth. The new keren hishtalmut
// is liquid only in 2032, so it is not counted.
export function homeGoal({ settings, homeSavings, kerens, monthlySaving, portfolioNow = 0, portfolioAtTarget = 0, today = new Date() }) {
  const target = settings.targetDate;
  const required = settings.targetHomePrice * settings.equityRatio;
  const forHome = kerens.filter((f) => f.forHome && f.liquidDate && f.liquidDate <= target);
  const kerenNow = forHome.reduce((t, f) => t + project(f, today).value, 0);
  const kerenAtTarget = forHome.reduce((t, f) => t + project(f, target).value, 0);
  const monthsLeft = Math.max(1, monthsBetween(today, target));
  const current = homeSavings + kerenNow + portfolioNow;
  const projected = homeSavings + monthlySaving * monthsLeft + kerenAtTarget + portfolioAtTarget;
  return {
    required,
    current,
    pct: Math.min(1, current / required),
    kerenNow,
    kerenAtTarget,
    monthsLeft,
    projected,
    requiredPace: Math.max(0, (required - homeSavings - kerenAtTarget - portfolioAtTarget) / monthsLeft),
    affordablePrice: projected / settings.equityRatio,
  };
}

export const ils = (n) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
