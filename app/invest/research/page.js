import { InvestmentAllocation, InvestmentComparison } from "@/components/InvestmentSynthesis";
import { portfolio } from "@/lib/holdings";

export const metadata = { title: "מחקר שוק והחלטות בתיק" };

export const dynamic = "force-dynamic";

export default async function InvestmentResearch() {
  const folio = await portfolio();
  return (
    <>
      <a href="/invest#investment-synthesis">חזרה לדף ההשקעות</a>
      <h1>למכור, לחכות או לשנות?</h1>
      <InvestmentAllocation folio={folio} />
      <p className="label">סקירה ל־7.11.2026 על בסיס ההחזקות בדוח הברוקר מ־6.11.2026. MU מופיעה בטבלה כמועמדת למעקב.</p>
      <div className="grid">
        <div className="card"><h2>למכור עכשיו</h2><p>לא זוהתה סיבה למכירה דחופה בסקירה הזו. שינוי יעד החלוקה לבדו לא מחייב מכירה.</p></div>
        <div className="card"><h2>אפשר לחכות</h2><p>ב־NVDA עד הדוח ב־17.11 וב־TSM עד עדכון המכירות ב־10.11. ב־PLTR כדאי לבדוק תמחור לפני הגדלה.</p></div>
        <div className="card"><h2>מה לשנות</h2><p>אם רוצים להפחית את ההטיה לארה״ב, אפשר לכוון את ההפקדות החדשות ל־VWRA לפני ששוקלים מכירה של VUAA.</p></div>
      </div>
      <p className="label">השוואת Claude מבוססת על הסבב השמור מ־3.11.2026. סבב חדש לא הושלם עקב מגבלת השימוש. הבדיקה העצמאית מול המקורות נערכה ב־7.11.2026.</p>
      <InvestmentComparison folio={folio} />
    </>
  );
}
