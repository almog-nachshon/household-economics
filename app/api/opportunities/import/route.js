import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { COOKIE, verifySession } from "@/lib/session";
import { IMPORT_LIMIT, validateOpportunityResearch } from "@/lib/opportunity-schema.mjs";

function canonicalJson(key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  }
  return value;
}

async function readJson(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > IMPORT_LIMIT) {
        await reader.cancel();
        return null;
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  return { data: JSON.parse(parts.join("")) };
}

export async function POST(request) {
  if (!await verifySession(cookies().get(COOKIE)?.value)) {
    return Response.json({ errors: ["Sign in before importing research."] }, { status: 401 });
  }
  const origin = request.headers.get("origin");
  const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    try {
      if (new URL(origin).host !== expectedHost) return new Response("Forbidden", { status: 403 });
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body) {
    return Response.json({ errors: ["Upload a JSON file."] }, { status: 415 });
  }
  let parsed;
  try {
    parsed = await readJson(request.body);
  } catch {
    return Response.json({ errors: ["The file must contain valid UTF-8 JSON."] }, { status: 400 });
  }
  if (!parsed) return Response.json({ errors: ["The file exceeds 5 MiB."] }, { status: 413 });
  const { data } = parsed;
  const errors = validateOpportunityResearch(data);
  if (errors.length) return Response.json({ errors }, { status: 422 });
  const payload = JSON.stringify(data, canonicalJson);
  const id = createHash("sha256").update(payload).digest("hex");
  try {
    await db.opportunityResearch.create({ data: {
      id, title: data.title, asOf: new Date(data.asOf), schemaVersion: data.schemaVersion,
      screenedCount: data.universe.screenedCount, reportCount: data.reports.length, payload,
    } });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error.code === "P2002") return Response.json({ id, duplicate: true });
    console.error("Opportunity research import failed", error.code ?? error.name);
    return Response.json({ errors: ["The file could not be saved. Check the database and retry."] }, { status: 500 });
  }
}
