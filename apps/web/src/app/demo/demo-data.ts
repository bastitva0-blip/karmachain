import type { Tier } from "@karma/shared";
import type { Profile } from "@/lib/types";

export const DEMO_HANDLE = "priya-builds";
export const DEMO_NAME = "Priya Sharma";

export interface DemoSkill {
  language: string;
  score: number;
  tier: Tier;
}

/** Everything the walkthrough shows. Starts as the mockup copy; live profile data overrides what it can. */
export interface DemoData {
  live: boolean;
  handle: string;
  name: string;
  avatarUrl: string | null;
  wallet: string;
  skills: DemoSkill[];
  components: { complexity: number; hygiene: number; authorship: number; external: number; substance: number };
  externalPrs: number;
  sbts: number;
  reviews: number;
  ageYears: string;
  top: {
    language: string;
    tier: Tier;
    score: number;
    tokenId: string | null;
    txUrl: string | null;
    txLabel: string;
    evidenceHash: string | null;
    hashLabel: string;
    hashMatches: boolean;
  };
  review: { summary: string; uidLabel: string };
}

export const FALLBACK: DemoData = {
  live: false,
  handle: DEMO_HANDLE,
  name: DEMO_NAME,
  avatarUrl: null,
  wallet: "0x51ae…77b0",
  skills: [
    { language: "TypeScript", score: 82, tier: "top" },
    { language: "Python", score: 58, tier: "medium" },
    { language: "Go", score: 29, tier: "basic" },
  ],
  components: { complexity: 22, hygiene: 24, authorship: 17, external: 12, substance: 7 },
  externalPrs: 18,
  sbts: 3,
  reviews: 4,
  ageYears: "5.2y",
  top: {
    language: "TypeScript",
    tier: "top",
    score: 82,
    tokenId: "61",
    txUrl: null,
    txLabel: "0x41c2…9a0d",
    evidenceHash: null,
    hashLabel: "0x9e4b…02fa",
    hashMatches: true,
  },
  review: { summary: "Shipped our offline-first app in a month.", uidLabel: "0x19bd…" },
};

const short = (h: string, head = 6, tail = 4) => (h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);

/** Overlay whatever the live profile provides onto the static copy. Anything missing keeps the mockup value. */
export function fromProfile(p: Profile): DemoData {
  const skills = [...p.skills].sort((a, b) => b.score - a.score);
  const top = skills.find((s) => s.language === "TypeScript") ?? skills[0];
  if (!top) return FALLBACK;
  const t = p.trustSignals;
  const review = p.attestations.find((a) => a.schema === "ClientReview" && !a.revoked);
  const summary = review && typeof review.data.summary === "string" && review.data.summary ? review.data.summary : null;
  const txHash = top.onchain?.txUrl?.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? null;

  return {
    live: true,
    handle: p.user.githubHandle,
    name: p.user.name ?? DEMO_NAME,
    avatarUrl: p.user.avatarUrl,
    wallet: p.user.walletAddress ? short(p.user.walletAddress) : FALLBACK.wallet,
    skills: skills.slice(0, 3).map((s) => ({ language: s.language, score: s.score, tier: s.tier })),
    components: top.components ?? FALLBACK.components,
    externalPrs: t.externalMergedPrs,
    sbts: t.onchainSkills || p.skills.length,
    reviews: t.reviewCount,
    ageYears: t.accountAgeDays !== null ? `${(t.accountAgeDays / 365).toFixed(1)}y` : FALLBACK.ageYears,
    top: {
      language: top.language,
      tier: top.onchain?.tier ?? top.tier,
      score: top.onchain?.score ?? top.score,
      tokenId: top.onchain?.tokenId ?? null,
      txUrl: top.onchain?.txUrl ?? null,
      txLabel: txHash ? short(txHash) : top.onchain?.txUrl ? "view" : FALLBACK.top.txLabel,
      evidenceHash: top.evidenceHash || null,
      hashLabel: top.evidenceHash ? short(top.evidenceHash) : FALLBACK.top.hashLabel,
      // No on-chain token yet means there's nothing to compare against; the mockup shows the match case.
      hashMatches: top.onchain ? top.onchain.hashMatches : true,
    },
    review: summary && review ? { summary, uidLabel: `${review.uid.slice(0, 6)}…` } : FALLBACK.review,
  };
}
