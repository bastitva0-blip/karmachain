import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createHmac } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { decodeEventLog, getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";
import { z } from "zod";
import { karmaSbtAbi } from "@karma/shared";
import { env, sessionSecret } from "../env";
import { getDb, schema } from "../db/client";
import { publicClient, relayerAddress, sbtAddress } from "../chain/client";
import { invalidateReader } from "../chain/reader";
import { randomToken, safeEqual } from "../lib/crypto";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { healthChecks } from "../lib/health";
import { rateLimit } from "../lib/ratelimit";
import { body } from "../lib/validate";
import { findUserByHandleOrAddress } from "../profile";
import type { AppEnv } from "../types";

export const admin = new Hono<AppEnv>();

const COOKIE = "kc_admin";
const TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_ADMIN_ROLE = `0x${"0".repeat(64)}` as Hex;
const nonces = new Map<string, { address: string; message: string; exp: number }>();

const sign = (payload: string) => createHmac("sha256", `karma-admin:${sessionSecret}`).update(payload).digest("hex");

async function isOnchainAdmin(address: Address): Promise<boolean> {
  const sbt = sbtAddress();
  if (!sbt) return false;
  return publicClient.readContract({ address: sbt, abi: karmaSbtAbi, functionName: "hasRole", args: [DEFAULT_ADMIN_ROLE, address] }).catch(() => false);
}

/** Admin = holder of DEFAULT_ADMIN_ROLE on KarmaSBT, proven by an EIP-191 signature. */
function requireAdmin(c: Context<AppEnv>): Address {
  const raw = getCookie(c, COOKIE);
  if (!raw) throw unauthorized("Admin sign-in required");
  const [address, exp, mac] = raw.split(".");
  if (!address || !exp || !mac || !safeEqual(mac, sign(`${address}.${exp}`)) || Number(exp) < Date.now()) {
    throw unauthorized("Admin session expired");
  }
  return getAddress(address);
}

admin.post("/admin/nonce", rateLimit("admin-auth", 20, 10 * 60_000), async (c) => {
  const { address } = await body(c, z.object({ address: z.string().refine(isAddress, "Invalid address") }));
  const a = getAddress(address);
  const nonce = randomToken(12);
  const message = `KarmaChain admin sign-in for ${a}. Nonce ${nonce}. This does not send a transaction.`;
  nonces.set(nonce, { address: a, message, exp: Date.now() + 5 * 60_000 });
  return c.json({ nonce, message });
});

admin.post("/admin/session", rateLimit("admin-auth", 20, 10 * 60_000), async (c) => {
  const input = await body(c, z.object({ nonce: z.string(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }));
  const n = nonces.get(input.nonce);
  nonces.delete(input.nonce);
  if (!n || n.exp < Date.now()) throw badRequest("Nonce expired. Try again.");
  const ok = await verifyMessage({ address: n.address as Address, message: n.message, signature: input.signature as Hex }).catch(() => false);
  if (!ok) throw badRequest("Signature does not match");
  if (!(await isOnchainAdmin(n.address as Address))) throw forbidden("This wallet doesn't hold DEFAULT_ADMIN_ROLE on KarmaSBT");
  const exp = String(Date.now() + TTL_MS);
  setCookie(c, COOKIE, `${n.address}.${exp}.${sign(`${n.address}.${exp}`)}`, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
  return c.json({ address: n.address });
});

admin.post("/admin/logout", (c) => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

admin.get("/admin/overview", async (c) => {
  const me = requireAdmin(c);
  const db = await getDb();
  const flags = await db
    .select({ flag: schema.flags, user: schema.users, analysis: schema.analyses })
    .from(schema.flags)
    .leftJoin(schema.users, eq(schema.users.id, schema.flags.userId))
    .leftJoin(schema.analyses, eq(schema.analyses.id, schema.flags.analysisId))
    .orderBy(desc(schema.flags.createdAt))
    .limit(100);
  const [activeRow] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(schema.analyses)
    .where(and(sql`${schema.analyses.tokenId} is not null`, isNull(schema.analyses.revokedAt)));
  const [revokedRow] = await db.select({ revoked: sql<number>`count(*)::int` }).from(schema.analyses).where(sql`${schema.analyses.revokedAt} is not null`);
  const [mintsRow] = await db
    .select({ mintsToday: sql<number>`count(*)::int` })
    .from(schema.analyses)
    .where(and(sql`${schema.analyses.mintTx} is not null`, sql`${schema.analyses.createdAt} > now() - interval '1 day'`));
  const relayer = relayerAddress();
  const balance = relayer ? await publicClient.getBalance({ address: relayer }).catch(() => null) : null;
  const checks = await healthChecks();
  return c.json({
    admin: me,
    stats: { openFlags: flags.filter((f) => f.flag.status === "open").length, active: activeRow?.active ?? 0, revoked: revokedRow?.revoked ?? 0 },
    flags: flags.map(({ flag, user, analysis }) => {
      const ev = analysis?.evidenceJson as { language?: string } | undefined;
      return {
        id: flag.id,
        status: flag.status,
        signal: flag.signal,
        details: flag.details,
        source: flag.source,
        tokenId: flag.tokenId ?? analysis?.tokenId ?? null,
        skill: ev?.language ?? analysis?.skill ?? null,
        tier: analysis?.tier ?? null,
        score: analysis?.score ?? null,
        evidenceHash: analysis?.evidenceHash ?? null,
        mintedAt: analysis?.createdAt ?? null,
        owner: user ? { handle: user.githubHandle, wallet: user.walletAddress } : null,
        reason: flag.reason,
        revokeTx: flag.revokeTx,
        createdAt: flag.createdAt,
        resolvedAt: flag.resolvedAt,
      };
    }),
    relayer: {
      address: relayer,
      balanceWei: balance?.toString() ?? null,
      gasCapGwei: env.MAX_GAS_PRICE_GWEI,
      mintsToday: mintsRow?.mintsToday ?? 0,
      checks,
    },
  });
});

admin.post("/admin/flags/:id/dismiss", async (c) => {
  requireAdmin(c);
  const db = await getDb();
  const [f] = await db
    .update(schema.flags)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(eq(schema.flags.id, c.req.param("id")))
    .returning();
  if (!f) throw notFound();
  return c.json({ ok: true });
});

/**
 * The admin's own wallet sends `revoke(tokenId, reason)` (the server never holds the admin key).
 * Here we verify the receipt contains the Revoked event for that token, then record it.
 */
admin.post("/admin/flags/:id/revoked", async (c) => {
  requireAdmin(c);
  const { txHash } = await body(c, z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }));
  const db = await getDb();
  const [f] = await db.select().from(schema.flags).where(eq(schema.flags.id, c.req.param("id"))).limit(1);
  if (!f) throw notFound();
  const rc = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex, timeout: 60_000 });
  const sbt = sbtAddress();
  let revokedId: string | null = null;
  let reason = "";
  for (const l of rc.logs) {
    if (!sbt || l.address.toLowerCase() !== sbt.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: karmaSbtAbi, data: l.data, topics: l.topics });
      if (ev.eventName === "Revoked") {
        revokedId = String(ev.args.tokenId);
        reason = ev.args.reason;
      }
    } catch {
      // not ours
    }
  }
  if (!revokedId) throw badRequest("That transaction didn't revoke a KarmaChain token");
  await db
    .update(schema.flags)
    .set({ status: "revoked", revokeTx: txHash, reason, resolvedAt: new Date(), tokenId: revokedId })
    .where(eq(schema.flags.id, f.id));
  await db.update(schema.analyses).set({ revokedAt: new Date(), revokeReason: reason }).where(eq(schema.analyses.tokenId, revokedId));
  const [owner] = f.userId ? await db.select().from(schema.users).where(eq(schema.users.id, f.userId)).limit(1) : [];
  if (owner?.walletAddress) invalidateReader(owner.walletAddress);
  return c.json({ ok: true, tokenId: revokedId });
});

/** Anyone can report a profile; it becomes an open flag for admins. Rate limited. */
admin.post("/flags", rateLimit("flag-report", 5, 60 * 60_000), async (c) => {
  const input = await body(c, z.object({ handle: z.string().min(1).max(64), skill: z.string().max(48).optional(), reason: z.string().trim().min(5).max(300) }));
  const user = await findUserByHandleOrAddress(input.handle);
  if (!user) throw notFound("Profile not found");
  const db = await getDb();
  const analyses = await db
    .select()
    .from(schema.analyses)
    .where(and(eq(schema.analyses.userId, user.id), sql`${schema.analyses.tokenId} is not null`, isNull(schema.analyses.revokedAt)))
    .orderBy(desc(schema.analyses.score));
  const target = analyses.find((a) => !input.skill || a.skill === input.skill) ?? analyses[0];
  await db.insert(schema.flags).values({
    userId: user.id,
    analysisId: target?.id ?? null,
    tokenId: target?.tokenId ?? null,
    signal: `Reported: ${input.reason}`,
    source: "report",
  });
  return c.json({ ok: true }, 201);
});
