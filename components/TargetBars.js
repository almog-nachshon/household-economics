// Each theme's share of the whole account against the share fixed for it (lib/portfolio.js BUCKETS): a bar for what is
// there now, a tick for the target, and the gap in points and money. All the bars share one scale, the largest share or
// target, so their lengths compare directly. groups: the page's map groups ({key, name, color, value, pct, target});
// total: the account's value; money: formats an amount. A gap over 5 points is red, as in lib/portfolio.js nextSteps.
export default function TargetBars({ groups, total, money }) {
  const rows = groups.filter((g) => g.value > 0 || g.target > 0);
  const max = Math.max(...rows.flatMap((g) => [g.pct, g.target ?? 0])) || 1;
  const gapText = (gap) => {
    if (Math.abs(gap) < 1) return "ביעד";
    return <>{gap > 0 ? "חסר" : "עודף"} {Math.round(Math.abs(gap))} נק׳<span className="tb-money"> · {money((Math.abs(gap) / 100) * total)}</span></>;
  };
  return (
    <div className="table-scroll">
      <table className="compact tbars">
        <thead><tr><th>תחום</th><th className="tb-bar"></th><th>יש</th><th>יעד</th><th>פער</th></tr></thead>
        <tbody>
          {rows.map((g) => {
            const gap = g.target == null ? null : g.target - g.pct;
            return (
              <tr key={g.key}>
                <td className="tb-name"><span className="swatch" style={{ background: g.color }} /> {g.name}</td>
                <td className="tb-bar">
                  <div className="tb-track" title={`${g.name}: ${g.pct.toFixed(1)}%${g.target == null ? "" : ` · יעד ${Math.round(g.target)}%`} · ${money(g.value)}`}>
                    <div className="tb-fill" style={{ width: `${(g.pct / max) * 100}%`, background: g.color }} />
                    {g.target != null && <div className="tb-tick" style={{ insetInlineStart: `${(g.target / max) * 100}%` }} />}
                  </div>
                </td>
                <td><b>{Math.round(g.pct)}%</b> <span className="label tb-money">{money(g.value)}</span></td>
                <td>{g.target == null ? "—" : `${Math.round(g.target)}%`}</td>
                <td className={gap != null && Math.abs(gap) > 5 ? "neg" : "label"}>{gap == null ? "—" : gapText(gap)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
