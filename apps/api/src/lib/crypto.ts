import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "../env";

const key = createHash("sha256").update(`karma-aes:${sessionSecret}`).digest();

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, ct] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !ct) throw new Error("Malformed ciphertext");
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

export const sha256Hex = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("hex");

/** Constant-time string compare (hash first so lengths match). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(sha256Hex(a)), Buffer.from(sha256Hex(b)));
}
