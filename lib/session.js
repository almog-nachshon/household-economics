// Signed session cookie, verified with Web Crypto so it also runs in middleware.
export const COOKIE = "home2030_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function createSession() {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  return { value: `${expires}.${await hmac(String(expires))}`, maxAge: MAX_AGE };
}

export async function verifySession(value) {
  if (!value || !process.env.SESSION_SECRET) return false;
  const [expires, sig] = value.split(".");
  if (!expires || !sig || Number(expires) < Date.now() / 1000) return false;
  return (await hmac(expires)) === sig;
}
