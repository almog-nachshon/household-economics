import { db } from "@/lib/db";
import { dismissAlert } from "@/lib/alert-actions";

const ICON = { trade: "🔔", stop: "🔻", target: "🎯", advisor: "💡", cash: "💵", enter: "🟢", exit: "🔴" };

// The open alerts (lib/alerts.js) behind one button in the page header: "updates (n)", highlighted while some are
// unread; it opens a panel, newest first, and ✕ dismisses one.
export default async function Alerts() {
  const alerts = await db.alert.findMany({ where: { dismissed: false }, orderBy: { createdAt: "desc" }, take: 30 });
  const urgent = alerts.filter((a) => ["stop", "exit", "advisor"].includes(a.kind)).length;
  return (
    <details className={`alerts-menu${alerts.length ? " has" : ""}${urgent ? " urgent" : ""}`}>
      <summary>
        {alerts.length ? `⚠️ יש עדכונים לקרוא (${alerts.length})` : "🔔 עדכונים (0)"}
      </summary>
      <div className="alerts-panel">
        {alerts.length === 0 ? (
          <p className="label">אין עדכונים חדשים.</p>
        ) : (
          alerts.map((a) => (
            <form key={a.id} action={dismissAlert} className={`alert alert-${a.kind}`}>
              <span>{ICON[a.kind]}</span>
              <span className="alert-msg">{a.href ? <a href={a.href}>{a.message}</a> : a.message}</span>
              <span className="label">{a.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" className="secondary" title="סמן כנקרא">✕</button>
            </form>
          ))
        )}
      </div>
    </details>
  );
}
