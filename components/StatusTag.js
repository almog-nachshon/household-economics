import { STATUS } from "@/lib/research";

const LABELS = { ...STATUS, dup: ["⛔", "כפילות"] };

// The one status of a symbol (lib/research.js statusOf, as decided on the invest page) as a colored pill: 🟢 לקנות,
// 🟡 עדיף לחכות, 🔴 למכור, or ⛔ כפילות for a fund that only repeats the core. ⏱ marks a "buy" held back by today's
// timing, * a status without deep research; the reasons show on hover.
export default function StatusTag({ st, big = false }) {
  if (!st) return <span className="label">—</span>;
  const [icon, label] = LABELS[st.key];
  const why = [...(st.timing ?? []), st.dup?.reason, st.research ? null : "בלי מחקר מעמיק: לפי הנתונים הטכניים והאנליסטים בלבד"].filter(Boolean).join(" · ");
  return (
    <span className={`st st-${st.key}${big ? " st-big" : ""}`} title={why || undefined}>
      {icon} {label}
      {st.dup && st.key === "sell" ? " · כפילות" : ""}
      {st.timing ? " ⏱" : ""}
      {!st.research && !st.dup ? "*" : ""}
    </span>
  );
}
