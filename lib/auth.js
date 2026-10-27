import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

// AUTH_PASSWORD_HASH format: scrypt:<salt hex>:<hash hex> (no "$", which Next.js expands in .env)
export function checkPassword(password) {
  const [, salt, hash] = (process.env.AUTH_PASSWORD_HASH || "").split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

function base32Decode(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}

function totp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// 2FA is on only when TOTP_SECRET is set; without it the password alone signs in.
export const totpEnabled = () => Boolean(process.env.TOTP_SECRET);

// RFC 6238 code, accepting one 30s step of clock drift either way.
export function checkTotp(code) {
  const secret = process.env.TOTP_SECRET;
  if (!secret) return true;
  if (!/^\d{6}$/.test(code)) return false;
  const step = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((d) => totp(secret, step + d) === code);
}
