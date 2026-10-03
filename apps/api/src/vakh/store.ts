import { eq, lt } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { decrypt, encrypt } from "../lib/crypto";

/**
 * Encrypted key/value rows for the Vakh integration.
 * Keys: `client:<redirect>` (OAuth client registration), `tokens:studio`, `tokens:rec:<recruiterKey>`,
 * `pkce:<state>` (short-lived), `form:proofs`, `form:pipeline:<recruiterKey>`.
 */
export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.vakhKv).where(eq(schema.vakhKv.key, key)).limit(1);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  return JSON.parse(decrypt(row.encValue)) as T;
}

export async function kvSet(key: string, value: unknown, ttlMs?: number): Promise<void> {
  const db = await getDb();
  const encValue = encrypt(JSON.stringify(value));
  const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;
  await db
    .insert(schema.vakhKv)
    .values({ key, encValue, expiresAt, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.vakhKv.key, set: { encValue, expiresAt, updatedAt: new Date() } });
}

export async function kvDelete(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.vakhKv).where(eq(schema.vakhKv.key, key));
}

/** Read-and-delete, for one-time PKCE state. */
export async function kvTake<T>(key: string): Promise<T | null> {
  const v = await kvGet<T>(key);
  await kvDelete(key);
  const db = await getDb();
  await db.delete(schema.vakhKv).where(lt(schema.vakhKv.expiresAt, new Date()));
  return v;
}
