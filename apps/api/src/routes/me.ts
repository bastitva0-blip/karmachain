import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client";
import { requireUser } from "../auth/session";
import { createNonce, linkWallet } from "../auth/wallet";
import { destroySession } from "../auth/session";
import { rateLimit } from "../lib/ratelimit";
import { body } from "../lib/validate";
import type { AppEnv, User } from "../types";
import { syncUserProofs } from "../vakh/publish";

export const publicUser = (u: User) => ({
  id: u.id,
  githubHandle: u.githubHandle,
  name: u.name,
  avatarUrl: u.avatarUrl,
  walletAddress: u.walletAddress,
  consentSearchable: u.consentSearchable,
  isDemo: u.isDemo,
});

export const me = new Hono<AppEnv>();

me.get("/me", (c) => {
  const user = c.get("user");
  return c.json({ user: user ? publicUser(user) : null });
});

me.post("/me/consent", async (c) => {
  const user = requireUser(c);
  const { searchable } = await body(c, z.object({ searchable: z.boolean() }));
  const db = await getDb();
  const [u] = await db
    .update(schema.users)
    .set({ consentSearchable: searchable })
    .where(eq(schema.users.id, user.id))
    .returning();
  if (searchable !== user.consentSearchable) void syncUserProofs(user.id, searchable);
  return c.json({ user: publicUser(u!) });
});

/** Right to be forgotten: deletes the account and everything that cascades from it. */
me.delete("/me", async (c) => {
  const user = requireUser(c);
  const db = await getDb();
  // Archive public Vakh directory posts before the rows that point at them are deleted.
  await syncUserProofs(user.id, false);
  await destroySession(c);
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  return c.json({ ok: true, note: "Off-chain data deleted. On-chain tokens can be revoked by an admin on request." });
});

const wallet = new Hono<AppEnv>();
wallet.use("*", rateLimit("wallet", 20, 60_000));

wallet.post("/nonce", async (c) => {
  const user = requireUser(c);
  const { address } = await body(c, z.object({ address: z.string() }));
  return c.json(await createNonce(user, address));
});

wallet.post("/link", async (c) => {
  const user = requireUser(c);
  const input = await body(
    c,
    z.object({
      nonce: z.string().min(8).max(64),
      address: z.string(),
      signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
    }),
  );
  const u = await linkWallet(user, input);
  return c.json({ user: publicUser(u) });
});

me.route("/wallet", wallet);
