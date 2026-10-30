import { db } from "@/lib/db";
import { CANDIDATES } from "@/lib/portfolio";
import { raiseAlerts } from "@/lib/alerts";

// Interactive Brokers, read-only. The account (positions, trades, cash) comes from the Flex Web Service: a Flex Query
// set up in the IBKR portal (Open Positions summary, Trades by execution, Cash Report, currency rates; XML, dates
// dd/MM/yyyy) and a token limited to the server's IP, in IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID. Statements are end
// of day. Each candidate's exact instrument (conid) comes from IBKR's public product search.
const FLEX = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
const SEARCH = "https://www.interactivebrokers.com/webrest/search/products-by-filters";
const HEADERS = { "User-Agent": "finance-dashboard/1.0" };

export const ibkrEnabled = () => Boolean(process.env.IBKR_FLEX_TOKEN && process.env.IBKR_FLEX_QUERY_ID);

// The instrument's page at IBKR (opens in the portal when logged in) and its public contract details.
export const ibkrQuoteUrl = (conid) => (process.env.IBKR_QUOTE_URL || "https://www.interactivebrokers.com/portal/#/quote/{conid}").replace("{conid}", conid);
export const ibkrDetailsUrl = (conid) => `https://contract.ibkr.info/v3.10/index.php?action=Details&site=GEN&conid=${conid}`;

const tag = (xml, name) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// The attributes of every <name .../> element.
const rows = (xml, name) =>
  [...xml.matchAll(new RegExp(`<${name}\\s([^>]*?)/?>`, "g"))].map((m) =>
    Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, decode(v)])),
  );
const num = (s) => (s == null || s === "" ? 0 : Number(s));
// "dd/MM/yyyy" (optionally ";HHmmss") as a UTC date.
const day = (s) => {
  const [d, m, y] = s.split(";")[0].split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

async function fetchStatement() {
  const t = process.env.IBKR_FLEX_TOKEN;
  const sent = await (await fetch(`${FLEX}/SendRequest?t=${t}&q=${process.env.IBKR_FLEX_QUERY_ID}&v=3`, { headers: HEADERS, cache: "no-store" })).text();
  if (tag(sent, "Status") !== "Success") throw new Error(`IBKR: ${tag(sent, "ErrorMessage") ?? sent.slice(0, 200)}`);
  const url = tag(sent, "Url") ?? `${FLEX}/GetStatement`;
  // The statement takes a few seconds to generate; until then IBKR answers with code 1019.
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const xml = await (await fetch(`${url}?t=${t}&q=${tag(sent, "ReferenceCode")}&v=3`, { headers: HEADERS, cache: "no-store" })).text();
    if (xml.includes("<FlexQueryResponse")) return xml;
    if (tag(xml, "ErrorCode") !== "1019") throw new Error(`IBKR: ${tag(xml, "ErrorMessage") ?? xml.slice(0, 200)}`);
  }
  throw new Error("IBKR: the statement was not ready after a minute");
}

// IBKR's symbol as the candidate it is in lib/portfolio.js (London funds carry .L there, spot metals are tracked by
// their futures), so holdings meet the advisor's picks; anything else keeps IBKR's symbol.
const METALS = { XAUUSD: "GC=F", XAGUSD: "SI=F" };
function candidateOf(symbol) {
  if (METALS[symbol]) return METALS[symbol];
  if (CANDIDATES[symbol]) return symbol;
  if (CANDIDATES[`${symbol}.L`]) return `${symbol}.L`;
  return symbol;
}

// Pulls the latest statement, stores positions, cash and new trades, and raises the alerts. Throws (after storing the
// error for the pages) when IBKR fails.
export async function syncIbkr() {
  try {
    const xml = await fetchStatement();
    const stmt = rows(xml, "FlexStatement")[0] ?? {};
    const positions = rows(xml, "OpenPosition")
      .map((p) => ({
        symbol: candidateOf(p.symbol), ibSymbol: p.symbol, conid: num(p.conid), name: p.description ?? p.symbol, assetClass: p.assetCategory,
        currency: p.currency, units: num(p.position ?? p.quantity), markPrice: num(p.markPrice), value: num(p.positionValue), cost: num(p.costBasisMoney),
      }))
      .filter((p) => p.units);
    const cash = rows(xml, "CashReportCurrency")
      .filter((c) => c.currency !== "BASE_SUMMARY")
      .map((c) => ({ currency: c.currency, amount: num(c.endingCash) }))
      .filter((c) => Math.abs(c.amount) >= 0.01);
    // ILS per unit of each currency on the latest day the statement has a rate for.
    const rates = {};
    const latest = {};
    for (const r of rows(xml, "ConversionRate")) {
      if (r.toCurrency !== "ILS") continue;
      const d = day(r.reportDate);
      if (!latest[r.fromCurrency] || d > latest[r.fromCurrency]) [latest[r.fromCurrency], rates[r.fromCurrency]] = [d, num(r.rate)];
    }
    rates.ILS = 1;
    const trades = rows(xml, "Trade")
      .filter((t) => t.tradeID)
      .map((t) => ({
        tradeId: t.tradeID, date: day(t.tradeDate), symbol: t.assetCategory === "CASH" ? t.symbol : candidateOf(t.symbol), name: t.description ?? t.symbol,
        assetClass: t.assetCategory, side: t.buySell, units: num(t.quantity), price: num(t.tradePrice), currency: t.currency, money: num(t.tradeMoney),
      }));

    const known = new Set((await db.brokerTrade.findMany({ select: { tradeId: true } })).map((t) => t.tradeId));
    const fresh = trades.filter((t) => !known.has(t.tradeId));
    const asOf = stmt.toDate ? day(stmt.toDate) : new Date();
    const toIls = (x, c) => x * (rates[c] ?? 0);
    const held = positions.reduce((t, p) => t + toIls(p.value, p.currency), 0);
    const profit = held - positions.reduce((t, p) => t + toIls(p.cost, p.currency), 0);
    const value = held + cash.reduce((t, c) => t + toIls(c.amount, c.currency), 0);
    const data = { fetchedAt: new Date(), asOf, positions: JSON.stringify(positions), cash: JSON.stringify(cash), rates: JSON.stringify(rates), error: "" };
    await db.$transaction([
      db.brokerState.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } }),
      db.brokerDay.upsert({ where: { date: asOf }, update: { value, profit }, create: { date: asOf, value, profit } }),
      ...fresh.map((t) => db.brokerTrade.create({ data: t })),
    ]);
    // On the first sync the year's trades are history, not news.
    await raiseAlerts({ positions, cash, fresh: known.size ? fresh : [] });
    await checkContracts();
    return { asOf: asOf.toISOString().slice(0, 10), positions: positions.length, cash, newTrades: fresh.length };
  } catch (e) {
    await db.brokerState.upsert({ where: { id: 1 }, update: { error: e.message }, create: { id: 1, error: e.message } });
    throw e;
  }
}

// The stored statement with its JSON parsed, or null before the first successful sync.
export async function brokerState() {
  const s = await db.brokerState.findUnique({ where: { id: 1 } });
  if (!s) return null;
  return { ...s, positions: JSON.parse(s.positions), cash: JSON.parse(s.cash), rates: JSON.parse(s.rates) };
}

// The search matches the text anywhere in symbols and names, so a short symbol (GD, ITA) can sit pages deep: page
// until a listing with exactly this symbol passes `ok`, or the results run out.
async function search(symbol, type, ok) {
  for (let page = 1; page <= 15; page++) {
    const res = await fetch(SEARCH, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ pageNumber: page, pageSize: "100", sortField: "symbol", sortDirection: "asc", productCountry: [], productSymbol: symbol, newProduct: "all", productType: [type], domain: "com" }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`IBKR search HTTP ${res.status}`);
    const products = (await res.json()).products ?? [];
    const hit = products.find((p) => p.symbol === symbol && ok(p));
    if (hit || products.length < 100) return hit ?? null;
  }
  return null;
}

// The exact IBKR instrument for one candidate: the metal's spot contract, or the dollar listing whose ISIN is the
// right kind: Irish (IE) for the London UCITS funds, US (or Israeli, for Elbit) for the rest. The ISIN keeps out
// look-alikes under the same symbol, like a 3x leveraged IONQ note or SMH's European twin. null = not at IBKR.
async function findContract(symbol) {
  const metal = Object.keys(METALS).find((k) => METALS[k] === symbol);
  if (metal) return search(metal, "CMDTY", () => true);
  if (!CANDIDATES[symbol].buyable) return null;
  const isin = symbol.endsWith(".L") ? /^IE/ : /^(US|IL)/;
  const ok = (p) => p.currency === "USD" && isin.test(p.isin ?? "");
  const ib = symbol.replace(/\.L$/, "");
  return (await search(ib, "ETF", ok)) ?? (await search(ib, "STK", ok));
}

// Checks every candidate against IBKR once a week (and any new one right away). Only verified candidates are
// researched and bought.
export async function checkContracts(force = false) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const have = Object.fromEntries((await db.ibkrContract.findMany()).map((c) => [c.symbol, c]));
  for (const symbol of Object.keys(CANDIDATES)) {
    if (!force && have[symbol] && have[symbol].checkedAt > weekAgo) continue;
    let p;
    try {
      p = await findContract(symbol);
    } catch {
      continue; // try again next sync
    }
    const data = {
      conid: p?.conid ?? null, ibSymbol: p?.symbol ?? "", exchange: p?.exchangeId ?? "", currency: p?.currency ?? "",
      isin: p?.isin ?? "", name: p?.description ?? "", checkedAt: new Date(),
    };
    await db.ibkrContract.upsert({ where: { symbol }, update: data, create: { symbol, ...data } });
  }
}
