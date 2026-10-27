import { loadData } from "@/lib/data";
import { monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";
import Stat from "@/components/Stat";
import Empty from "@/components/Empty";
import { BalanceChart } from "@/components/Charts";

export const dynamic = "force-dynamic";

export default async function Emergency() {
  const { snapshots, settings, last } = await loadData();
  if (!last || !settings) return <Empty />;
  const pct = Math.min(1, last.emergencyFund / settings.emergencyTarget);
  const monthsCovered = last.expenses > 0 ? last.emergencyFund / last.expenses : 0;

  return (
    <>
      <h1>קרן חירום</h1>
      <div className="card">
        <div className="label">{ils(last.emergencyFund)} מתוך {ils(settings.emergencyTarget)}</div>
        <div className="value">{Math.round(pct * 100)}%</div>
        <div className="meter"><div style={{ width: `${pct * 100}%` }} /></div>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        <Stat label="חודשי הוצאות מכוסים" value={monthsCovered.toFixed(1)} warn={monthsCovered < 4} hint="יעד: 4-5 חודשים" />
        <Stat label="חסר ליעד" value={ils(Math.max(0, settings.emergencyTarget - last.emergencyFund))} />
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <BalanceChart
          data={snapshots.map((s) => ({ label: monthLabel(s.month), emergencyFund: s.emergencyFund }))}
          lines={[{ key: "emergencyFund", name: "קרן חירום", color: "#0fa3a3" }]}
          target={settings.emergencyTarget}
        />
      </div>
    </>
  );
}
