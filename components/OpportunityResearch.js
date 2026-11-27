import { ibkrQuoteUrl } from "@/lib/ibkr";
import styles from "./OpportunityResearch.module.css";

export const STRATEGY_LABELS = {
  momentum: "מומנטום ופריצות", acceleration: "האצה בהכנסות וברווחים", value: "חברות איכות בתמחור חסר",
  emerging: "הזדמנויות צמיחה מתפתחות", turnaround: "שיפור עסקי והיפוך מגמה",
};
const TECH = {
  close: "מחיר סגירה", dailyTrend: "מגמה יומית", weeklyTrend: "מגמה שבועית",
  sma20: "ממוצע נע 20 יום", sma50: "ממוצע נע 50 יום", sma200: "ממוצע נע 200 יום",
  relativeStrengthSp500Pct: "עודף תשואה מול S&P 500", rsi14: "RSI (14)", macd: "MACD",
  relativeVolume: "נפח יחסי", support: "אזורי תמיכה", resistance: "אזורי התנגדות",
  breakout: "פריצה", atr14: "ATR (14)", annualizedVolatilityPct: "תנודתיות שנתית",
  maxDrawdownPct: "ירידה מרבית מהשיא",
};
const FUND = {
  revenueGrowthPct: "צמיחת הכנסות", epsGrowthPct: "צמיחת רווח למניה",
  grossMarginPct: "שיעור רווח גולמי", operatingMarginPct: "שיעור רווח תפעולי",
  freeCashFlow: "תזרים מזומנים חופשי", totalDebt: "חוב כולל", financialStrength: "חוסן פיננסי",
  forwardPE: "מכפיל רווח חזוי", forwardEvEbitda: "מכפיל EV/EBITDA חזוי", forwardPriceToSales: "מכפיל מכירות חזוי",
  analystEarningsRevisions: "שינויים בתחזיות רווח של אנליסטים", guidanceChanges: "שינויים בתחזית החברה",
  competitiveAdvantage: "יתרון תחרותי", catalysts: "אירועים שעשויים להשפיע",
};
const DIMENSIONS = {
  trend: "מגמה", strength: "חוזק יחסי", confirmation: "אימות טכני",
  growth: "צמיחה", profitability: "רווחיות", balanceSheet: "מאזן", valuation: "תמחור", outlook: "תחזית עסקית",
};
const CONFIDENCE = { high: "גבוהה", medium: "בינונית", low: "נמוכה" };
const TRENDS = { rising: "עולה", sideways: "צידית", falling: "יורדת" };
const BREAKOUT = { confirmed: "מאומתת", pending: "ממתינה לאימות", failed: "נכשלה", none: "אין פריצה" };
const SCENARIOS = { bear: "שלילי", base: "בסיס", bull: "חיובי" };
const NUMBER = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 6 });
const DATE = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
const missing = "אין נתון";
const format = (value) => value == null ? missing : NUMBER.format(value);
const pct = (value) => value == null ? missing : `${NUMBER.format(Math.round(value * 10) / 10)}%`;
const money = (value, currency) => value == null ? missing : `${format(value)} ${currency}`;
export const researchDate = (value) => DATE.format(new Date(value));

function Observation({ item, sources, children }) {
  if (!item) return <span className="label">{missing}</span>;
  return <div className={styles.observation}>
    <div>{children}</div>
    {item.note && <div>{item.note}</div>}
    <div className="label">
      {researchDate(item.observedAt)} · {item.sourceIds.map((id) => (
        <a key={id} href={sources.get(id).url} target="_blank" rel="noreferrer">{sources.get(id).title}</a>
      ))}
    </div>
  </div>;
}

function Metrics({ fields, values, sources, render }) {
  return <dl className={styles.metrics}>
    {Object.entries(fields).map(([key, label]) => <div key={key}>
      <dt>{label}</dt>
      <dd><Observation item={values[key]} sources={sources}>{values[key] && render(key, values[key].value)}</Observation></dd>
    </div>)}
  </dl>;
}

function measure(key, value, candidate) {
  if (value == null) return missing;
  if (key.endsWith("Trend")) return TRENDS[value];
  if (key.endsWith("Pct")) return pct(value);
  if (["close", "sma20", "sma50", "sma200", "atr14"].includes(key)) return <bdi>{money(value, candidate.currency)}</bdi>;
  if (["freeCashFlow", "totalDebt"].includes(key)) return <bdi>{money(value, candidate.fundamentalCurrency)}</bdi>;
  if (key === "macd") return <span>קו {format(value.line)} · אות {format(value.signal)} · היסטוגרמה {format(value.histogram)}</span>;
  if (key === "support" || key === "resistance") return <bdi>{value.map(({ low, high }) => `${format(low)}–${format(high)}`).join(", ")} {candidate.currency}</bdi>;
  if (key === "breakout") return <><b>{BREAKOUT[value.status]}</b><div>אימות · {value.confirmation}</div><div>כישלון · {value.failure}</div></>;
  if (Array.isArray(value)) return value.join(" · ");
  return typeof value === "number" ? format(value) : value;
}

function Rationale({ title, items, sources }) {
  return <div><h3>{title}</h3>{items.length ? <ul>{items.map((item, index) => <li key={index}>
    <Observation item={item} sources={sources}>{item.value}</Observation>
  </li>)}</ul> : <p className="label">{missing}</p>}</div>;
}

function Assessment({ assessments, labels }) {
  const rated = Object.entries(assessments).filter(([, item]) => item);
  return rated.length > 0 && <ul>{rated.map(([key, item]) => <li key={key}>
    <b>{DIMENSIONS[key]} <bdi>{item.rating > 0 ? "+" : ""}{item.rating}</bdi></b> · {item.rationale}
    <div className="label">{item.evidence.map((field) => labels[field]).join(" · ")}</div>
  </li>)}</ul>;
}

export function Score({ value }) {
  return value == null ? <span className="label">{missing}</span> : <bdi className={styles.score}>{value}/100</bdi>;
}

export function PortfolioSuitability({ fit, portfolio, budget, report, sources }) {
  const reasons = {
    missing: "ציון ההתאמה דורש כיסוי מספק של ענפים ומטבעות בתיק, נתוני סיכון, מחיר ושער המרה, וחוזה מזוהה.",
    budget: "מחיר מניה שלמה גבוה מתקציב התרחיש.",
    ineligible: "החוזה סומן כבלתי זמין, או שמניה שלמה עולה יותר מההפקדה החודשית.",
  };
  return <div>
    <h3>התאמה לתיק <Score value={fit.score} /></h3>
    <p>תרחיש של עד {format(budget)} ₪ מתוך הפקדה חודשית של 4,000 ₪. אופק של 3–5 שנים, סיכון בינוני ומניות שלמות.</p>
    {portfolio.asOf && <p className="label">דוח אינטראקטיב מ-{researchDate(portfolio.asOf)} · התאמה מחושבת מול התיק הזמין כעת</p>}
    <dl className={styles.metrics}>
      <div><dt>עלות מניה לפי המחקר</dt><dd>{money(fit.unitIls, "₪")}</dd></div>
      <div><dt>מניות בתרחיש</dt><dd>{format(fit.units)}</dd></div>
      <div><dt>סכום השקעה בתרחיש</dt><dd>{money(fit.spend, "₪")}</dd></div>
      <div><dt>משקל ישיר במניה לאחר הקנייה</dt><dd>{pct(fit.positionPct)}</dd></div>
      <div><dt>חשיפה ענפית מזוהה לאחר הקנייה</dt><dd>{pct(fit.sectorPct)}</dd></div>
      <div><dt>חשיפה לפי מטבע מסחר לאחר הקנייה</dt><dd>{pct(fit.currencyPct)}</dd></div>
      <div><dt>כיסוי סיווג ענפי בתיק</dt><dd>{pct(fit.coverage == null ? null : fit.coverage * 100)}</dd></div>
      <div><dt>כיסוי מטבעות מסחר בתיק</dt><dd>{pct(portfolio.currencyCoverage == null ? null : portfolio.currencyCoverage * 100)}</dd></div>
      <div><dt>שער המרה ל-ILS</dt><dd>{report.candidate.currency === "ILS" ? "1" :
        <Observation item={report.ilsPerUnit} sources={sources}>{format(report.ilsPerUnit?.value)}</Observation>}</dd></div>
      <div><dt>חוזה באינטראקטיב</dt><dd><Observation item={report.broker} sources={sources}>
        {fit.brokerStatus === "listed" ? <a href={ibkrQuoteUrl(report.broker.value.conid)} target="_blank" rel="noreferrer">חוזה {report.broker.value.conid} · בדיקת הרשאות בחשבון</a> : "סומן כבלתי זמין"}
      </Observation></dd></div>
    </dl>
    <p className="label">החשיפות מבוססות על שווי ההחזקות וכוללות סיווגי ענף שסופקו במחקר. משקל מטבע המסחר משמש אומדן חשיפה מטבעית.</p>
    {fit.reason && <p className="label">{reasons[fit.reason]}</p>}
  </div>;
}

function ScenarioValue({ value, currency }) {
  return <><bdi>{money(value.fairValue, currency)}</bdi> · {value.horizonMonths} חודשים<div>{value.assumptions}</div></>;
}

export function OpportunityReport({ report, sources, fit, portfolio, budget }) {
  const { candidate, opportunity } = report;
  return <section className="card" id="report">
    <h2><bdi>{report.listing}</bdi> · {candidate.name}</h2>
    <p className="label">{[candidate.sector, candidate.industry, candidate.currency].filter(Boolean).join(" · ")} · ביטחון {CONFIDENCE[report.confidence]} · {report.confidenceNote}</p>
    <p>ציון הזדמנות <Score value={opportunity.score} /> · טכני <Score value={opportunity.technical.score} /> ({opportunity.technical.coverage}% כיסוי) · פונדמנטלי <Score value={opportunity.fundamental.score} /> ({opportunity.fundamental.coverage}% כיסוי)</p>
    <div className={styles.split}>
      <Rationale title="סיבות להשקיע" items={report.reasonsFor} sources={sources} />
      <Rationale title="סיבות להימנע" items={report.reasonsAgainst} sources={sources} />
      <Rationale title="תנאים המבטלים את התזה" items={report.invalidation} sources={sources} />
      <div><h3>אסטרטגיות מתאימות</h3>
        <Metrics fields={Object.fromEntries(Object.entries(STRATEGY_LABELS).filter(([key]) => report.strategies[key]))}
          values={report.strategies} sources={sources} render={(_, value) => value} />
      </div>
    </div>
    {report.limitations.length > 0 && <><h3>מגבלות נתונים</h3><ul>{report.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
    <h3>תרחישי שווי</h3>
    <Metrics fields={SCENARIOS} values={report.scenarios} sources={sources}
      render={(_, value) => <ScenarioValue value={value} currency={candidate.currency} />} />
    <details open>
      <summary>ניתוח טכני</summary>
      <Metrics fields={TECH} values={report.technical} sources={sources} render={(key, value) => measure(key, value, candidate)} />
      <Assessment assessments={report.technicalAssessment} labels={TECH} />
    </details>
    <details open>
      <summary>ניתוח פונדמנטלי</summary>
      <Metrics fields={FUND} values={report.fundamental} sources={sources} render={(key, value) => measure(key, value, candidate)} />
      <Assessment assessments={report.fundamentalAssessment} labels={FUND} />
    </details>
    <PortfolioSuitability fit={fit} portfolio={portfolio} budget={budget} report={report} sources={sources} />
  </section>;
}

export function OpportunityComparison({ rows, fits, sources }) {
  const metrics = [
    ["ציון הזדמנות", (row) => <Score value={row.opportunity.score} />],
    ["ציון התאמה לתיק", (row) => <Score value={fits.get(row.listing).score} />],
    ["ציון טכני / פונדמנטלי", (row) => `${format(row.opportunity.technical.score)} / ${format(row.opportunity.fundamental.score)}`],
    ["ביטחון בנתונים", (row) => CONFIDENCE[row.confidence]],
    ["אסטרטגיות", (row) => Object.keys(row.strategies).map((key) => STRATEGY_LABELS[key]).join(" · ")],
    ...["close", "weeklyTrend", "relativeStrengthSp500Pct", "annualizedVolatilityPct", "maxDrawdownPct"].map((key) =>
      [TECH[key], (row) => measure(key, row.technical[key]?.value, row.candidate)]),
    ...["revenueGrowthPct", "epsGrowthPct", "forwardPE", "forwardEvEbitda"].map((key) =>
      [FUND[key], (row) => measure(key, row.fundamental[key]?.value, row.candidate)]),
    ...Object.entries(SCENARIOS).map(([key, label]) => [`תרחיש ${label}`, (row) => <Observation item={row.scenarios[key]} sources={sources}>
      {row.scenarios[key] && <ScenarioValue value={row.scenarios[key].value} currency={row.candidate.currency} />}
    </Observation>]),
    ["משקל ענפי לאחר קנייה", (row) => pct(fits.get(row.listing).sectorPct)],
    ["משקל מטבע מסחר לאחר קנייה", (row) => pct(fits.get(row.listing).currencyPct)],
  ];
  return <div className={styles.scroll}>
    <table className="compact">
      <thead><tr><th scope="col">מדד</th>{rows.map((row) => <th scope="col" key={row.listing}><bdi>{row.listing}</bdi></th>)}</tr></thead>
      <tbody>{metrics.map(([label, cell]) => <tr key={label}><th scope="row">{label}</th>
        {rows.map((row) => <td key={row.listing}>{cell(row)}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
