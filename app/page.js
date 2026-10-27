import { db } from "@/lib/db";
import { goalStatus, ils } from "@/lib/goal";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [snapshots, settings] = await Promise.all([
    db.snapshot.findMany({ orderBy: { month: "asc" } }),
    db.settings.findUnique({ where: { id: 1 } }),
  ]);
  if (!snapshots.length || !settings) return <p>אין עדיין נתונים. הוסף עדכון חודשי.</p>;

  const g = goalStatus(snapshots, settings);
  const onTrack = g.pace >= g.requiredPace;

  return (
    <>
      <h1>יעד: בית עד {settings.targetDate.getFullYear()}</h1>
      <div className="card">
        <div className="label">הון עצמי לבית: {ils(g.current)} מתוך {ils(g.required)}</div>
        <div className="value">{Math.round(g.pct * 100)}%</div>
        <div className="meter"><div style={{ width: `${g.pct * 100}%` }} /></div>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        <Stat label="קצב חיסכון חודשי" value={ils(g.pace)} />
        <Stat label="קצב נדרש" value={ils(g.requiredPace)} warn={!onTrack} />
        <Stat label="צפי הון עצמי ביעד" value={ils(g.projected)} />
        <Stat label="מחיר דירה אפשרי בקצב הנוכחי" value={ils(g.affordablePrice)} />
        <Stat label="חודשים ליעד" value={g.monthsLeft} />
      </div>
    </>
  );
}

function Stat({ label, value, warn }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`value ${warn ? "warn" : ""}`}>{value}</div>
    </div>
  );
}
