"use client";
import { useFormStatus } from "react-dom";

// Submit button for the IBKR refresh: a spinner and a progress bar while the statements are pulled (10-30 seconds).
export default function SyncButton() {
  const { pending } = useFormStatus();
  return (
    <span className="ai-button">
      <button type="submit" disabled={pending} className={`secondary sync-btn${pending ? " busy" : ""}`}>
        {pending && <span className="spinner sync-spinner" />}
        {pending ? "מושך נתונים מאינטראקטיב…" : "🔄 רענון מאינטראקטיב"}
      </button>
      {pending && (
        <span className="sync-progress">
          <span />
        </span>
      )}
      <span className="label">{pending ? "בודק החזקות, מזומן ועסקאות של היום. לוקח 10–30 שניות" : ""}</span>
    </span>
  );
}
