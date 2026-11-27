import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { brokerState } from "@/lib/ibkr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Only research-relevant fields leave the server. No account number,
// broker token, credentials, trade IDs or personally identifying data.
export async function GET() {
  const [settings, broker] = await Promise.all([getSettings(), brokerState()]);
  const holdings = broker?.asOf
    ? broker.positions.map(p => ({
        symbol: p.symbol, exchange: p.exchange || null,
        currency: p.currency, units: p.units,
        marketValue: p.value, averageCostValue: p.cost,
        assetClass: p.assetClass
      }))
    : (await db.investPick.findMany({ orderBy: { month: "asc" } })).map(p => ({
        symbol: p.symbol, currency: "ILS", units: p.units,
        historicalContributionILS: p.amount, investedAt: p.month.toISOString().slice(0, 10)
      }));
  const snapshot = {
    schemaVersion: "1.0", generatedAt: new Date().toISOString(),
    broker: "Interactive Israel", monthlyContributionILS: settings.monthlyInvest,
    investmentHorizonYears: [3, 5], riskTolerance: "moderate",
    holdingsAsOf: broker?.asOf?.toISOString().slice(0, 10) || null,
    holdings, cash: broker?.cash?.map(c => ({ currency: c.currency, amount: c.amount })) || [],
    notes: [
      "No leverage. Do not submit broker orders.",
      "Verify timestamps, prices, broker permissions and FX costs before any trade.",
      "Past research rankings are not purchase instructions."
    ]
  };
  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=portfolio-research-context.json", "Cache-Control": "no-store" }
  });
}
