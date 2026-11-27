import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { validateOpportunityReport } from "@/lib/opportunity-report.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_BYTES = 1024 * 1024;
const headers = { "Cache-Control": "no-store" };

function error(message, status) { return Response.json({ error: message }, { status, headers }); }
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  // Browsers send Origin for POST. When absent, enforce Fetch Metadata;
  // non-browser clients still rely on the session middleware and JSON validation.
  if (origin && origin !== target.origin) return false;
  const site = request.headers.get("sec-fetch-site");
  return !site || ["same-origin", "none"].includes(site);
}

export async function GET() {
  const rows = await db.opportunityReport.findMany({ orderBy: [{ researchDate: "desc" }, { createdAt: "desc" }], take: 24 });
  return Response.json({ reports: rows.map(r => JSON.parse(r.payload)) }, { headers });
}

export async function POST(request) {
  if (!sameOrigin(request)) return error("Cross-origin import is blocked", 403);
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return error("application/json required", 415);
  const size = Number(request.headers.get("content-length"));
  if (Number.isFinite(size) && size > MAX_BYTES) return error("Research report exceeds 1MB", 413);
  let raw;
  try { raw = await request.text(); } catch { return error("Could not read request", 400); }
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return error("Research report exceeds 1MB", 413);
  let report;
  try { report = JSON.parse(raw); } catch { return error("Invalid JSON", 400); }
  const validated = validateOpportunityReport(report);
  if (!validated.ok) return Response.json({ error: "Report validation failed", details: validated.errors.slice(0, 15) }, { status: 422, headers });
  const payload = JSON.stringify(report);
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const existing = await db.opportunityReport.findUnique({ where: { reportId: report.reportId } });
  if (existing) {
    if (existing.sha256 === sha256) return Response.json({ saved: false, alreadyExists: true, reportId: report.reportId }, { headers });
    return error("This reportId already exists with different content; use a new revision ID", 409);
  }
  try {
    await db.opportunityReport.create({ data: { reportId: report.reportId, researchDate: report.researchDate, payload, sha256 } });
  } catch (e) {
    if (e.code === "P2002") return error("Duplicate report ID", 409);
    console.error("Opportunity import failed", e.code || e.name);
    return error("Report could not be saved", 500);
  }
  return Response.json({ saved: true, reportId: report.reportId }, { status: 201, headers });
}
