"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { dismissAlert, dismissAllAlerts } from "@/lib/alert-actions";

const ICON = { trade: "🔔", stop: "🔻", target: "🎯", advisor: "💡", cash: "💵", enter: "🟢", exit: "🔴" };

// The button and panel of the open alerts. A dismissed alert leaves the list at once, and the page refreshes behind it;
// if saving fails it comes back with a note. A click outside or Esc closes the panel. alerts: [{id, kind, message, href,
// when}], newest first. With none it is a plain label of the same width, so the buttons beside it never move.
export default function AlertsMenu({ alerts }) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(() => new Set());
  const [failed, setFailed] = useState(false);
  const [, start] = useTransition();
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const shown = alerts.filter((a) => !gone.has(a.id));
  const hide = (ids, save) => {
    setFailed(false);
    setGone((g) => new Set([...g, ...ids]));
    start(async () => {
      try {
        await save();
      } catch {
        setFailed(true);
        setGone((g) => new Set([...g].filter((id) => !ids.includes(id))));
      }
    });
  };
  if (!shown.length) {
    return (
      <span className="alerts-menu">
        <span className="alerts-btn">🔔 עדכונים (0)</span>
      </span>
    );
  }
  const urgent = shown.some((a) => ["stop", "exit", "advisor"].includes(a.kind));
  return (
    <div className={`alerts-menu has${urgent ? " urgent" : ""}`} ref={box}>
      <button type="button" className="alerts-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⚠️ יש עדכונים לקרוא ({shown.length})</button>
      {open && (
        <div className="alerts-panel">
          <div className="alerts-head">
            <button type="button" className="alerts-all" onClick={() => (hide(shown.map((a) => a.id), () => dismissAllAlerts()), setOpen(false))}>סמן הכול כנקרא</button>
            <button type="button" className="alerts-close" aria-label="סגירה" onClick={() => setOpen(false)}>סגירה ✕</button>
          </div>
          {failed && <p className="warn">השמירה נכשלה. אפשר לנסות שוב.</p>}
          {shown.map((a) => (
            <div key={a.id} className={`alert alert-${a.kind}`}>
              <span>{ICON[a.kind]}</span>
              <span className="alert-msg">{a.href ? <a href={a.href}>{a.message}</a> : a.message}</span>
              <span className="label alert-time">{a.when}</span>
              <button type="button" className="secondary" title="סמן כנקרא" aria-label="סמן כנקרא" onClick={() => hide([a.id], () => dismissAlert(a.id))}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
