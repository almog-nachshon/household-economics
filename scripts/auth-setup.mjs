// Prints the auth env vars for .env. Usage: npm run auth:setup -- "my password"
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: npm run auth:setup -- "a password of 12+ characters"');
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const totp = Array.from(randomBytes(20), (b) => alphabet[b % 32]).join("");

console.log(`AUTH_PASSWORD_HASH="scrypt:${salt.toString("hex")}:${hash.toString("hex")}"`);
console.log(`TOTP_SECRET="${totp}"`);
console.log(`SESSION_SECRET="${randomBytes(32).toString("hex")}"`);
console.log(`\nAdd TOTP_SECRET to Google Authenticator / Authy ("enter a setup key"), or open:`);
console.log(`otpauth://totp/home2030?secret=${totp}&issuer=home2030`);
