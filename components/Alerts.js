import { db } from "@/lib/db";
import AlertsMenu from "@/components/AlertsMenu";

// The open alerts (lib/alerts.js) behind one button at the end of the page header (components/AlertsMenu.js).
export default async function Alerts() {
  const alerts = await db.alert.findMany({ where: { dismissed: false }, orderBy: { createdAt: "desc" }, take: 30 });
  return (
    <AlertsMenu
      alerts={alerts.map((a) => ({
        id: a.id, kind: a.kind, message: a.message, href: a.href,
        when: a.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      }))}
    />
  );
}
