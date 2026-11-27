import { opportunitySchema } from "@/lib/opportunity-schema.mjs";

export function GET() {
  return Response.json(opportunitySchema, {
    headers: { "Content-Disposition": 'attachment; filename="opportunity-research-4.1.schema.json"' },
  });
}
