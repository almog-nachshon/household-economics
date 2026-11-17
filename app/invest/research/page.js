import { InvestmentAllocation, InvestmentComparison } from "@/components/InvestmentSynthesis";
import { portfolio } from "@/lib/holdings";
import { db } from "@/lib/db";
import styles from "@/components/InvestmentSynthesis.module.css";

export const metadata = { title: "מחקר שוק והחלטות בתיק" };

export const dynamic = "force-dynamic";

export default async function InvestmentResearch() {
  const [folio, claude] = await Promise.all([
    portfolio(),
    db.research.findMany({ select: { symbol: true, verdict: true, score: true, asOf: true } }),
  ]);
  return (
    <div className={styles.researchPage}>
      <header className={styles.researchHero}>
        <a className={styles.back} href="/invest">חזרה להשקעות ←</a>
        <p className={styles.kicker}>סקירת 11.11.2026</p>
        <h1>החלטות בתיק ההשקעות</h1>
        <div className={styles.overview}>
          <div><h2>לקנות בכסף חדש</h2><p><bdi>VWRA.L</bdi> כל עוד קרנות הסל מתחת ליעד של 55%.</p></div>
          <div><h2>להחזיק ולהמתין</h2><p><bdi>RTX</bdi> בגלל משקלה בתיק. <bdi>NVDA</bdi> עד לדוח ב־17.11.</p></div>
          <div><h2>מכירה</h2><p>בסקירה לא נמצאה החזקה שמצריכה מכירה מיידית.</p></div>
        </div>
      </header>
      <InvestmentComparison folio={folio} claudeBySymbol={Object.fromEntries(claude.map((row) => [row.symbol, row]))} />
      <InvestmentAllocation folio={folio} />
    </div>
  );
}
