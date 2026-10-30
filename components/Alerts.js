import { db } from "@/lib/db";
import { dismissAlert } from "@/lib/alert-actions";

const ICON = { trade: "🔔", stop: "🔻", target: "🎯", advisor: "💡", cash: "💵", enter: "🟢", exit: "🔴" };

// The open alerts (lib/alerts.js) behind one fixed-width button at the end of the page header: "updates (n)",
// highlighted while some are unread; it opens a panel, newest first, and ✕ dismisses one. With none it is a plain,
// unclickable label of the same width, so the buttons beside it never move.
export default async function Alerts() {
  const alerts = await db.alert.findMany({ where: { dismissed: false }, orderBy: { createdAt: "desc" }, take: 30 });
  if (!alerts.length) {
    return (
      <span className="alerts-menu">
        <span className="alerts-btn">🔔 עדכונים (0)</span>
      </span>
    );
  }
  const urgent = alerts.filter((a) => ["stop", "exit", "advisor"].includes(a.kind)).length;
  return (
    <details className={`alerts-menu has${urgent ? " urgent" : ""}`}>
      <summary className="alerts-btn">⚠️ יש עדכונים לקרוא ({alerts.length})</summary>
      <div className="alerts-panel">
        {alerts.map((a) => (
          <form key={a.id} action={dismissAlert} className={`alert alert-${a.kind}`}>
            <span>{ICON[a.kind]}</span>
            <span className="alert-msg">{a.href ? <a href={a.href}>{a.message}</a> : a.message}</span>
            <span className="label alert-time">{a.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" className="secondary" title="סמן כנקרא">✕</button>
          </form>
        ))}
      </div>
    </details>
  );
}
