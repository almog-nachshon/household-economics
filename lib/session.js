// Signed session cookie, verified with Web Crypto so it also runs in middleware.
export const COOKIE = "home2030_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

// The phone app (android/) locks itself with the fingerprint each time it opens, so a login from it lasts 90 days.
export const APP_UA = "Bayit2030App";
const APP_MAX_AGE = 60 * 60 * 24 * 90;

export async function createSession(fromApp = false) {
  const MAX_AGE_ = fromApp ? APP_MAX_AGE : MAX_AGE;
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_;
  return { value: `${expires}.${await hmac(String(expires))}`, maxAge: MAX_AGE_ };
}

export async function verifySession(value) {
  if (!value || !process.env.SESSION_SECRET) return false;
  const [expires, sig] = value.split(".");
  if (!expires || !sig || Number(expires) < Date.now() / 1000) return false;
  return (await hmac(expires)) === sig;
}
