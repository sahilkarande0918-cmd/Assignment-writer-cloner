// Owner password hashing with Node's built-in scrypt. Format: scrypt:N:r:p:saltB64:hashB64 (no "$", which Next's env loader expands).
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 2 ** 15, R = 8, P = 1, LEN = 32;
const opts = (n: number, r: number, p: number) => ({ N: n, r, p, maxmem: 128 * n * r * 2 });

export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error("Use at least 12 characters.");
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, LEN, opts(N, R, P));
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join(":");
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split(":");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = await scrypt(password, Buffer.from(salt, "base64"), expected.length, opts(+n, +r, +p));
  return got.length === expected.length && timingSafeEqual(got, expected);
}
