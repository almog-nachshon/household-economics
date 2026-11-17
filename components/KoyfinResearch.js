export default function KoyfinResearch({ symbol, type }) {
  const fund = type === "קרן סל";
  const metal = type === "מתכת";
  return (
    <details className="dt-more koyfin-research">
      <summary>Koyfin · מחקר משלים{symbol ? ` עבור ${symbol}` : " והשוואת נתונים"}</summary>
      <p><a href="https://app.koyfin.com/" target="_blank" rel="noreferrer">פתח את Koyfin ↗</a>{symbol ? <> וחפש <bdi>{symbol}</bdi>. ודא שהבורסה, המטבע והנייר תואמים להחזקה שלך.</> : " לבדיקת תמחור, תחזיות אנליסטים וחשיפות."}</p>
      <ul>
        {!fund && !metal && <li>למניות: השווה תחזיות הכנסות ורווח, שינויי תחזיות ומכפילים מול ההיסטוריה וחברות דומות. בדוק אם הנתון היסטורי או תחזית ולאיזו שנת כספים הוא מתייחס.</li>}
        {!metal && <li>לקרנות סל: בדוק הרכב, ריכוז החזקות וחפיפה עם יתר הקרנות והמניות בתיק, לפי תאריך ההרכב והכיסוי הזמינים.</li>}
        {metal && <li>למתכות: השווה מגמות מאקרו, ריבית והדולר. ודא אם מוצג מחיר ספוט או חוזה עתידי; אין להשוות ביניהם כאילו הם אותו נכס.</li>}
        <li>תעד את זמן הבדיקה, תאריך הנתון, מקורו והקישור למסך שבו נבדק; אמת נתונים מהותיים מול החברה או מנפיק הקרן.</li>
      </ul>
      <p className="label">בדיקה ידנית · ממצאים מ־Koyfin נכללים במחקר השמור רק כשמופיעים ברשימת המקורות עם תאריך ומסקנה. הקישור עצמו אינו נספר כמקור שנבדק ואינו משנה ציון או המלצה. אין משיכת נתונים אוטומטית מ־Koyfin; חלק מהכלים תלויים בחשבון ובמסלול שלך.</p>
      <p className="label"><a href="https://www.koyfin.com/help/actuals-consensus/" target="_blank" rel="noreferrer">מדריך לתוצאות ותחזיות</a> · <a href="https://www.koyfin.com/help/etf-holdings-constituents-and-contribution/" target="_blank" rel="noreferrer">מדריך להרכב קרנות</a></p>
    </details>
  );
}
