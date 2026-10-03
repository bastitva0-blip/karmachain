import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getAddress, parseAbiItem, type Address, type Hex } from "viem";
import { z } from "zod";
import { deployments, karmaSbtAbi, TIER_ORDER } from "@karma/shared";
import { getDb, schema } from "../db/client";
import { publicClient, sbtAddress } from "../chain/client";
import { notFound } from "../lib/errors";
import { rateLimit } from "../lib/ratelimit";
import { body } from "../lib/validate";
import type { AppEnv } from "../types";

export const verify = new Hono<AppEnv>();

const revokedEvent = parseAbiItem("event Revoked(address indexed owner, uint256 indexed tokenId, string reason)");

async function tokenState(tokenId: bigint) {
  const sbt = sbtAddress();
  if (!sbt) return null;
  const owner = await publicClient.readContract({ address: sbt, abi: karmaSbtAbi, functionName: "ownerOf", args: [tokenId] }).catch(() => null);
  if (owner) {
    const s = await publicClient.readContract({ address: sbt, abi: karmaSbtAbi, functionName: "skills", args: [tokenId] });
    const name = await publicClient.readContract({ address: sbt, abi: karmaSbtAbi, functionName: "skillName", args: [s[0]] });
    return {
      tokenId: tokenId.toString(),
      owner,
      skill: name,
      tier: TIER_ORDER[Math.max(0, Number(s[1]) - 1)]!,
      score: Number(s[2]),
      evidenceHash: (s[3] as string).toLowerCase(),
      locked: true,
      revoked: false as const,
      revokedReason: null,
      revokedAt: null,
    };
  }
  // Burned (or never minted): look for a Revoked event for this token.
  const logs = await publicClient
    .getLogs({ address: sbt, event: revokedEvent, args: { tokenId }, fromBlock: BigInt(deployments.sbtDeployBlock || 0), toBlock: "latest" })
    .catch(() => []);
  const last = logs[logs.length - 1];
  if (!last) return null;
  const block = await publicClient.getBlock({ blockNumber: last.blockNumber }).catch(() => null);
  return {
    tokenId: tokenId.toString(),
    owner: last.args.owner ?? null,
    skill: null,
    tier: null,
    score: null,
    evidenceHash: null,
    locked: false,
    revoked: true as const,
    revokedReason: last.args.reason ?? "",
    revokedAt: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
  };
}

/** GET /verify/:query — query is an evidence hash (0x + 64 hex) or a token id (digits, optional #). */
verify.get("/verify/:query", rateLimit("verify", 60, 60_000), async (c) => {
  const raw = c.req.param("query").trim().replace(/^#/, "").toLowerCase();
  const db = await getDb();
  let hash: string | null = null;
  let tokenId: bigint | null = null;
  if (/^0x[0-9a-f]{64}$/.test(raw)) hash = raw;
  else if (/^\d{1,12}$/.test(raw)) tokenId = BigInt(raw);
  else throw notFound("Enter an evidence hash (0x…) or a token ID");

  let row = hash
    ? (await db.select().from(schema.analyses).where(eq(schema.analyses.evidenceHash, hash)).limit(1))[0]
    : (await db.select().from(schema.analyses).where(eq(schema.analyses.tokenId, tokenId!.toString())).limit(1))[0];
  if (!hash && row) hash = row.evidenceHash;
  if (!tokenId && row?.tokenId) tokenId = BigInt(row.tokenId);
  const token = tokenId !== null ? await tokenState(tokenId) : null;
  if (!row && token?.evidenceHash) {
    row = (await db.select().from(schema.analyses).where(eq(schema.analyses.evidenceHash, token.evidenceHash)).limit(1))[0];
    hash = token.evidenceHash;
  }
  if (!row && !token) throw notFound("No evidence for that hash or token");
  const owner = row ? (await db.select().from(schema.users).where(eq(schema.users.id, row.userId)).limit(1))[0] : null;
  const evidence = row?.evidenceJson ?? null;
  return c.json({
    hash,
    evidence,
    bytes: evidence ? JSON.stringify(evidence).length : 0,
    analysis: row
      ? { skill: row.skill, tier: row.tier, score: row.score, verified: row.verified, source: row.source, createdAt: row.createdAt, mintTx: row.mintTx, revokedAt: row.revokedAt, revokeReason: row.revokeReason }
      : null,
    owner: owner ? { handle: owner.githubHandle, isDemo: owner.isDemo } : null,
    token,
    sbt: sbtAddress(),
  });
});

/**
 * "Prove it's soulbound": simulate transferFrom(owner → 0xdead) from the owner's address.
 * Read-only (eth_call), so nothing is sent. Returns the revert reason.
 */
verify.post("/verify/transfer-check", rateLimit("transfer-check", 20, 60_000), async (c) => {
  const { tokenId } = await body(c, z.object({ tokenId: z.string().regex(/^\d{1,12}$/) }));
  const sbt = sbtAddress();
  if (!sbt) throw notFound("Contract not deployed");
  const id = BigInt(tokenId);
  const owner = (await publicClient.readContract({ address: sbt, abi: karmaSbtAbi, functionName: "ownerOf", args: [id] }).catch(() => null)) as Address | null;
  if (!owner) throw notFound("Token not found");
  const dead = getAddress("0x000000000000000000000000000000000000dEaD");
  try {
    await publicClient.simulateContract({ account: owner, address: sbt, abi: karmaSbtAbi, functionName: "transferFrom", args: [owner, dead, id] });
    return c.json({ reverted: false, call: `transferFrom(${owner}, ${dead}, ${tokenId})` });
  } catch (err) {
    const name = (err as { cause?: { data?: { errorName?: string } } })?.cause?.data?.errorName ?? "Soulbound";
    const locked = await publicClient.readContract({ address: sbt, abi: karmaSbtAbi, functionName: "locked", args: [id] }).catch(() => true);
    return c.json({ reverted: true, error: name, locked, owner, call: `transferFrom(${owner}, ${dead}, ${tokenId})` as string, data: "0xa4420a95" as Hex });
  }
});
