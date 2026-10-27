import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, checkTotp, totpEnabled } from "@/lib/auth";
import { COOKIE, createSession } from "@/lib/session";

async function login(formData) {
  "use server";
  const ok = checkPassword(String(formData.get("password") || "")) & checkTotp(String(formData.get("code") || ""));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1500)); // slow down guessing
    redirect("/login?error=1");
  }
  const { value, maxAge } = await createSession();
  cookies().set(COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge, path: "/" });
  redirect("/");
}

async function logout() {
  "use server";
  cookies().delete(COOKIE);
  redirect("/login");
}

export default function Login({ searchParams }) {
  return (
    <>
      <h1>כניסה</h1>
      <form action={login}>
        <label>סיסמה <input type="password" name="password" autoComplete="current-password" required autoFocus /></label>
        {totpEnabled() && <label>קוד מאפליקציית האימות <input name="code" inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code" required /></label>}
        {searchParams?.error && <p className="warn">{totpEnabled() ? "הסיסמה או הקוד שגויים." : "הסיסמה שגויה."}</p>}
        <button type="submit">כניסה</button>
      </form>
      <form action={logout} style={{ marginTop: 24 }}>
        <button type="submit" className="secondary">יציאה</button>
      </form>
    </>
  );
}
