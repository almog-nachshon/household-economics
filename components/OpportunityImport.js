"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OpportunityImport({ limit }) {
  const [errors, setErrors] = useState([]);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function upload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("research");
    if (!file?.size || file.size > limit) {
      setErrors(["יש לבחור קובץ JSON בגודל של עד 5 MiB."]);
      return;
    }
    setErrors([]);
    setPending(true);
    try {
      const response = await fetch("/api/opportunities/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: file,
      });
      if (response.redirected) {
        router.push("/login");
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.errors ?? ["הייבוא נכשל."]);
        return;
      }
      form.reset();
      router.push(`/invest/opportunities?run=${result.id}&imported=${result.duplicate ? "duplicate" : "new"}`);
      router.refresh();
    } catch {
      setErrors(["הייבוא נכשל. בדקו את החיבור ונסו שוב."]);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={upload}>
      <label htmlFor="opportunity-file">קובץ מחקר מ-ChatGPT</label>
      <input id="opportunity-file" name="research" type="file" accept=".json,application/json" required disabled={pending} />
      <button className="button" disabled={pending}>{pending ? "מייבא…" : "ייבוא מחקר"}</button>
      {errors.length > 0 && <ul role="alert" className="warn" dir="ltr">{errors.map((message) => <li key={message}>{message}</li>)}</ul>}
    </form>
  );
}
