import { and, eq } from "drizzle-orm";
import { getAddress, type Hex } from "viem";
import { TIER_NUM } from "@karma/shared";
import { getDb, schema } from "../db/client";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { log } from "../lib/logger";
import { refreshProfile } from "../profile";
import type { User } from "../types";
import { txUrl } from "./client";
import { invalidateReader } from "./reader";
import { mintOrUpdate, onchainTokenFor } from "./sbt";

export interface MintOutcome {
  status: "minted" | "updated" | "unchanged" | "kept_higher";
  tokenId: string | null;
  txHash: string | null;
  txUrl: string | null;
  message: string;
}

/**
 * Idempotent mint for one analysis:
 * - already minted from this analysis → unchanged
 * - on-chain token with the same evidence hash → unchanged (record it)
 * - on-chain tier higher than this analysis → kept_higher (no downgrade from a re-run)
 * - otherwise mint or update
 */
export async function mintAnalysis(user: User, analysisId: string): Promise<MintOutcome> {
  if (!user.walletAddress) throw badRequest("Link a wallet before minting");
  const db = await getDb();
  const [a] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, analysisId)).limit(1);
  if (!a) throw notFound("Analysis not found");
  if (a.userId !== user.id) throw forbidden();
  if (!a.verified || (a.source !== "github" && a.source !== "portfolio")) {
    throw badRequest("Only verified GitHub or ownership-verified portfolio results can be minted. Self-declared results stay off-chain.");
  }
  if (a.tokenId && a.mintTx) {
    return { status: "unchanged", tokenId: a.tokenId, txHash: a.mintTx, txUrl: txUrl(a.mintTx), message: "Already minted" };
  }

  const owner = getAddress(user.walletAddress);
  const existing = await onchainTokenFor(owner, a.skill);
  if (existing && existing.evidenceHash.toLowerCase() === a.evidenceHash.toLowerCase()) {
    await db.update(schema.analyses).set({ tokenId: String(existing.tokenId) }).where(eq(schema.analyses.id, a.id));
    return { status: "unchanged", tokenId: String(existing.tokenId), txHash: null, txUrl: null, message: "Already on-chain" };
  }
  if (existing && existing.tier > TIER_NUM[a.tier]) {
    return {
      status: "kept_higher",
      tokenId: String(existing.tokenId),
      txHash: null,
      txUrl: null,
      message: "Your on-chain tier is already higher; keeping it.",
    };
  }

  const r = await mintOrUpdate(owner, a.skill, a.tier, a.score, a.evidenceHash as Hex);
  await db
    .update(schema.analyses)
    .set({ tokenId: r.tokenId, mintTx: r.txHash })
    .where(and(eq(schema.analyses.id, a.id), eq(schema.analyses.userId, user.id)));
  invalidateReader(owner);
  refreshProfile(user).catch((err: unknown) => log.warn("profile refresh failed", { err }));
  // System flag: a very new GitHub account minting Medium or above is worth a human look.
  const ageDays = user.githubCreatedAt ? (Date.now() - user.githubCreatedAt.getTime()) / 864e5 : null;
  if (ageDays !== null && ageDays < 14 && a.tier !== "basic") {
    await db
      .insert(schema.flags)
      .values({
        userId: user.id,
        analysisId: a.id,
        tokenId: r.tokenId,
        signal: "Account created " + Math.max(0, Math.floor(ageDays)) + " days before analysis",
        source: "system",
        details: ["GitHub account age " + ageDays.toFixed(1) + " days", "Minted " + a.skill + " at " + a.tier],
      })
      .catch(() => undefined);
  }
  return {
    status: r.action,
    tokenId: r.tokenId,
    txHash: r.txHash,
    txUrl: txUrl(r.txHash),
    message: r.action === "minted" ? "Minted your soulbound skill token" : "Updated your skill token",
  };
}
