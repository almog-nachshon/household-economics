import { ibkrEnabled, syncIbkr } from "@/lib/ibkr";
import { logEngine } from "@/lib/engine-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Called by the server's cron every morning (see CLAUDE.md): pulls the IBKR statement and raises the alerts, and logs
// the candidate engine's dated predictions for its forward test.
export async function POST(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  await logEngine().catch((e) => console.error("engine log failed:", e.message));
  if (!ibkrEnabled()) return new Response("IBKR_FLEX_TOKEN / IBKR_FLEX_QUERY_ID are not set", { status: 503 });
  try {
    return Response.json(await syncIbkr());
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
