"use client";
import { useEffect, useRef, useState } from "react";

// A strip of the quarterly reports due in the coming week (holdings in bold), and under it, on request, TradingView's
// economic calendar. Its script loads only when opened. days: [{label, symbols: [{symbol, held}]}].
export default function WeekAhead({ days }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open || !box.current) return;
    const el = box.current;
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    s.async = true;
    s.innerHTML = JSON.stringify({ colorTheme: "light", isTransparent: true, locale: "en", countryFilter: "us,il", importanceFilter: "0,1", width: "100%", height: 420 });
    el.appendChild(s);
    return () => {
      el.innerHTML = "";
    };
  }, [open]);
  return (
    <div className="week-ahead">
      <div className="week-row">
        <b>📅 דוחות השבוע</b>
        {days.length === 0 && <span className="label">אין דוחות קרובים בניירות שלנו</span>}
        {days.map((d) => (
          <span key={d.label} className="week-day">
            <span className="label">{d.label}</span> {d.symbols.map((s, i) => <span key={s.symbol}>{i > 0 && ", "}{s.held ? <b>{s.symbol}</b> : s.symbol}</span>)}
          </span>
        ))}
        <button type="button" className="week-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "סגירת הלוח ▲" : "לוח כלכלי ▼"}</button>
      </div>
      {open && <div className="week-cal tradingview-widget-container" dir="ltr" ref={box} />}
    </div>
  );
}
