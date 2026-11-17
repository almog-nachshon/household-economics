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
    decision: "להחזיק בלי להוסיף. בדוח 9.11 המשקל הישיר היה גבוה משמעותית מיעד 5%. אם רוצים להתקרב ליעד מהר, לשקול צמצום חלקי אחרי בדיקת מס ועלויות.",
    url: "https://www.rtx.com/news/news-center/2026/10/20/rtx-reports-q3-2026-results",
  },
  {
    name: "TSM", target: 5, claude: "לקנייה, ציון 0.90.",
    research: "לפי הודעת החברה מ־10.11, הכנסות אוקטובר עלו 59.7% משנה לשנה ו־14.7% מספטמבר.",
    decision: "להחזיק. הנתון מחזק את המועמדות להגדלה בהמשך, אחרי השלמת הפער בקרנות הסל ובדיקת תמחור וחשיפה מצטברת לשבבים.",
    url: "https://pr.tsmc.com/english/news/3349",
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
    decision: "להחזיק בלי להוסיף לפני הדוח ב־17.11. בדוח 9.11 המשקל הישיר כבר היה גבוה מהיעד, עוד לפני החלק דרך קרנות הסל.",
    url: "https://nvidianews.nvidia.com/news/nvidia-sets-conference-call-for-third-quarter-financial-results-6928873",
  },
  {
    name: "TSLA", target: 0, claude: "לקנייה, ציון 0.69.",
    research: "מסירות ואגירה מראות פעילות בשני תחומים, אבל לא מלמדות לבדן על רווחיות או על שווי הפעילויות העתידיות.",
    decision: "אפשר להמתין עם ההחזקה הקיימת. יעד הכסף החדש מתמקד בקרנות סל, ב־AI ובביטחון.",
    url: "https://ir.tesla.com/press-release/tesla-third-quarter-2026-production-deliveries-and-deployments",
  },
  {
    name: "AMD", action: "להמתין",
    research: "הכנסות הרבעון עלו 45% והכנסות מרכזי הנתונים עלו 97%. תחזית ההנהלה לרבעון הבא היא כ־17 מיליארד דולר.",
    decision: "מועמדת ל־AI. להמתין לבדיקת תמחור: קנייה תגדיל את החשיפה לאותם תקציבי מרכזי נתונים שמניעים גם את NVDA ו־TSM.",
    url: "https://ir.amd.com/news-events/press-releases/detail/1303/amd-reports-third-quarter-2026-financial-results",
  },
  {
    name: "ANET", action: "להמתין",
    research: "הכנסות הרבעון עלו 58.5% לכ־3.66 מיליארד דולר ועברו את תחזית החברה.",
    decision: "מועמדת לתשתיות רשת ל־AI. המוצר שונה משבבים, אבל עדיין תלוי בהשקעות מרכזי נתונים. לבדוק תמחור וריכוז לקוחות לפני קנייה.",
    url: "https://investors.arista.com/Communications/Press-Releases-and-Events/Press-Release-Detail/2026/Arista-Networks-Inc--Reports-Third-Quarter-2026-Financial-Results/default.aspx",
  },
  {
    name: "GD", action: "להמתין",
    research: "ההכנסות עלו 12.9%, הרווח המדולל למניה עלה 15.7%, וצבר ההזמנות הגיע ל־220 מיליארד דולר.",
    decision: "ראשונה לבדיקה לפיזור בתוך הביטחון, בזכות פעילות בספינות וברכב קרבי. כל עוד הביטחון והתעופה מעל היעד, תוספת תגדיל את החריגה.",
    url: "https://www.gd.com/news/press-release/general-dynamics-reports-third-quarter-2026-financial-results/",
  },
  {
    name: "HWM", action: "להמתין",
    research: "ההכנסות עלו 29%, מתוכן צמיחה אורגנית של 25%. החברה העלתה את תחזית 2026.",
    decision: "מועמדת לחשיפה לרכיבי תעופה. לבחון מול GD ואחרי בדיקת מחיר, כי התיק כבר חשוף לתעופה דרך RTX.",
    url: "https://www.howmet.com/financial-release/2026-10-29/howmet-aerospace-reports-third-quarter-2026-results/",
  },
  {
    name: "AVAV", action: "להמתין",
    research: "הכנסות הרבעון עלו 6% וצבר ההזמנות הממומן עלה 37%, לצד הפסד נקי חשבונאי של 5.1 מיליון דולר.",
    decision: "מועמדת חדשה למעקב בתחום המערכות האוטונומיות הביטחוניות. לבדוק מעבר לרווח ותזרים ביחס למחיר לפני קנייה.",
    url: "https://www.avinc.com/2026/09/09/aerovironment-announces-fiscal-2027-first-quarter-results/",
  },
];

const verdictLabels = { buy: "לקנות", wait: "להמתין", sell: "למכור" };

export default function InvestmentSynthesis({ folio }) {
  return (
    <section id="investment-synthesis" className={`card ${styles.panel}`}>
      <span className={styles.kicker}>מחקר משולב · 11.11.2026</span>
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

export function InvestmentComparison({ folio, claudeBySymbol = {} }) {
  const available = folio.broker && folio.value > 0 && !folio.missingFx?.length;
  const weights = new Map();
  for (const row of folio.rows) {
    weights.set(row.symbol, (weights.get(row.symbol) ?? 0) + row.value);
  }
  const etfWeight = folio.rows.filter((row) => etfs.has(row.symbol)).reduce((sum, row) => sum + row.value, 0);
  const groups = available ? [
    ["החזקות בתיק", comparisons.filter((item) => weights.has(item.name))],
    ["מועמדות למעקב", comparisons.filter((item) => !weights.has(item.name))],
  ] : [["ניירות שנבדקו", comparisons]];
  return (
      <section aria-labelledby="investment-comparison">
        <h3 id="investment-comparison">השוואת המניות והקרנות</h3>
        <p className="label">משקל בחשבון כולל מזומן{available ? ` · אינטראקטיב ${folio.asOf.toLocaleDateString("he-IL", { timeZone: "UTC" })}` : " · נתוני משקל אינם זמינים"} · סקירה 11.11.2026</p>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-labelledby="investment-comparison">
          <table className={`${styles.comparison} ${styles.decisions}`} dir="rtl">
            <thead>
              <tr>
                <th scope="col">משקל קיים</th>
                <th scope="col">נייר ערך</th>
                <th scope="col">פעולה</th>
                <th scope="col">למה</th>
                <th scope="col">יעד המחקר</th>
              </tr>
            </thead>
            {groups.filter(([, items]) => items.length).map(([label, items]) => (
            <tbody key={label}>
              <tr className={styles.group}><th scope="rowgroup" colSpan={5}>{label}</th></tr>
              {items.map((item) => {
                const claude = claudeBySymbol[item.name];
                const held = weights.has(item.name);
                const action = item.action === "לקנות" && (!available || etfWeight / folio.value >= .55)
                  ? (held ? "להשאיר" : "להמתין")
                  : item.action ?? (held ? "להשאיר" : "להמתין");
                return (
                <tr key={item.name}>
                  <td className={styles.current}><b>{available ? percent((weights.get(item.name) ?? 0) / folio.value) : "—"}</b></td>
                  <th scope="row"><bdi>{item.name}</bdi></th>
                  <td><span className={styles.action} data-action={action}>{action}</span></td>
                  <td className={styles.reason}>
                    {item.decision}
                    <details>
                      <summary>Claude ו־ChatGPT · מחקר ומקורות</summary>
                      <p><span className={styles.brand} dir="ltr"><ClaudeMark size={18} /> Claude</span> · {claude
                        ? `${verdictLabels[claude.verdict]} · ${claude.score.toFixed(2)} · ${claude.asOf.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`
                        : "אין רשומה עדכנית להצגה"}</p>
                      <p><span className={styles.brand} dir="ltr"><Logo id="chatgpt" label="ChatGPT" size={18} /> ChatGPT</span> · {item.research} <a href={item.url}>מקור</a>{item.extraUrl && <> · <a href={item.extraUrl}>דוח הרבעון</a></>}</p>
                    </details>
                  </td>
                  <td className={styles.target}><b>{item.target == null ? "—" : percent(item.target / 100)}</b></td>
                </tr>
                );
              })}
            </tbody>
            ))}
          </table>
        </div>
        <details className={styles.legend}>
          <summary>איך לקרוא את יעדי המחקר</summary>
          <p>0% מציין שאין הקצאה לקניות חדשות בנייר. מקף מציין מועמדת שטרם קיבלה יעד. בטבלת האפיקים מופיעים גם 5% מזומן, 10% ביטחון ותעופה ו־5% AI שטרם שויכו לניירות מסוימים.</p>
        </details>
      </section>
  );
}
