"use client";
import { useFormStatus } from "react-dom";
import { ClaudeMark } from "@/components/Logo";
import Info from "@/components/Info";

// Submit button for a Claude run: the Claude mark spins and a "checking" note shows while the server action works.
export default function AiButton({ label, updated, info }) {
  const { pending } = useFormStatus();
  return (
    <span className="ai-button">
      <button type="submit" disabled={pending} className="claude-btn">
        <ClaudeMark spinning={pending} />
        {pending ? "Claude בודק ומחפש נתונים…" : label}
      </button>
      <span className="label">
        {pending ? "זה לוקח 1–3 דקות, אפשר להשאיר את הדף פתוח" : updated ? `עודכן: ${updated}` : "עוד לא נבדק"} {!pending && <Info text={info} />}
      </span>
    </span>
  );
}
