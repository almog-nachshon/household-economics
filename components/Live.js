"use client";
import { createContext, useContext, useEffect, useState } from "react";

// Today's change per symbol, refreshed every minute from /api/live.
const LiveContext = createContext({});

export function LiveQuotes({ symbols, children }) {
  const [quotes, setQuotes] = useState({});
  useEffect(() => {
    const load = () => fetch(`/api/live?symbols=${symbols.join(",")}`).then((r) => r.json()).then(setQuotes).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [symbols.join(",")]);
  return <LiveContext.Provider value={quotes}>{children}</LiveContext.Provider>;
}

// All live quotes under the nearest LiveQuotes, by symbol.
export const useLiveQuotes = () => useContext(LiveContext);

// A change as a colored pill with an arrow; live (from /api/live) when available, else the cached daily figure.
function Pill({ x, live }) {
  if (x == null) return <span className="label">—</span>;
  const up = x >= 0;
  return (
    <span className={`chg ${up ? "chg-up" : "chg-down"}`}>
      {up ? "▲" : "▼"} {Math.abs(x * 100).toFixed(2)}%{live ? <span className="live-dot" /> : null}
    </span>
  );
}

export function LiveChange({ symbol, fallback }) {
  const q = useContext(LiveContext)[symbol];
  return <Pill x={q?.change ?? fallback} live={q?.change != null} />;
}

export function LiveWeek({ symbol }) {
  const q = useContext(LiveContext)[symbol];
  return <Pill x={q?.week} live={q?.week != null} />;
}

const CUR = { USD: "$", GBP: "£", EUR: "€", ILS: "₪" };
// The price right now in its own currency, with the time of the last trade (Israel time).
export function LivePrice({ symbol, ils }) {
  const q = useContext(LiveContext)[symbol];
  if (!q?.price) return <span className="label">{ils || "—"}</span>;
  const t = q.time ? new Date(q.time * 1000).toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <span className="live-price">
      <b dir="ltr">{CUR[q.currency] ?? ""}{q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
      <span className="label">{ils}{t ? ` · ${t}` : ""}</span>
    </span>
  );
}

// NYSE / Nasdaq regular hours 9:30-16:00 New York time, with pre-market and after-hours, and exchange holidays.
const HOLIDAYS = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
];
const EARLY_CLOSE = ["2026-11-27", "2026-12-24", "2027-11-26"]; // 13:00 close

function nyNow(d) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(d).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute), sec: Number(parts.second), weekday: parts.weekday };
}

function status(d) {
  const { date, min, sec, weekday } = nyNow(d);
  // Seconds left until a New York minute mark, for the countdown.
  const until = (m) => (m - min) * 60 - sec;
  const close = EARLY_CLOSE.includes(date) ? 13 * 60 : 16 * 60;
  if (weekday === "Sat" || weekday === "Sun" || HOLIDAYS.includes(date)) return { state: "closed", label: HOLIDAYS.includes(date) ? "סגור (חג בארה״ב)" : "סגור (סוף שבוע)" };
  if (min >= 570 && min < close) return { state: "open", label: "פתוח", left: until(close) };
  if (min >= 240 && min < 570) return { state: "pre", label: "מסחר מוקדם", left: until(570) };
  if (min >= close && min < 20 * 60) return { state: "after", label: "מסחר מאוחר" };
  return { state: "closed", label: "סגור" };
}

// The next regular open (9:30 New York) after `d`, as a real moment: found on that trading day itself, since the gap
// to Israel changes with daylight saving in each country (the US moves a week after Israel in the autumn).
function nextOpen(d) {
  for (let i = 0; i < 10; i++) {
    const { date, weekday } = nyNow(new Date(d.getTime() + i * 864e5));
    if (weekday === "Sat" || weekday === "Sun" || HOLIDAYS.includes(date)) continue;
    const [y, m, day] = date.split("-").map(Number);
    let t = Date.UTC(y, m - 1, day, 14, 30); // about 9:30 in New York; corrected below
    t += (570 - nyNow(new Date(t)).min) * 60000;
    if (t > d.getTime()) return new Date(t);
  }
  return null;
}

const IL = { timeZone: "Asia/Jerusalem" };
const ilClock = (t) => t.toLocaleTimeString("he-IL", { ...IL, hour: "2-digit", minute: "2-digit" });
const ilDay = (t) => t.toLocaleDateString("en-CA", IL);
// "היום ב-16:30" / "מחר ב-16:30" / "ביום שני 2.11 ב-16:30", in Israel time.
function whenIl(t, now) {
  const tomorrow = new Date(now.getTime() + 864e5);
  if (ilDay(t) === ilDay(now)) return `היום ב-${ilClock(t)}`;
  if (ilDay(t) === ilDay(tomorrow)) return `מחר ב-${ilClock(t)}`;
  return `ביום ${t.toLocaleDateString("he-IL", { ...IL, weekday: "long" }).replace("יום ", "")} ${t.toLocaleDateString("he-IL", { ...IL, day: "numeric", month: "numeric" })} ב-${ilClock(t)}`;
}

export function MarketStatus() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const s = status(now);
  const pad = (n) => String(n).padStart(2, "0");
  const clock = (t) => `${Math.floor(t / 3600)}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
  const open = nextOpen(now);
  const hoursLeft = open ? Math.floor((open - now) / 3600000) : null;
  return (
    <span className={`market market-${s.state}`} title={open ? `המסחר הרגיל הבא: ${whenIl(open, now)} עד ${ilClock(new Date(open.getTime() + 390 * 60000))} שעון ישראל` : ""}>
      <span className="market-dot" />
      שוק ארה״ב: {s.label}
      {s.state === "open" && <span className="market-sub"> · נסגר בעוד <span className="market-clock">{clock(s.left)}</span></span>}
      {s.state === "pre" && <span className="market-sub"> · נפתח בעוד <span className="market-clock">{clock(s.left)}</span></span>}
      {s.state !== "open" && s.state !== "pre" && open && (
        <span className="market-sub">
          {" "}· נפתח {whenIl(open, now)}<span className="market-long"> שעון ישראל</span>
          {hoursLeft >= 1 && <span className="market-long">{` (בעוד ${hoursLeft >= 24 ? `${Math.floor(hoursLeft / 24)} ימים ו-` : ""}${hoursLeft % 24} שעות)`}</span>}
        </span>
      )}
    </span>
  );
}

// Today's price line (5-minute points) against yesterday's close, with hour marks in Israel time.
export function IntradayChart({ symbol }) {
  const q = useContext(LiveContext)[symbol];
  const pts = q?.points;
  if (!pts || pts.length < 2) return <div className="intraday intraday-empty">גרף יומי נטען…</div>;
  const W = 300, H = 70;
  const values = pts.map(([, c]) => c).concat(q.prev ?? []);
  const lo = Math.min(...values), hi = Math.max(...values);
  const t0 = pts[0][0], t1 = Math.max(pts[pts.length - 1][0], t0 + 6.5 * 3600);
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (c) => H - 4 - ((c - lo) / (hi - lo || 1)) * (H - 8);
  const line = pts.map(([t, c], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  const up = pts[pts.length - 1][1] >= (q.prev ?? pts[0][1]);
  const color = up ? "#1e8e3e" : "#d93025";
  const hours = [];
  for (let t = Math.ceil(t0 / 3600) * 3600; t <= t1; t += 3600) hours.push(t);
  const hh = (t) => new Date(t * 1000).toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="intraday" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H + 14}`} preserveAspectRatio="none" role="img" aria-label="גרף יומי">
        {hours.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1="0" y2={H} stroke="#e3ecee" strokeWidth="1" />
            <text x={x(t)} y={H + 11} fontSize="8" fill="#66757d" textAnchor="middle">{hh(t)}</text>
          </g>
        ))}
        {q.prev && <line x1="0" x2={W} y1={y(q.prev)} y2={y(q.prev)} stroke="#9aa5ad" strokeDasharray="3 3" strokeWidth="1" />}
        <path d={`${line} L${x(pts[pts.length - 1][0]).toFixed(1)},${H} L0,${H} Z`} fill={color} opacity="0.12" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.8" />
      </svg>
    </div>
  );
}
