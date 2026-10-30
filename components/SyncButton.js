"use client";
import { useFormStatus } from "react-dom";
import Info from "@/components/Info";

// Submit button for the IBKR refresh: a spinner and a progress bar while the statements are pulled (10-30 seconds);
// otherwise the last update time, with the details behind an ⓘ.
export default function SyncButton({ updated, info }) {
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
      <span className="label">
        {pending ? "בודק החזקות, מזומן ועסקאות של היום. לוקח 10–30 שניות" : updated ? `עודכן: ${updated}` : "עוד לא עודכן"} {!pending && <Info text={info} />}
      </span>
    </span>
  );
}
