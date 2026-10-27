import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { loadData } from "@/lib/data";
import { planMonth, monthlySurplus, nextFirst, monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";
import Stat from "@/components/Stat";
import Empty from "@/components/Empty";

export const dynamic = "force-dynamic";

async function markDone(formData) {
  "use server";
  const month = new Date(formData.get("month"));
  const data = Object.fromEntries(["emergency", "home", "investments"].map((k) => [k, Number(formData.get(k))]));
  await db.deposit.upsert({ where: { month }, update: data, create: { month, ...data } });
  revalidatePath("/deposit");
}

async function undo(formData) {
  "use server";
  await db.deposit.deleteMany({ where: { month: new Date(formData.get("month")) } });
  revalidatePath("/deposit");
}

export default async function NextMonth() {
  const { snapshots, settings, last } = await loadData();
  if (!last || !settings) return <Empty />;
  const month = nextFirst();
  const done = await db.deposit.findUnique({ where: { month } });
  const p = planMonth(monthlySurplus(snapshots), last.emergencyFund, settings);

  return (
    <>
      <h1>הפקדה ב-1 ל{monthLabel(month)}</h1>
      <p className="label">לפי העודף הממוצע של 3 החודשים האחרונים.</p>
      <div className="card">
        <div className="label">סה״כ להפקיד</div>
        <div className="value">{ils(p.total)}</div>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        <Stat label="להשקעות (ETF)" value={ils(p.invest)} />
        <Stat label="לקרן חירום" value={ils(p.toEmergency)} hint={p.toEmergency === 0 ? "הקרן מלאה" : undefined} />
        <Stat label="לחיסכון לבית" value={ils(p.toHome)} />
        <Stat label="נשאר בעו״ש" value={ils(p.buffer)} warn={p.surplus <= 0} />
      </div>

      {p.investSplit.length > 0 && (
        <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <h2>חלוקת ההשקעה</h2>
          <table>
            <thead><tr><th>קרן</th><th>שם</th><th>%</th><th>סכום</th></tr></thead>
            <tbody>
              {p.investSplit.map((a) => (
                <tr key={a.ticker}><td>{a.ticker}</td><td>{a.name}</td><td>{a.pct}%</td><td>{ils(a.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {done ? (
          <form action={undo}>
            <p>✅ סומן כהופקד ב-{done.createdAt.toLocaleDateString("he-IL")}</p>
            <input type="hidden" name="month" value={month.toISOString()} />
            <button type="submit" className="secondary">ביטול הסימון</button>
          </form>
        ) : (
          <form action={markDone}>
            <input type="hidden" name="month" value={month.toISOString()} />
            <input type="hidden" name="emergency" value={p.toEmergency} />
            <input type="hidden" name="home" value={p.toHome} />
            <input type="hidden" name="investments" value={p.invest} />
            <button type="submit">הפקדתי ✓</button>
          </form>
        )}
      </div>
    </>
  );
}
