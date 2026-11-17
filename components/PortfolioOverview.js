import styles from "./PortfolioOverview.module.css";

export default function PortfolioOverview({ folio, money, heavy }) {
  const complete = folio.broker && !folio.missingFx?.length;
  const positive = folio.rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
  const top = positive.slice(0, 3);
  const share = (value) => complete && folio.value > 0 ? `${(value / folio.value * 100).toFixed(1)}%` : "—";
  const asOf = folio.asOf?.toLocaleDateString("he-IL", { timeZone: "UTC" });
  const stale = folio.asOf && Date.now() - folio.asOf.getTime() > 4 * 86400000;
  return (
    <section className={styles.panel} aria-labelledby="portfolio-overview">
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}>תמונת מצב אישית</span><h2 id="portfolio-overview">מה חשוב בתיק שלך</h2></div>
        <span className={styles.source}>{folio.broker ? `דוח IBKR · ${asOf}` : "ממתין לדוח IBKR"}</span>
      </div>
      {(!complete || stale || folio.error) && <p className={styles.notice} role="status">{!folio.broker ? "אין עדיין דוח ברוקר שמור. הנתונים הידניים אינם אימות של החשבון באינטראקטיב." : !complete ? "חסרים שערי מטבע; שווי החשבון והמשקלים אינם מלאים." : folio.error ? "הסנכרון האחרון נכשל. מוצגים הנתונים מהדוח השמור." : "הדוח בן יותר מארבעה ימים. כדאי לסנכרן לפני קבלת החלטה."}</p>}
      <div className={styles.metrics}>
        <div><span>שווי משוער משולב</span><strong>{complete ? money(folio.value) : "—"}</strong><small>{folio.marketCount ?? 0} מתוך {folio.rows.length} החזקות במחיר שוק זמין; היתר במחיר הברוקר</small></div>
        <div><span>מזומן בחשבון</span><strong>{complete ? money(folio.cash) : "—"}</strong><small>{share(folio.cash)} מהחשבון · לפני בדיקת התחייבויות</small></div>
        <div><span>רווח / הפסד פתוח</span><strong>{complete ? money(folio.profit) : "—"}</strong><small>ללא רווח ממומש ודיבידנדים</small></div>
        <div><span>שלוש ההחזקות הגדולות</span><strong>{share(top.reduce((sum, row) => sum + row.value, 0))}</strong><small>משקל ישיר, ללא פירוק קרנות</small></div>
      </div>
      {complete && <p className="label">שווי לפי מחירי הברוקר: <bdi>{money(folio.brokerValue ?? folio.value)}</bdi> · הפרש שערוך: <bdi>{money(folio.value - (folio.brokerValue ?? folio.value))}</bdi>. כמויות, עלות ומזומן: IBKR. מחירי שוק: Yahoo Finance, מסחר רגיל בלבד, עשויים להיות מושהים. המרת מטבע לפי שערי דוח הברוקר כשזמינים; אין כאן רווח מט״ח היסטורי.</p>}
      <div className={styles.focus}>
        <div><h3>מוקד הבדיקה</h3><p>{!complete ? "סנכרון ואימות נתוני החשבון קודמים לניתוח ההקצאה." : heavy.length ? `${heavy.map((row) => row.symbol).join(" · ")} חוצות את סף הריכוזיות שהוגדר במערכת. החשיפה כוללת אומדן דרך קרנות; יש לבדוק את עדכניות ההרכבים.` : "בדוק את חלוקת ההשקעות מול מטרת הכסף והסיכון המתאים לך. היעדים במערכת הם הנחות עבודה שדורשות אישור שלך."}</p><a href="#picture">לבדיקת החשיפות ←</a></div>
        <div><h3>מתי צריך את הכסף?</h3><p>כסף שמיועד לבית ב־2030 צריך להיבחן בנפרד מהשקעה לטווח ארוך. עדיין חסר שיוך ברור של הסכום הדרוש לבית מתוך החשבון הזה.</p><a href="/">ליעד הבית ←</a></div>
      </div>
      <details className={styles.method}><summary>איך לקרוא את המספרים</summary><p>השווי המשולב הוא כמות מהברוקר כפול מחיר השוק האחרון שעבר בדיקת סימול, מטבע, חוזה וזמן. כשאין מחיר מתאים נשאר שווי הברוקר. זהו אומדן ולא שווי מימוש: אין הכללה של מרווח קנייה ומכירה או מסחר מוקדם ומאוחר. הרווח הפתוח אינו תשואת החשבון לאורך זמן; למדידת ביצועים נדרשים גם תזרימים, דיבידנדים ועמלות. חפיפה בין קרנות אינה לבדה סיבה למכירה.</p><a href="https://www.investor.gov/introduction-investing/getting-started/asset-allocation" target="_blank" rel="noreferrer">מקור: התאמת הקצאה למטרה ולאופק ההשקעה · Investor.gov</a></details>
    </section>
  );
}
