import StatusTag from "./StatusTag";
import styles from "./ThemeCompare.module.css";
import { GPT_TARGETS, mixTarget } from "@/lib/research-mix";

// The account by theme against the targets fixed in lib/portfolio.js (BUCKETS): one row per theme in its color with how
// much is there, the target and the gap; a click opens the holdings under it with their status (lib/research.js) and
// why. groups: the invest page's map groups ({key, name, color, value, pct, target, rows}); statuses: symbol -> status;
// why: symbol -> reason; money: formats an amount. A gap of more than 5 points is what the page acts on (nextSteps).
export default function ThemeCompare({ groups, statuses, why, money, total, summary }) {
  const gptOf = (g) => GPT_TARGETS.pct[g.key] ?? (g.key === "other" ? 0 : null);
  const rows = groups
    .map((g) => ({ ...g, claude: g.target ?? (g.key === "cash" ? 0 : null), gpt: gptOf(g) }))
    .map((g) => ({ ...g, target: mixTarget(g.claude, g.gpt) }))
    .filter((g) => g.value > 0 || g.target > 0);
  const pct = (x) => (x == null ? "—" : `${Math.round(x * 10) / 10}%`);
  const verdict = (g) => {
    if (g.target == null) return "בלי יעד";
    const gap = g.target - g.pct;
    if (Math.abs(gap) < 1) return "ביעד";
    if (gap > 0) return `חסר ${Math.round(gap)} נק׳ · ${money((gap / 100) * total)}`;
    return `עודף ${Math.round(-gap)} נק׳ · לא מוסיפים`;
  };
  return (
    <section className={`card ${styles.panel}`} aria-label="המצב שלי">
      <h2>המצב שלי</h2>
      {summary}
      <h3 id="theme-compare" className={styles.sub}>יש מול יעד, לפי תחום</h3>
      <p className="label">היעד המשוקלל הוא ממוצע של Claude ו-ChatGPT (חצי-חצי), והפער מחושב מולו. יעד ChatGPT מ-{new Date(GPT_TARGETS.asOf).toLocaleDateString("he-IL")}. לחיצה על תחום פותחת את המניות והקרנות שבו.</p>
      <div className={styles.head} aria-hidden="true"><span>תחום</span><span>יש עכשיו</span><span>Claude</span><span>ChatGPT</span><span>משוקלל</span><span>פער</span></div>
      {rows.map((g) => {
        const gap = g.target == null ? 0 : g.target - g.pct;
        return (
          <details key={g.key} className={styles.theme} style={{ "--theme": g.color }}>
            <summary className={styles.row}>
              <span className={styles.name}><span className={styles.dot} />{g.name}</span>
              <span><b>{g.pct.toFixed(1)}%</b> <span className="label">{money(g.value)}</span></span>
              <span className={styles.t} data-l="Claude">{pct(g.claude)}</span>
              <span className={styles.t} data-l="ChatGPT">{pct(g.gpt)}</span>
              <span className={styles.t} data-l="משוקלל"><b>{pct(g.target)}</b></span>
              <span className={Math.abs(gap) > 5 ? "neg" : "label"}>{verdict(g)}</span>
            </summary>
            <div className={styles.body}>
              {g.key === "cash" || !g.rows.length ? (
                <p className="label">{g.key === "cash" ? "הכסף שמחכה בחשבון. החלוקה שלו בבלוק ״כסף לא מושקע בחשבון״." : "אין כרגע החזקות בתחום הזה."}</p>
              ) : (
                <table className={styles.holdings}>
                  <tbody>
                    {g.rows.map((h) => (
                      <tr key={h.symbol}>
                        <th scope="row"><bdi>{h.symbol}</bdi></th>
                        <td><StatusTag st={statuses[h.symbol]} /></td>
                        <td><b>{h.pct.toFixed(1)}%</b> <span className="label">{money(h.value)}</span></td>
                        <td className={styles.why}>{why[h.symbol]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}
