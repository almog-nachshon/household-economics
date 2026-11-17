"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function BrokerAutoSync() {
  const pathname = usePathname();
  const router = useRouter();
  const started = useRef(false);
  const running = useRef(false);
  const [state, setState] = useState("idle");

  async function refresh() {
    if (running.current) return;
    running.current = true;
    setState("pending");
    try {
      const response = await fetch("/api/ibkr/sync", {
        method: "POST", headers: { "x-ibkr-sync": "site-open" }, cache: "no-store",
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("sync failed");
      const result = await response.json();
      setState(result.disabled ? "idle" : "done");
      if (result.ok) router.refresh();
    } catch {
      setState("error");
    } finally {
      running.current = false;
    }
  }

  useEffect(() => {
    if (pathname === "/login") { started.current = false; return; }
    if (!started.current) { started.current = true; refresh(); }
    const restored = (event) => { if (event.persisted) refresh(); };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/" && !pathname.startsWith("/invest")) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible" && !running.current) router.refresh(); }, 60000);
    return () => clearInterval(timer);
  }, [pathname, router]);

  if (pathname === "/login" || state === "idle") return null;
  return (
    <div className="broker-auto-sync" role="status" aria-live="polite">
      {state === "pending" ? "מעדכן החזקות, מזומן ועסקאות מאינטראקטיב… אפשר להמשיך לגלוש." : state === "done" ? "✓ נתוני הברוקר עודכנו. השערוך משלב מחירי שוק זמינים ומתעדכן מדי דקה; ייתכן עיכוב בנתוני השוק." : <>העדכון מאינטראקטיב לא הושלם. מוצגים נתוני החשבון השמורים עם מחירי השוק הזמינים. <button type="button" onClick={refresh}>נסה שוב</button></>}
    </div>
  );
}
