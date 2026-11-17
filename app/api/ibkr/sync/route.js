import { cookies } from "next/headers";
import { COOKIE, verifySession } from "@/lib/session";
import { ibkrEnabled, syncIbkr } from "@/lib/ibkr";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req) {
  if (!(await verifySession(cookies().get(COOKIE)?.value))) return Response.json({ error: "unauthorized" }, { status: 401 });
  // The browser sends this header only from our own client; cross-origin callers cannot set it without preflight.
  if (req.headers.get("x-ibkr-sync") !== "site-open") return Response.json({ error: "forbidden" }, { status: 403 });
  if (!ibkrEnabled()) return Response.json({ disabled: true });
  try {
    await syncIbkr();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "העדכון מאינטראקטיב נכשל. הנתונים הקודמים נשמרו; אפשר לנסות שוב." }, { status: 502 });
  }
}
