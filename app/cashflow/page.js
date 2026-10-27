import { loadData } from "@/lib/data";
import { monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";
import Stat from "@/components/Stat";
import Empty from "@/components/Empty";
import { CashflowChart } from "@/components/Charts";

export const dynamic = "force-dynamic";

export default async function Cashflow() {
  const { snapshots, last } = await loadData();
  if (!last) return <Empty />;
  const avg = (k) => snapshots.reduce((t, s) => t + s[k], 0) / snapshots.length;
  const surplus = last.netIncome - last.expenses;

  return (
    <>
      <h1>תזרים חודשי</h1>
      <div className="grid">
        <Stat label={`הכנסות ${monthLabel(last.month)}`} value={ils(last.netIncome)} />
        <Stat label={`הוצאות ${monthLabel(last.month)}`} value={ils(last.expenses)} />
        <Stat label="עודף" value={ils(surplus)} warn={surplus <= 0} />
        <Stat label="עודף ממוצע" value={ils(avg("netIncome") - avg("expenses"))} />
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <CashflowChart data={snapshots.map((s) => ({ label: monthLabel(s.month), income: s.netIncome, expenses: s.expenses }))} />
      </div>
    </>
  );
}
