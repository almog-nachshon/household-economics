import { loadData } from "@/lib/data";
import { planYear, nextFirst, monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";
import Stat from "@/components/Stat";
import Empty from "@/components/Empty";
import { BalanceChart } from "@/components/Charts";

export const dynamic = "force-dynamic";

export default async function Year() {
  const { snapshots, settings, last } = await loadData();
  if (!last || !settings) return <Empty />;
  const rows = planYear(snapshots, settings, nextFirst());
  const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
  const end = rows[rows.length - 1];

  return (
    <>
      <h1>תוכנית ל-12 החודשים הקרובים</h1>
      <p className="label">בהנחה שהעודף יישאר כמו הממוצע של 3 החודשים האחרונים, בלי תשואה.</p>
      <div className="grid">
        <Stat label="סה״כ להשקעות" value={ils(sum("invest"))} />
        <Stat label="סה״כ לקרן חירום" value={ils(sum("toEmergency"))} />
        <Stat label="סה״כ לחיסכון לבית" value={ils(sum("toHome"))} />
        <Stat label="חיסכון לבית בסוף השנה" value={ils(end.homeSavings)} />
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <BalanceChart
          data={rows.map((r) => ({ ...r, label: monthLabel(r.month) }))}
          lines={[
            { key: "homeSavings", name: "חיסכון לבית", color: "#2a7d5f" },
            { key: "emergencyFund", name: "קרן חירום", color: "#3b6fb6" },
            { key: "investments", name: "השקעות", color: "#a0782a" },
          ]}
        />
      </div>

      <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
        <table>
          <thead><tr><th>חודש</th><th>השקעות</th><th>קרן חירום</th><th>לבית</th><th>יתרת קרן חירום</th><th>יתרת חיסכון לבית</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month.toISOString()}>
                <td>{monthLabel(r.month)}</td><td>{ils(r.invest)}</td><td>{ils(r.toEmergency)}</td><td>{ils(r.toHome)}</td>
                <td>{ils(r.emergencyFund)}</td><td>{ils(r.homeSavings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
