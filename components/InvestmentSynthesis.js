import styles from "./InvestmentSynthesis.module.css";
import Logo, { ClaudeMark } from "./Logo";

const allocation = [
  ["etf", "קרנות סל", 55, "VWRA.L כליבה עולמית. VUAA.L נכללת במשקל הקיים ומוסיפה הטיה לארה״ב."],
  ["ai", "בינה מלאכותית ושבבים", 20, "TSM ו־MU לבדיקה. ב־NVDA בודקים ריכוזיות, וב־PLTR תמחור. חשיפה ישירה בלבד בשורה זו."],
  ["defense", "ביטחון ותעופה", 15, "RTX מועמדת מרכזית. לפזר בין חברות כשיש מועמדות מתאימות."],
  ["defenseAi", "בינה מלאכותית ביטחונית", 5, "PLTR מועמדת בזכות הפעילות הממשלתית והביטחונית. מסווגת כאן פעם אחת, אף שיש לה גם פעילות מסחרית."],
  ["other", "החזקות אחרות", 0, "למשל TSLA. יעד אפס לכסף חדש באפיק הזה אינו דרישה למכור החזקה קיימת."],
  ["cash", "מזומן בתיק", 5, "אפשר להמתין במזומן אם המחיר או הריכוזיות אינם מתאימים."],
];

const etfs = new Set("VOO CSPX.L VUAA.L VWRA.L VTI QQQM SMH XLK XLV XLF XLE XLI ITA XAR UFO NLR URA".split(" "));
const percent = (value) => new Intl.NumberFormat("he-IL", { style: "percent", maximumFractionDigits: 1 }).format(value);

export function InvestmentAllocation({ folio }) {
  const values = { etf: 0, ai: 0, defense: 0, defenseAi: 0, other: 0, cash: folio.cash };
  for (const row of folio.rows) {
    const group = etfs.has(row.symbol) ? "etf" : row.symbol === "PLTR" ? "defenseAi"
      : row.bucket === "ai" || row.bucket === "defense" ? row.bucket : "other";
    values[group] += row.value;
  }
  const available = folio.broker && folio.value > 0 && !folio.missingFx?.length;
  const date = folio.asOf?.toLocaleDateString("he-IL", { timeZone: "UTC" });
  return (
    <section className={`card ${styles.panel}`} aria-labelledby="portfolio-allocation">
      <h2 id="portfolio-allocation">חלוקת התיק · קיים מול יעד</h2>
      <p className="label">{available ? `קיים לפי דוח הברוקר מ־${date}, כולל מזומן. היעד מתייחס לתיק לטווח ארוך.`
        : "משקל קיים לא זמין כרגע. נדרש דוח ברוקר עם שערי מטבע לכל ההחזקות."}</p>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-labelledby="portfolio-allocation">
        <table className={styles.comparison} dir="rtl">
          <thead><tr><th scope="col">משקל קיים</th><th scope="col">אפיק</th><th scope="col">למה</th><th scope="col">יעד אחרי המחקר</th></tr></thead>
          <tbody>
            {allocation.map(([key, label, target, reason]) => (
              <tr key={key}>
                <td><b>{available ? percent(values[key] / folio.value) : "—"}</b></td>
                <th scope="row">{label}</th>
                <td>{reason}</td>
                <td><b>{percent(target / 100)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const comparisons = [
  {
    name: "VWRA.L", target: 55, action: "לקנות", claude: "לקנייה בביטחון נמוך.",
    research: "הקרן העולמית מכסה שווקים מפותחים ומתעוררים וכוללת ממילא מניות אמריקאיות.",
    decision: "עדיפות ראשונה בכסף חדש כל עוד סך קרנות הסל מתחת ל־55%.",
    url: "https://www.vanguard.co.uk/professional/product/etf/equity/9679/ftse-all-world-ucits-etf-usd-accumulating",
  },
  {
    name: "VUAA.L", target: 0, claude: "להמתנה.",
    research: "הקרן עוקבת אחרי S&P 500. החשיפה לארה״ב כבר קיימת בקרן העולמית.",
    decision: "להחזיק את הקיים ולנתב קניות חדשות לקרן העולמית כדי לצמצם בהדרגה את ההטיה לארה״ב.",
    url: "https://www.vanguard.co.uk/professional/product/etf/equity/9694/sp-500-ucits-etf-usd-accumulating",
  },
  {
    name: "RTX", target: 5, claude: "לקנייה, ציון 0.86.",
    research: "מכירות הרבעון עלו 11% והחברה העלתה תחזית. חלק מהשיפור ברווח המתואם הגיע מהחזר עלויות.",
    decision: "המועמדת המובילה לביטחון. לבדוק מחיר מול התחזית המעודכנת ואת משקל ההחזקה לפני הוספה.",
    url: "https://www.rtx.com/news/news-center/2026/10/20/rtx-reports-q3-2026-results",
  },
  {
    name: "TSM", target: 5, claude: "לקנייה, ציון 0.90.",
    research: "הכנסות הרבעון עלו 50.9% במטבע המקומי. ריכוז פעילות בטייוואן מוסיף סיכון, ועדכון מכירות אוקטובר צפוי ב־10.11.",
    decision: "המועמדת המובילה בשבבים. לבדוק מחדש אחרי עדכון המכירות ולכלול בחישוב גם את החשיפה דרך הקרן העולמית.",
    url: "https://investor.tsmc.com/english/financial-calendar",
    extraUrl: "https://investor.tsmc.com/english/quarterly-results/2026/q3",
  },
  {
    name: "MU", target: 5, action: "להמתין", claude: "לקנייה, ציון 0.85.",
    research: "Micron דיווחה על רבעון שיא וביקוש חזק לזיכרון. תוצאות שיא עלולות להטעות כשמשתמשים בהן כאומדן לרווח לאורך מחזור שלם.",
    decision: "חלופה ל־TSM למעקב, בכפוף לבדיקה של הרווח והתמחור בתרחיש שבו מחירי הזיכרון יורדים.",
    url: "https://investors.micron.com/news/press-release/2026/Micron-Technology-Inc--Reports-Record-Fiscal-Fourth-Quarter-and-Full-Year-2026-Results/",
  },
  {
    name: "PLTR", target: 5, claude: "לקנייה, ציון 0.84.",
    research: "ההכנסות צמחו 96% בשנה. כדי להחליט אם המחיר מוצדק צריך לבדוק כמה שנות צמיחה הוא כבר מגלם.",
    decision: "להמתין להערכת שווי ולבדיקת משקל החשיפה הישירה ל־AI.",
    url: "https://investors.palantir.com/files/Palantir%20-%20Q3%202026%20Business%20Update.pdf",
  },
  {
    name: "NVDA", target: 5, claude: "לקנייה במחקר, להמתנה בסיכום בגלל משקל ההחזקה.",
    research: "דוח הרבעון הבא נקבע ל־17.11. תוספת למניה מגדילה חשיפה שכבר קיימת בתיק ודרך המדד.",
    decision: "להמתין לדוח ולבדוק את הריכוזיות מחדש לפני הוספה.",
    url: "https://nvidianews.nvidia.com/news/nvidia-sets-conference-call-for-third-quarter-financial-results-6928873",
  },
  {
    name: "TSLA", target: 0, claude: "לקנייה, ציון 0.69.",
    research: "מסירות ואגירה מראות פעילות בשני תחומים, אבל לא מלמדות לבדן על רווחיות או על שווי הפעילויות העתידיות.",
    decision: "אפשר להמתין עם ההחזקה הקיימת. יעד הכסף החדש מתמקד בקרנות סל, ב־AI ובביטחון.",
    url: "https://ir.tesla.com/press-release/tesla-third-quarter-2026-production-deliveries-and-deployments",
  },
];

export default function InvestmentSynthesis({ folio }) {
  return (
    <section id="investment-synthesis" className={`card ${styles.panel}`}>
      <span className={styles.kicker}>מחקר משולב · 7.11.2026</span>
      <h2>חלוקה משולבת לכסף לטווח ארוך</h2>
      <a className="button secondary-link" href="/invest/research">למכור, לחכות או לשנות? לדף ההחלטות</a>
      <p>יעד לתיק לטווח ארוך: 55% קרנות סל, 20% AI ושבבים, 15% ביטחון ותעופה, 5% AI ביטחוני ו־5% מזומן.</p>
      <div className={styles.allocation}>
        {allocation.filter(([, , target]) => target > 0).map(([, label, pct, note]) => (
          <div key={label}>
            <strong>{percent(pct / 100)}</strong><b>{label}</b><span>{note}</span>
          </div>
        ))}
      </div>
      <p><b>הכסף לבית ב־2030.</b> את הסכום הנדרש להון העצמי כדאי לתכנן בנפרד, לפי הפער ליעד והיכולת לשאת ירידה לפני הרכישה. ה־5% מזומן הם חלק מהתיק לטווח ארוך. <a href="https://www.investor.gov/introduction-investing/getting-started/asset-allocation">מדריך לפיזור ואופק השקעה</a></p>
      <p><b>מה הסיכון הנוסף?</b> חשיפה ישירה ל־AI ולביטחון מתווספת לחשיפה דרך קרנות הסל. אם המניות הישירות יורדות ב־30% ויתר התיק נשאר יציב, התיק כולו יורד ב־12%.</p>
      <p className="label">זהו יעד מוצע לתיק לטווח ארוך, שאפשר להתקרב אליו בהדרגה דרך הפקדות חדשות. כלל אצבע בתרחיש: עד 5% בחשיפה ישירה למניה בודדת. תקציב שטרם נמצא לו מועמד מתאים יכול להישאר במזומן. מנגנון ההקצאה של האפליקציה מציג את יעדיו בנפרד.</p>
      <InvestmentComparison folio={folio} />
    </section>
  );
}

export function InvestmentComparison({ folio }) {
  const available = folio.broker && folio.value > 0 && !folio.missingFx?.length;
  const weights = new Map();
  for (const row of folio.rows) {
    weights.set(row.symbol, (weights.get(row.symbol) ?? 0) + row.value);
  }
  const etfWeight = folio.rows.filter((row) => etfs.has(row.symbol)).reduce((sum, row) => sum + row.value, 0);
  return (
      <section aria-labelledby="investment-comparison">
        <h3 id="investment-comparison">השוואת המניות והקרנות</h3>
        <p className="label">משקל קיים מתוך שווי החשבון כולל מזומן{available ? `, לפי דוח הברוקר מ־${folio.asOf.toLocaleDateString("he-IL", { timeZone: "UTC" })}` : " (הנתון כרגע לא זמין)"}. יעד 0% פירושו שאין הקצאה חדשה לנייר. 20% מהיעד מוצגים בטבלת האפיקים: 5% מזומן, 10% ביטחון ותעופה ו־5% AI שטרם שויכו לנייר מסוים.</p>
        <p className="label">מחקר Claude מ־3.11.2026 · בדיקת ChatGPT מ־7.11.2026.</p>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-labelledby="investment-comparison">
          <table className={styles.comparison} dir="rtl">
            <thead>
              <tr>
                <th scope="col">משקל קיים</th>
                <th scope="col">נייר ערך</th>
                <th scope="col">פעולה</th>
                <th scope="col">למה</th>
                <th scope="col">יעד המחקר</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((item) => (
                <tr key={item.name}>
                  <td><b>{available ? percent((weights.get(item.name) ?? 0) / folio.value) : "—"}</b></td>
                  <th scope="row"><bdi>{item.name}</bdi></th>
                  <td><b>{item.action === "לקנות" && (!available || etfWeight / folio.value >= .55)
                    ? (weights.has(item.name) ? "להשאיר" : "להמתין")
                    : item.action ?? (weights.has(item.name) ? "להשאיר" : "להמתין")}</b></td>
                  <td>
                    {item.decision}
                    <details>
                      <summary>Claude ו־ChatGPT · מחקר ומקורות</summary>
                      <p><span className={styles.brand} dir="ltr"><ClaudeMark size={18} /> Claude</span> · {item.claude}</p>
                      <p><span className={styles.brand} dir="ltr"><Logo id="chatgpt" label="ChatGPT" size={18} /> ChatGPT</span> · {item.research} <a href={item.url}>מקור</a>{item.extraUrl && <> · <a href={item.extraUrl}>דוח הרבעון</a></>}</p>
                    </details>
                  </td>
                  <td><b>{percent(item.target / 100)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
  );
}
