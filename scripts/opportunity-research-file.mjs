import { readFileSync } from "node:fs";
import { IMPORT_LIMIT, opportunitySchema, validateOpportunityResearch } from "../lib/opportunity-schema.mjs";

if (process.argv[2] === "--schema") {
  console.log(JSON.stringify(opportunitySchema));
} else {
  try {
    const raw = readFileSync(process.argv[2]);
    if (raw.length > IMPORT_LIMIT) throw new Error("Research file exceeds the import size limit.");
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (process.argv[3] === "--allow-closed-market" && data?.marketClosed === true
      && typeof data.reason === "string" && data.reason.trim()
      && typeof data.source === "string" && new URL(data.source).hostname === "www.nyse.com") {
      console.log("closed");
    } else {
      const errors = validateOpportunityResearch(data);
      if (errors.length) throw new Error(errors.join("\n"));
      console.log("research");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
