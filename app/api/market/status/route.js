import { cookies } from "next/headers";
import { COOKIE, verifySession } from "@/lib/session";
import { finnhubEnabled, finnhubQuote } from "@/lib/finnhub";

export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!(await verifySession(cookies().get(COOKIE)?.value))) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (req.headers.get("x-market-status") !== "check") return Response.json({ error: "forbidden" }, { status: 403 });
  if (!finnhubEnabled()) return Response.json({ connected: false, message: "אין מפתח Finnhub מוגדר בשרת. מקור הגיבוי נשאר פעיל." });
  try {
    const quote = await finnhubQuote("AAPL");
    const age = Math.max(0, Math.round((Date.now() / 1000 - quote.t) / 60));
    return Response.json({ connected: true, checkedAt: Date.now(), quoteTime: quote.t * 1000, message: `חיבור Finnhub תקין. התקבל מחיר בדיקה עבור AAPL; המחיר בן ${age} דקות. בשוק סגור זה עשוי להיות מחיר הסגירה האחרון.` });
  } catch (e) {
    const message = e.message === "rate_limit" ? "הגענו למכסת הבקשות הזמנית. נסה שוב בעוד דקה; מקור הגיבוי ממשיך לפעול." : e.message === "access_denied" ? "המפתח נדחה או שאין הרשאה לנתון הזה. מקור הגיבוי ממשיך לפעול." : "הספק לא החזיר מחיר תקין כרגע. מקור הגיבוי ממשיך לפעול.";
    return Response.json({ connected: false, message });
  }
}
