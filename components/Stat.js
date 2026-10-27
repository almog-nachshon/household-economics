export default function Stat({ label, value, warn, hint }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`value ${warn ? "warn" : ""}`}>{value}</div>
      {hint && <div className="label">{hint}</div>}
    </div>
  );
}
