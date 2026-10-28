import { db } from "@/lib/db";
import { loadData } from "@/lib/data";
import { startOfMonth, monthBudget } from "@/lib/budget";
import { fixedItems, monthlyIncome } from "@/lib/base";
import { homeGoal, monthsBetween, ils } from "@/lib/goal";
import { portfolio, projectPortfolio } from "@/lib/holdings";
import { depositMonth, depositDate } from "@/lib/invest-run";

export const dynamic = "force-dynamic";

const date = (d) => d.toLocaleDateString("he-IL");

function Tile({ href, title, value, valueClass = "", children }) {
  return (
    <a href={href} className="card tile">
      <div className="label">{title}</div>
      <div className={`value ${valueClass}`}>{value}</div>
      <div className="label">{children}</div>
      <div className="tile-link">לפרטים ←</div>
    </a>
  );
}

// The dashboard: the home goal on top, then one tile per page with its headline number.
export default async function Home() {
  const { settings, last } = await loadData();
  const today = new Date();
  const month = startOfMonth(today);
  const dMonth = depositMonth(today);
  const [incomes, expenses, loans, spends, funds, plan, folio] = await Promise.all([
    db.income.findMany(),
    db.expense.findMany(),
    db.loan.findMany(),
    db.spend.findMany({ where: { date: { gte: month } } }),
    db.fund.findMany(),
    db.aiPlan.findUnique({ where: { month: dMonth } }),
    portfolio(),
  ]);
  const income = monthlyIncome(incomes, settings, last);
  const items = fixedItems({ expenses, loans, settings, month });
  const b = monthBudget({ income, expenses: items, spends, savingsGoal: settings.savingsGoal, today });
  const fixed = b.standing + b.credit;
  const monthlySaving = Math.max(0, b.leftAfterFixed - settings.monthlyInvest);
  const kerens = funds.filter((f) => f.kind === "keren");
  // The portfolio counts toward the home: today's value, and at the target with the monthly deposit (5% a year assumed).
  const portfolioAtTarget = projectPortfolio(folio.value, settings.monthlyInvest, Math.max(0, monthsBetween(today, settings.targetDate)));
  const g = homeGoal({ settings, homeSavings: last?.homeSavings ?? 0, kerens, monthlySaving, portfolioNow: folio.value, portfolioAtTarget, today });
  const onTrack = monthlySaving >= g.requiredPace;
  const emergency = last?.emergencyFund ?? 0;

  return (
    <>
      <h1>בית עד {settings.targetDate.getFullYear()}</h1>

      <div className="card hero">
        <div className="hero-row">
          <div><div className="label">הון עצמי היום</div><div className="value big">{ils(g.current)}</div></div>
          <div><div className="label">נדרש ({Math.round(settings.equityRatio * 100)}% מ-{ils(settings.targetHomePrice)})</div><div className="value">{ils(g.required)}</div></div>
          <div><div className="label">צפי ב-{date(settings.targetDate)}</div><div className={`value ${g.projected >= g.required ? "pos" : "neg"}`}>{ils(g.projected)}</div></div>
          <div><div className="label">מחיר דירה אפשרי בקצב הזה</div><div className="value">{ils(g.affordablePrice)}</div></div>
        </div>
        <div className="meter" style={{ marginTop: 12 }}><div style={{ width: `${g.pct * 100}%` }} /></div>
        <div className="label" style={{ marginTop: 6 }}>
          {Math.round(g.pct * 100)}% מהיעד · חיסכון לבית {ils(last?.homeSavings ?? 0)} + תיק השקעות {ils(folio.value)} + קרן השתלמות נזילה {ils(g.kerenNow)} ·{" "}
          {g.monthsLeft} חודשים ליעד · צריך לחסוך <b className={onTrack ? "pos" : "neg"}>{ils(g.requiredPace)}</b> בחודש, נשאר לחיסכון{" "}
          <b className={onTrack ? "pos" : "neg"}>{ils(monthlySaving)}</b> (אחרי הוצאות קבועות והשקעה)
        </div>
      </div>

      <div className="blocks">
        <Tile href="/expenses" title="נשאר אחרי הוצאות קבועות" value={ils(b.leftAfterFixed)} valueClass={b.leftAfterFixed > 0 ? "pos" : "neg"}>
          הכנסה {ils(income)} · הוצאות קבועות {ils(fixed)} ({income ? Math.round((fixed / income) * 100) : 0}%)
        </Tile>
        <Tile href="/invest" title={`השקעה ב-${date(depositDate(dMonth))}`} value={ils(settings.monthlyInvest)}>
          {plan ? `${plan.final ? "בדיקה סופית" : "בדיקה"} של Claude מ-${date(plan.createdAt)} · מתכות ${plan.metalsPct}%` : "Claude עוד לא בדק את ההפקדה הזו"}
        </Tile>
        <Tile href="/invest" title="תיק השקעות" value={ils(folio.value)} valueClass={folio.profit >= 0 ? "pos" : "neg"}>
          {folio.rows.length
            ? `הושקע ${ils(folio.cost)} · רווח ${ils(folio.profit)} (${(folio.pct * 100).toFixed(1)}%) · צפי ביעד ${ils(portfolioAtTarget)}`
            : `עוד אין קניות · עם ${ils(settings.monthlyInvest)} בחודש: צפי ביעד ${ils(portfolioAtTarget)}`}
        </Tile>
        <Tile href="/funds" title="קרנות השתלמות" value={ils(kerens.reduce((t, f) => t + f.balance, 0))}>
          לבית ב-{date(settings.targetDate)}: {ils(g.kerenAtTarget)}
          {kerens.filter((f) => f.liquidDate).sort((x, y) => x.liquidDate - y.liquidDate).slice(0, 1).map((f) => ` · נזילה ראשונה ${date(f.liquidDate)}`)}
        </Tile>
        <Tile href="/expenses#balances" title="קרן חירום" value={ils(emergency)} valueClass={emergency >= settings.emergencyTarget ? "pos" : ""}>
          יעד {ils(settings.emergencyTarget)} · מכסה {fixed ? (emergency / fixed).toFixed(1) : 0} חודשי הוצאות קבועות
        </Tile>
      </div>
      {!last && <p className="label" style={{ marginTop: 12 }}>הזן את היתרות (חיסכון לבית, קרן חירום, תיק השקעות) בתחתית דף <a href="/expenses#balances">הוצאות / הכנסות</a>.</p>}
    </>
  );
}
