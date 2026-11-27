// Versioned, offline-only ChatGPT research import contract. No broker orders or LLM calls.
export const REPORT_SCHEMA_VERSION = "1.0";
const validDate = (x) => { if (typeof x !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(x)) return false; const d = new Date(x + "T00:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === x; };
const finite = (x) => typeof x === "number" && Number.isFinite(x);
const text = (x) => typeof x === "string" && x.trim().length > 0;
const validUrl = (url) => { try { return new URL(url).protocol === "https:"; } catch { return false; } };

export function validateOpportunityReport(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["Expected a JSON object"] };
  if (input.schemaVersion !== REPORT_SCHEMA_VERSION) errors.push("Unsupported schemaVersion (expected 1.0)");
  if (!text(input.reportId) || input.reportId.length > 120) errors.push("reportId is required (max 120 characters)");
  if (!validDate(input.researchDate)) errors.push("researchDate must be a real YYYY-MM-DD date");
  if (!Array.isArray(input.candidates) || input.candidates.length < 1 || input.candidates.length > 100) errors.push("candidates must contain 1–100 securities");
  const ids = new Set();
  if (Array.isArray(input.candidates)) input.candidates.slice(0, 101).forEach((c, i) => {
    const prefix = `candidates[${i}]`;
    if (!c || typeof c !== "object" || Array.isArray(c)) { errors.push(`${prefix} must be an object`); return; }
    if (!text(c.symbol) || !/^[A-Za-z0-9.^_-]{1,24}$/.test(c.symbol)) errors.push(`${prefix}.symbol is invalid`);
    if (!text(c.exchange) || !text(c.currency)) errors.push(`${prefix} requires exchange and currency`);
    const key = `${c.symbol}:${c.exchange}`.toUpperCase();
    if (ids.has(key)) errors.push(`${prefix} is duplicated`);
    ids.add(key);
    if (!finite(c.opportunityScore) || c.opportunityScore < 0 || c.opportunityScore > 100) errors.push(`${prefix}.opportunityScore must be 0–100`);
    if (c.portfolioFitScore != null && (!finite(c.portfolioFitScore) || c.portfolioFitScore < 0 || c.portfolioFitScore > 100)) errors.push(`${prefix}.portfolioFitScore must be 0–100 or null`);
    if (!["momentum", "earnings", "value", "growth", "recovery", "other"].includes(c.strategy)) errors.push(`${prefix}.strategy is invalid`);
    if (!["WATCH", "REVIEW", "AVOID"].includes(c.decision)) errors.push(`${prefix}.decision must be WATCH, REVIEW or AVOID`);
    if (!text(c.thesis) || !Array.isArray(c.risks) || !c.risks.every(text)) errors.push(`${prefix} requires thesis and risks[]`);
    if (!Array.isArray(c.sources) || c.sources.length === 0 || !c.sources.every(s => s && validUrl(s.url) && text(s.title) && validDate(s.asOf) && s.asOf <= input.researchDate)) errors.push(`${prefix} requires dated HTTPS sources observed no later than researchDate`);
    if (!["verified", "partial", "unverified"].includes(c.dataConfidence)) errors.push(`${prefix}.dataConfidence is invalid`);
    if (!["verified", "unverified"].includes(c.brokerAvailability)) errors.push(`${prefix}.brokerAvailability is invalid`);
    if (c.brokerAvailability === "verified" && (!text(c.brokerVerifiedAt) || !validDate(c.brokerVerifiedAt) || c.brokerVerifiedAt > input.researchDate || !text(c.brokerEvidence))) errors.push(`${prefix}: broker verification requires dated evidence`);
    if (c.marketPrice != null && (!finite(c.marketPrice) || c.marketPrice <= 0 || !validDate(c.priceAsOf) || c.priceAsOf > input.researchDate)) errors.push(`${prefix}: market price requires a positive price and an observation date`);
  });
  return { ok: errors.length === 0, errors };
}

export function rankOpportunities(report) {
  return [...report.candidates].sort((a, b) =>
    b.opportunityScore - a.opportunityScore || (b.portfolioFitScore ?? -1) - (a.portfolioFitScore ?? -1) || a.symbol.localeCompare(b.symbol));
}
