"use client";
import { useState } from "react";

export default function MarketConnection({ configured }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  async function check() {
    setPending(true);
    try {
      const response = await fetch("/api/market/status", { method: "POST", headers: { "x-market-status": "check" } });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error();
      setResult(await response.json());
    } catch { setResult({ connected: false, message: "בדיקת החיבור לא הושלמה. נסה שוב." }); }
    finally { setPending(false); }
  }
  return (
    <section className="card market-connection" aria-labelledby="market-connection-title">
      <h2 id="market-connection-title">חיבור ל־API של מחירי שוק</h2>
      <p><b>Finnhub:</b> {configured ? "מפתח מוגדר בשרת · משולב בשערוך ההחזקות" : "לא מוגדר"}</p>
      <p className="label">החיבור מתאים לניירות אמריקאיים נתמכים בדולר. המערכת בודקת התאמת נייר וזמן מחיר, בוחרת את המחיר המתאים העדכני ביותר מבין Finnhub ו־Yahoo, וחוזרת למחיר IBKR כשאין מחיר מתאים. הגרפים מבוססים על Yahoo.</p>
      <p className="label">נשמר מטמון למשך דקה ומוגבלת כמות הבקשות כדי לצמצם חריגה מהמכסה. זמינות נתונים וזמן אמת תלויים בהרשאות ובתוכנית אצל הספק. המפתח נשאר בשרת ואינו נשלח לדפדפן.</p>
      <button type="button" disabled={pending || !configured} onClick={check}>{pending ? "בודק חיבור…" : "בדוק חיבור עכשיו"}</button>
      <div role="status" aria-live="polite">{result && <p>{result.connected ? "✓ " : "⚠ "}{result.message}{result.quoteTime && <> זמן המחיר: {new Date(result.quoteTime).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}.</>}</p>}</div>
      <p><a href="https://finnhub.io/pricing" target="_blank" rel="noreferrer">מסלולים ומגבלות Finnhub</a> · <a href="https://finnhub.io/docs/api/quote" target="_blank" rel="noreferrer">תיעוד API</a></p>
    </section>
  );
}
