import { and, eq } from "drizzle-orm";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { getDb, schema } from "../db/client";
import { randomToken } from "../lib/crypto";
import { badRequest, conflict } from "../lib/errors";
import type { User } from "../types";

export const NONCE_TTL_MS = 5 * 60 * 1000;

export function linkMessage(handle: string, address: string, nonce: string, expiresAt: Date): string {
  return `KarmaChain: link GitHub @${handle} to ${address}. Nonce ${nonce}. Expires ${expiresAt.toISOString()}`;
}

export async function createNonce(user: User, rawAddress: string, now = new Date()) {
  if (!isAddress(rawAddress)) throw badRequest("Not a valid address");
  const address = getAddress(rawAddress);
  const nonce = randomToken(16);
  const expiresAt = new Date(now.getTime() + NONCE_TTL_MS);
  const message = linkMessage(user.githubHandle, address, nonce, expiresAt);
  const db = await getDb();
  await db.insert(schema.walletNonces).values({
    nonce,
    userId: user.id,
    address: address.toLowerCase(),
    message,
    expiresAt,
  });
  return { nonce, message, expiresAt: expiresAt.toISOString() };
}

/**
 * Verifies an EIP-191 signature over the stored message and binds the wallet.
 * The nonce is consumed before signature verification, so a failed attempt can't be retried
 * with the same nonce, and a successful signature can't be replayed.
 */
export async function linkWallet(
  user: User,
  input: { nonce: string; address: string; signature: string },
  now = new Date(),
) {
  if (!isAddress(input.address)) throw badRequest("Not a valid address");
  const address = getAddress(input.address);
  if (user.walletAddress && user.walletAddress !== address.toLowerCase()) {
    // SBTs are soulbound to the first wallet; switching would orphan them.
    throw conflict("Your account is already linked to a different wallet");
  }
  const db = await getDb();

  const [row] = await db
    .update(schema.walletNonces)
    .set({ used: true })
    .where(
      and(
        eq(schema.walletNonces.nonce, input.nonce),
        eq(schema.walletNonces.userId, user.id),
        eq(schema.walletNonces.used, false),
      ),
    )
    .returning();
  if (!row) throw badRequest("Nonce is unknown or already used. Request a new one.");
  if (row.expiresAt.getTime() <= now.getTime()) throw badRequest("Nonce expired. Request a new one.");
  if (row.address !== address.toLowerCase()) throw badRequest("Address does not match the nonce");

  const ok = await verifyMessage({
    address,
    message: row.message,
    signature: input.signature as Hex,
  }).catch(() => false);
  if (!ok) throw badRequest("Signature does not match this wallet");

  const [taken] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.walletAddress, address.toLowerCase()))
    .limit(1);
  if (taken && taken.id !== user.id) throw conflict("This wallet is already linked to another account");

  const [updated] = await db
    .update(schema.users)
    .set({ walletAddress: address.toLowerCase() })
    .where(eq(schema.users.id, user.id))
    .returning();
  return updated!;
}
