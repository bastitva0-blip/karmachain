import { eq, or, sql } from "drizzle-orm";
import { isAddress } from "viem";
import { WEIGHTS, TIER_ORDER, type Tier } from "@karma/shared";
import { getDb, schema } from "../db/client";
import { latestAnalyses, type Analysis } from "../analysis/jobs";
import type { Evidence } from "../analysis/evidence";
import { getAttestations, getSkills, walletTxCount, type Attestation, type ChainSkill } from "../chain/reader";
import { sbtAddress, txUrl } from "../chain/client";
import { embedPassage } from "../recruiter/embeddings";
import type { User } from "../types";

export interface ProfileSkill {
  skill: string;
  language: string;
  tier: Tier;
  score: number;
  evidenceHash: string;
  evidenceUrl: string;
  verified: boolean;
  source: string;
  onchain: { tokenId: string; tier: Tier; score: number; hashMatches: boolean; txUrl: string | null; updatedAt: number } | null;
  components: Evidence["components"] | null;
  topRepos: Evidence["topRepos"];
  mergedExternalPrs: number;
}

export interface TrustSignals {
  externalMergedPrs: number;
  attestationCount: number;
  reviewCount: number;
  interviewCount: number;
  tierDistribution: Record<Tier, number>;
  accountAgeDays: number | null;
  onchainSkills: number;
  isDemo: boolean;
  chainAvailable: boolean;
}

const tierFromNum = (n: number): Tier => TIER_ORDER[Math.max(0, Math.min(2, n - 1))]!;

export async function findUserByHandleOrAddress(handleOrAddress: string): Promise<User | null> {
  const db = await getDb();
  const key = handleOrAddress.trim();
  const where = isAddress(key)
    ? eq(schema.users.walletAddress, key.toLowerCase())
    : or(sql`lower(${schema.users.githubHandle}) = ${key.toLowerCase()}`);
  const [u] = await db.select().from(schema.users).where(where).limit(1);
  return u ?? null;
}

function evidenceOf(a: Analysis): Evidence | null {
  const e = a.evidenceJson as Partial<Evidence>;
  return e && e.kind === "karmachain.evidence" ? (e as Evidence) : null;
}

export async function buildProfile(user: User) {
  const analyses = (await latestAnalyses(user.id)).filter((a) => a.source !== "zip"); // zip is owner-only
  const wallet = user.walletAddress;
  const [chainSkills, attestations] = wallet
    ? await Promise.all([getSkills(wallet), getAttestations(wallet)])
    : [null, [] as Attestation[]];
  const chainBySkill = new Map<string, ChainSkill>((chainSkills ?? []).map((s) => [s.skill, s]));

  const skills: ProfileSkill[] = analyses
    .filter((a) => a.verified || a.source === "portfolio")
    .map((a) => {
      const ev = evidenceOf(a);
      const c = chainBySkill.get(a.skill);
      return {
        skill: a.skill,
        language: ev?.language ?? a.skill,
        tier: a.tier,
        score: a.score,
        evidenceHash: a.evidenceHash,
        evidenceUrl: `/api/evidence/${a.evidenceHash}`,
        verified: a.verified,
        source: a.source,
        onchain: c
          ? {
              tokenId: c.tokenId,
              tier: tierFromNum(c.tier),
              score: c.score,
              hashMatches: c.evidenceHash === a.evidenceHash.toLowerCase(),
              txUrl: a.mintTx ? txUrl(a.mintTx) : null,
              updatedAt: c.updatedAt,
            }
          : null,
        components: ev?.components ?? null,
        topRepos: ev?.topRepos ?? [],
        mergedExternalPrs: ev?.mergedExternalPrs?.length ?? 0,
      };
    });

  // Skills that exist on-chain but not in our DB (e.g. minted from another environment).
  for (const c of chainSkills ?? []) {
    if (skills.some((s) => s.skill === c.skill)) continue;
    skills.push({
      skill: c.skill,
      language: c.skill,
      tier: tierFromNum(c.tier),
      score: c.score,
      evidenceHash: c.evidenceHash,
      evidenceUrl: `/api/evidence/${c.evidenceHash}`,
      verified: true,
      source: "chain",
      onchain: { tokenId: c.tokenId, tier: tierFromNum(c.tier), score: c.score, hashMatches: false, txUrl: null, updatedAt: c.updatedAt },
      components: null,
      topRepos: [],
      mergedExternalPrs: 0,
    });
  }
  skills.sort((a, b) => b.score - a.score);

  // Flag reviews from wallets with no on-chain history (cheap Sybil signal, shown in the UI).
  const atts: (Attestation & { freshAttester?: boolean })[] = await Promise.all(
    (attestations ?? []).map(async (a, i) =>
      a.schema === "ClientReview" && i < 10
        ? { ...a, freshAttester: (await walletTxCount(a.attester as `0x${string}`)) === 0 }
        : a,
    ),
  );
  const tierDistribution: Record<Tier, number> = { basic: 0, medium: 0, top: 0 };
  for (const s of skills) tierDistribution[s.tier]++;
  const prUrls = new Set<string>();
  for (const a of analyses) for (const p of evidenceOf(a)?.mergedExternalPrs ?? []) prUrls.add(p.url);

  const trustSignals: TrustSignals = {
    externalMergedPrs: prUrls.size,
    attestationCount: atts.filter((a) => !a.revoked).length,
    reviewCount: atts.filter((a) => a.schema === "ClientReview" && !a.revoked).length,
    interviewCount: atts.filter((a) => a.schema === "InterviewResult" && !a.revoked).length,
    tierDistribution,
    accountAgeDays: user.githubCreatedAt
      ? Math.floor((Date.now() - user.githubCreatedAt.getTime()) / 864e5)
      : null,
    onchainSkills: chainSkills?.length ?? 0,
    isDemo: user.isDemo,
    chainAvailable: !!sbtAddress() && chainSkills !== null,
  };

  return {
    user: {
      githubHandle: user.githubHandle,
      name: user.name,
      avatarUrl: user.avatarUrl,
      walletAddress: user.walletAddress,
      isDemo: user.isDemo,
      githubUrl: user.isDemo ? null : `https://github.com/${user.githubHandle}`,
    },
    skills,
    attestations: atts,
    trustSignals,
    attestationsAvailable: attestations !== null,
  };
}

export type Profile = Awaited<ReturnType<typeof buildProfile>>;

/** Plain-text summary used for embeddings, matching and voice briefings. Facts only. */
export function summaryText(handle: string, analyses: Analysis[]): string {
  const parts = analyses.map((a) => {
    const ev = evidenceOf(a);
    const repos = ev?.topRepos?.map((r) => r.fullName.split("/")[1]).join(", ");
    const prs = ev?.mergedExternalPrs?.length ?? 0;
    return `${ev?.language ?? a.skill}: ${a.tier} tier (${a.score}/100)${repos ? `, projects ${repos}` : ""}${
      prs ? `, ${prs} merged PRs to other projects` : ""
    }${ev?.substance?.strengths?.length ? `, strengths: ${ev.substance.strengths.join("; ")}` : ""}.`;
  });
  return `Developer @${handle}. ${parts.join(" ")}`.slice(0, 2000);
}

/** Recompute the searchable profile row (summary, skills, embedding). */
export async function refreshProfile(user: User) {
  const db = await getDb();
  const analyses = (await latestAnalyses(user.id)).filter((a) => a.verified);
  const summary = summaryText(user.githubHandle, analyses);
  const skillsJson = analyses.map((a) => ({
    skill: a.skill,
    language: evidenceOf(a)?.language ?? a.skill,
    tier: a.tier,
    score: a.score,
  }));
  const externalValidation = Math.max(
    0,
    ...analyses.map((a) => (evidenceOf(a)?.components?.external ?? 0) / WEIGHTS.external),
  );
  const embedding = await embedPassage(summary);
  await db
    .insert(schema.profiles)
    .values({ userId: user.id, summary, skillsJson, embedding, externalValidation, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.profiles.userId,
      set: { summary, skillsJson, embedding, externalValidation, updatedAt: new Date() },
    });
  return { summary, embedded: embedding !== null };
}
