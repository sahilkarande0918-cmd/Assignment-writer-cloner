// Sets the owner password: writes its scrypt hash to .env.local (OWNER_PASSWORD_HASH) and the plaintext to
// .owner-password (git-ignored) so it is never printed. Usage: node scripts/set-owner-password.mjs [password]
// Without an argument a random 20-character password is generated.
import { randomBytes, scrypt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const password = process.argv[2] ?? randomBytes(15).toString("base64url");
if (password.length < 12) throw new Error("Use at least 12 characters.");
const N = 2 ** 15, r = 8, p = 1;
const salt = randomBytes(16);
const hash = await new Promise((res, rej) => scrypt(password, salt, 32, { N, r, p, maxmem: 128 * N * r * 2 }, (e, k) => (e ? rej(e) : res(k))));
const value = ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join(":");

let env = readFileSync(".env.local", "utf8");
env = /^OWNER_PASSWORD_HASH=.*$/m.test(env) ? env.replace(/^OWNER_PASSWORD_HASH=.*$/m, () => `OWNER_PASSWORD_HASH=${value}`) : `${env.trimEnd()}\nOWNER_PASSWORD_HASH=${value}\n`;
writeFileSync(".env.local", env);
writeFileSync(".owner-password", password + "\n");
console.log("Owner password set. Hash written to .env.local; password saved in .owner-password (git-ignored).");
