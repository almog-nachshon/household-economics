import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { portfolio } from "@/lib/holdings";
import { analyzeResearch, DEFAULT_ALLOCATION_ILS, MONTHLY_DEPOSIT_ILS, portfolioInputs, scorePortfolioFit } from "@/lib/opportunities.mjs";
import { IMPORT_LIMIT, STRATEGIES } from "@/lib/opportunity-schema.mjs";
import OpportunityImport from "@/components/OpportunityImport";
import { OpportunityComparison, OpportunityReport, Score, STRATEGY_LABELS, researchDate } from "@/components/OpportunityResearch";
import styles from "@/components/OpportunityResearch.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "גילוי הזדמנויות השקעה" };

const PATH = "/invest/opportunities";
const HISTORY_SIZE = 10;
const UNIVERSE_SIZE = 40;
const asString = (value) => typeof value === "string" ? value : "";
const asPage = (value) => /^\d{1,6}$/.test(value ?? "") ? Math.max(1, Number(value)) : 1;
const fmt = (value) => value.toLocaleString("he-IL");

function History({ rows, count, page, active, href }) {
  return <section className="card" id="history">
    <h2>היסטוריית מחקר</h2>
    {count ? <>
      <div className={styles.scroll}><table className="compact">
        <thead><tr><th>מחקר</th><th>נכון ליום</th><th>יובא</th><th>נסרקו</th><th>דוחות</th><th>גרסה</th></tr></thead>
        <tbody>{rows.map((run) => <tr key={run.id}>
          <th scope="row"><a href={href({ run: run.id, history: page, report: "", compare: [], q: "", page: 1 })} aria-current={active === run.id ? "page" : undefined}>{run.title}</a></th>
          <td>{researchDate(run.asOf)}</td><td>{researchDate(run.importedAt)}</td>
          <td>{fmt(run.screenedCount)}</td><td>{fmt(run.reportCount)}</td><td><bdi>{run.schemaVersion}</bdi></td>
        </tr>)}</tbody>
      </table></div>
      <Pagination page={page} count={count} size={HISTORY_SIZE} link={(history) => href({ history }, "#history")} />
    </> : <p className="label">מחקרים מיובאים יופיעו כאן.</p>}
  </section>;
}

function Pagination({ page, count, size, link }) {
  const pages = Math.ceil(count / size);
  if (pages < 2) return null;
  return <div className={styles.actions}>
    {page > 1 && <a href={link(page - 1)}>הקודם</a>}
    <span className="label">עמוד {fmt(page)} מתוך {fmt(pages)}</span>
    {page < pages && <a href={link(page + 1)}>הבא</a>}
  </div>;
}

function Rankings({ rows, fits, href, ranks }) {
  if (!rows.length) return <p className="label">אין דוחות מתאימים עם כיסוי מספיק לציון.</p>;
  return <div className={styles.scroll}><table className="compact">
    <thead><tr><th>דירוג</th><th>חברה</th><th>אסטרטגיות</th><th>ציון הזדמנות</th><th>ציון התאמה לתיק</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.listing}>
      <td>{ranks.get(row.listing)}</td>
      <th scope="row"><a href={href({ report: row.listing }, "#report")}><bdi>{row.listing}</bdi> · {row.candidate.name}</a></th>
      <td>{Object.keys(row.strategies).map((key) => STRATEGY_LABELS[key]).join(" · ") || "—"}</td>
      <td><Score value={row.opportunity.score} /><meter className={styles.meter} min={0} max={100} value={row.opportunity.score} aria-label="ציון הזדמנות" /></td>
      <td><Score value={fits.get(row.listing).score} /></td>
    </tr>)}</tbody>
  </table></div>;
}

export default async function Opportunities({ searchParams = {} }) {
  const requested = asString(searchParams.run);
  if (requested && !/^[a-f0-9]{64}$/.test(requested)) notFound();
  const byDate = [{ asOf: "desc" }, { importedAt: "desc" }, { id: "desc" }];
  const [active, count] = await Promise.all([
    requested ? db.opportunityResearch.findUnique({ where: { id: requested } }) : db.opportunityResearch.findFirst({ orderBy: byDate }),
    db.opportunityResearch.count(),
  ]);
  if (requested && !active) notFound();
  const history = Math.min(asPage(searchParams.history), Math.max(1, Math.ceil(count / HISTORY_SIZE)));
  const past = await db.opportunityResearch.findMany({ orderBy: byDate, skip: (history - 1) * HISTORY_SIZE, take: HISTORY_SIZE,
    select: { id: true, asOf: true, importedAt: true, title: true, screenedCount: true, reportCount: true, schemaVersion: true } });
  const research = active && JSON.parse(active.payload);
  const query = asString(searchParams.q).trim().slice(0, 100);
  const strategy = STRATEGIES.includes(searchParams.strategy) ? searchParams.strategy : "";
  const reportId = asString(searchParams.report);
  const requestedComparisons = [searchParams.compare].flat().filter((value) => typeof value === "string").slice(0, 3);
  const requestedBudget = Number(asString(searchParams.budget));
  const budget = Number.isInteger(requestedBudget) && requestedBudget > 0 && requestedBudget <= MONTHLY_DEPOSIT_ILS ? requestedBudget : DEFAULT_ALLOCATION_ILS;
  const page = asPage(searchParams.page);
  const state = { run: active?.id, q: query, strategy, history, report: reportId, compare: requestedComparisons, budget, page };
  function href(overrides = {}, hash = "") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...state, ...overrides })) {
      for (const entry of [value].flat()) if (entry) params.append(key, entry);
    }
    return `${PATH}?${params}${hash}`;
  }
  const historyPanel = <History rows={past} count={count} page={history} active={active?.id} href={href} />;
  const hero = <>
    <div className="page-head"><h1>גילוי הזדמנויות השקעה</h1><a href="/invest">חזרה להשקעות</a></div>
    <section className="card">
      <h2>ייבוא מחקר שוק</h2>
      <p>המחקר מתבצע ב-ChatGPT. העלו קובץ מחקר עם מקורות כדי לדרג חברות, להשוות ביניהן ולבדוק התאמה לתיק.</p>
      <OpportunityImport limit={IMPORT_LIMIT} />
      <div className={styles.actions}><a href="/api/opportunities/prompt">הוראות למחקר ב-ChatGPT</a><a href="/api/opportunities/schema">הורדת סכמת JSON 4.1</a><a href="/api/opportunities/context">ייצוא תיק למחקר</a><a href="#history">היסטוריית מחקר</a><a href="/invest/opportunities/legacy">ייבוא והיסטוריה בגרסה 1.0</a></div>
      {searchParams.imported === "new" && <p role="status" className="pos">המחקר נשמר.</p>}
      {searchParams.imported === "duplicate" && <p role="status">המחקר כבר קיים בהיסטוריה.</p>}
    </section>
  </>;
  if (!research) return <div className={styles.page}>{hero}{historyPanel}</div>;

  const { reports, ranked, top, shortlist } = analyzeResearch(research);
  const reportsByListing = new Map(reports.map((row) => [row.listing, row]));
  const ranks = new Map(ranked.map((row, i) => [row.listing, i + 1]));
  const sources = new Map(research.sources.map((row) => [row.id, row]));
  const selectedReport = reportsByListing.get(reportId);
  const comparison = [...new Set(requestedComparisons)].map((listing) => reportsByListing.get(listing)).filter(Boolean);
  const filtered = strategy ? ranked.filter((row) => row.strategies[strategy]).slice(0, 20) : top;
  const folio = reports.length ? await portfolio().catch((error) => {
    console.error("Opportunity portfolio unavailable", error.code ?? error.name);
    return null;
  }) : null;
  const profile = folio ? portfolioInputs(folio, research) : {
    valid: false, positions: [], sectors: {}, currencies: {}, total: 0, sectorCoverage: null, currencyCoverage: null, broker: false, asOf: null,
  };
  const fits = new Map(reports.map((row) => [row.listing, scorePortfolioFit(row, profile, budget)]));
  const normalizedQuery = query.toLowerCase();
  const candidates = research.universe.candidates.filter((row) => [row.listing, row.name, row.sector, row.industry]
    .some((value) => value?.toLowerCase().includes(normalizedQuery)));
  const universePage = Math.min(page, Math.max(1, Math.ceil(candidates.length / UNIVERSE_SIZE)));
  const snapshot = <input type="hidden" name="run" value={active.id} />;

  return <div className={styles.page}>
    {hero}
    <section className="card">
      <h2>{research.title}</h2>
      <p className="label">נתוני מחקר מ-{researchDate(research.asOf)} · גרסה {research.schemaVersion} · ChatGPT</p>
      <div className={styles.stats}>
        <div><b>{fmt(research.universe.screenedCount)}</b>ניירות שנסרקו</div>
        <div><b>{fmt(research.universe.candidates.length)}</b>מועמדים בקובץ</div>
        <div><b>{fmt(reports.length)}</b>דוחות עומק</div>
        <div><b>{fmt(ranked.length)}</b>דוחות עם ציון הזדמנות</div>
      </div>
      <p>{research.universe.markets.join(" · ")}</p>
      <p>{research.universe.methodology}</p>
      <p className="label">{research.universe.limitations}</p>
      <ul>{STRATEGIES.map((key) => <li key={key}>{STRATEGY_LABELS[key]} · {fmt(research.universe.strategyScreenedCounts[key])} ניירות נבדקו</li>)}</ul>
      <div className={styles.observation}>{research.universe.sourceIds.map((id) => <a key={id} href={sources.get(id).url} target="_blank" rel="noreferrer">{sources.get(id).title}</a>)}</div>
    </section>
    <section className="card">
      <h2>להמשך בחינה</h2>
      <p className="label">עד שש חברות עם בסיס פונדמנטלי, תרחישי שווי וחוזה שזוהה באינטראקטיב במועד המחקר.</p>
      {shortlist.length ? <Rankings rows={shortlist} fits={fits} href={href} ranks={ranks} /> : <p>אין מועמדים שעומדים בתנאים להמשך בחינה.</p>}
    </section>
    <section className="card" id="ranking">
      <h2>20 ההזדמנויות המובילות</h2>
      <p className="label">ציון הזדמנות משקלל נתונים טכניים ופונדמנטליים. ציון התאמה לתיק מחושב בנפרד. הציונים הם הערכות לפי כללי דירוג ואינם הסתברויות.</p>
      <form action={`${PATH}#ranking`} className={styles.actions}>{snapshot}
        <label>אסטרטגיה<select name="strategy" defaultValue={strategy}><option value="">כולן</option>
          {STRATEGIES.map((key) => <option key={key} value={key}>{STRATEGY_LABELS[key]}</option>)}
        </select></label>
        <label>תקציב תרחיש בש״ח<input type="number" name="budget" min={1} max={MONTHLY_DEPOSIT_ILS} defaultValue={budget} required /></label>
        <button className="button">עדכון תצוגה</button>
      </form>
      {!profile.broker && reports.length > 0 && <p className="label">התאמה מחושבת מול הרישום המקומי, כאשר נתוני התיק זמינים.</p>}
      <Rankings rows={filtered} fits={fits} href={href} ranks={ranks} />
    </section>
    {selectedReport && <OpportunityReport key={selectedReport.listing} report={selectedReport} sources={sources}
      fit={fits.get(selectedReport.listing)} portfolio={profile} budget={budget} />}
    {reports.length >= 2 && <section className="card" id="comparison">
      <h2>השוואת מניות</h2>
      <form className={styles.actions} action={`${PATH}#comparison`}>{snapshot}<input type="hidden" name="budget" value={budget} />
        {[0, 1, 2].map((index) => <label key={index}>חברה {index + 1}
          <select name="compare" defaultValue={requestedComparisons[index] ?? ""}>
            <option value="">בחירה</option>
            {reports.map((row) => <option value={row.listing} key={row.listing}>{row.listing} · {row.candidate.name}</option>)}
          </select>
        </label>)}
        <button className="button">השוואה</button>
      </form>
      {comparison.length >= 2 ? <OpportunityComparison rows={comparison} fits={fits} sources={sources} /> :
        <p className="label">בחרו שניים או שלושה דוחות להשוואה.</p>}
    </section>}
    <section className="card" id="universe">
      <h2>מועמדים מרחבי השוק</h2>
      <form className={styles.actions} action={`${PATH}#universe`}>{snapshot}<input type="hidden" name="budget" value={budget} />
        <label>חיפוש לפי סימול, שם או תחום<input name="q" type="search" maxLength={100} defaultValue={query} /></label>
        <button className="button">חיפוש</button>
      </form>
      <p className="label">{fmt(candidates.length)} מועמדים תואמים</p>
      {candidates.length > 0 && <div className={styles.scroll}><table className="compact">
        <thead><tr><th>סימול ובורסה</th><th>חברה</th><th>ענף / תעשייה</th><th>מטבע</th><th>מחקר</th></tr></thead>
        <tbody>{candidates.slice((universePage - 1) * UNIVERSE_SIZE, universePage * UNIVERSE_SIZE).map((row) => <tr key={row.listing}>
          <th scope="row"><bdi>{row.listing}</bdi></th><td>{row.name}</td>
          <td>{[row.sector, row.industry].filter(Boolean).join(" · ") || "—"}</td><td>{row.currency}</td>
          <td>{reportsByListing.has(row.listing) ? <a href={href({ report: row.listing }, "#report")}>דוח עומק</a> : "נמצא בסריקה"}</td>
        </tr>)}</tbody>
      </table></div>}
      <Pagination page={universePage} count={candidates.length} size={UNIVERSE_SIZE} link={(next) => href({ page: next }, "#universe")} />
    </section>
    <section className="card"><details><summary>כל מקורות המחקר ({fmt(research.sources.length)})</summary>
      <ul>{research.sources.map((source) => <li key={source.id}>{researchDate(source.accessedAt)} · <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
    </details></section>
    {historyPanel}
  </div>;
}
