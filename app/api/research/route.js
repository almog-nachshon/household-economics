import { researchDetails } from "@/lib/research";

// One symbol's full research (parts, reasons, sources) for the details panel; behind the login like every page.
export const dynamic = "force-dynamic";

export async function GET(req) {
  const symbol = new URL(req.url).searchParams.get("symbol") || "";
  const r = await researchDetails(symbol);
  return r ? Response.json(r) : Response.json({ error: "no research" }, { status: 404 });
}
