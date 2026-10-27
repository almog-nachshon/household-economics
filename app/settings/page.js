import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

const NUMBERS = [
  ["targetHomePrice", "מחיר דירת יעד"],
  ["equityRatio", "חלק ההון העצמי (למשל 0.3)", "0.01"],
  ["emergencyTarget", "יעד קרן חירום"],
  ["monthlyInvest", "הפקדה חודשית להשקעות"],
  ["checkingBuffer", "סכום שנשאר בעו״ש כל חודש"],
  ["monthlyIncome", "הכנסה חודשית נטו (0 = לפי העדכון החודשי האחרון)"],
  ["savingsGoal", "יעד חיסכון חודשי"],
];

async function save(formData) {
  "use server";
  const data = Object.fromEntries(NUMBERS.map(([k]) => [k, Number(formData.get(k))]));
  data.targetDate = new Date(formData.get("targetDate"));
  // One "TICKER, name, pct" per line.
  data.allocations = JSON.stringify(
    String(formData.get("allocations"))
      .split("\n")
      .map((l) => l.split(",").map((x) => x.trim()))
      .filter(([t, , pct]) => t && pct)
      .map(([ticker, name, pct]) => ({ ticker, name, pct: Number(pct) })),
  );
  await db.settings.update({ where: { id: 1 }, data });
  redirect("/");
}

export default async function Settings() {
  const s = await getSettings();
  const allocations = JSON.parse(s.allocations).map((a) => `${a.ticker}, ${a.name}, ${a.pct}`).join("\n");
  return (
    <>
      <h1>הגדרות</h1>
      <form action={save}>
        {NUMBERS.map(([k, label, step]) => (
          <label key={k}>{label} <input type="number" name={k} step={step || "1"} defaultValue={s[k]} required /></label>
        ))}
        <label>תאריך יעד <input type="date" name="targetDate" defaultValue={s.targetDate.toISOString().slice(0, 10)} required /></label>
        <label>
          חלוקת ETF (שורה לכל קרן: סימול, שם, אחוז). מתעדכן אוטומטית כשמסמנים ״קניתי״ בדף ההשקעות
          <textarea name="allocations" rows={7} defaultValue={allocations} placeholder="CSPX, S&P 500, 50" />
        </label>
        <button type="submit">שמירה</button>
      </form>
    </>
  );
}
