// Generates admin credentials + session secret for .env.local / Vercel env vars.
// Usage: npm run gen:admin -- [username] [password]
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);

const username = process.argv[2] || "admin";
const password =
  process.argv[3] || randomBytes(12).toString("base64url").replace(/[-_]/g, "").slice(0, 14);

const salt = randomBytes(16);
const hash = await scrypt(password.normalize("NFKC"), salt, 64);
const stored = `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;

console.log("\n=== Admin credentials (save these) ===");
console.log("Username :", username);
console.log("Password :", password);
console.log("\n=== Env vars ===");
console.log(`ADMIN_USERNAME=${username}`);
console.log(`ADMIN_PASSWORD_HASH=${stored}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString("hex")}`);
console.log("");
