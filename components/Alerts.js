import { db } from "@/lib/db";
import { dismissAlert } from "@/lib/alert-actions";

const ICON = { trade: "🔔", stop: "🔻", target: "🎯", advisor: "💡", cash: "💵", enter: "🟢", exit: "🔴" };

// The open alerts (lib/alerts.js), newest first; ✕ dismisses one.
export default async function Alerts() {
  const alerts = await db.alert.findMany({ where: { dismissed: false }, orderBy: { createdAt: "desc" }, take: 20 });
  if (!alerts.length) return null;
  return (
    <div className="alerts">
      {alerts.map((a) => (
        <form key={a.id} action={dismissAlert} className={`alert alert-${a.kind}`}>
          <span>{ICON[a.kind]}</span>
          <span className="alert-msg">{a.href ? <a href={a.href}>{a.message}</a> : a.message}</span>
          <span className="label">{a.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="secondary" title="סגירה">✕</button>
        </form>
      ))}
    </div>
  );
}
