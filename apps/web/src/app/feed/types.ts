import type { Tier } from "@karma/shared";

// Mirrors apps/api/src/routes/feed.ts response shapes.

export type ProofType = "token" | "pr" | "review" | "interview";

export interface FeedProof {
  type: ProofType;
  ref: string;
  label: string;
  detail: string;
  url: string | null;
}

export interface FeedAuthor {
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  isDemo: boolean;
  tier: Tier | "none";
  tierLabel: string | null;
}

export interface FeedPost {
  id: string;
  rowId: string;
  repostedBy: FeedAuthor | null;
  author: FeedAuthor;
  text: string;
  proofs: FeedProof[];
  hiring: boolean;
  createdAt: string;
  endorsements: number;
  topTierEndorsements: number;
  viewerEndorsed: boolean;
  replies: number;
  reposts: number;
  score: number;
}

export interface FeedSidebar {
  you: { skills: { language: string; tier: Tier }[]; received: number; given: number } | null;
  trending: { language: string; tokens: number; top: number; prs: number }[];
  roles: { jobSpecId: string; title: string; need: string }[];
}

export type FeedSort = "proven" | "latest" | "hiring";
export type FeedScope = "all" | "following" | "endorsed";

/** Must match `endorseMessage` in apps/api/src/routes/feed.ts exactly, or the signature won't verify. */
export const endorseMessage = (postId: string, handle: string) => `KarmaChain: endorse post ${postId} as @${handle}`;

/** "now", "5m", "2h", "3d", then a short date. */
export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
