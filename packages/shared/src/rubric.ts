import type { Tier } from "./types";

/**
 * Single source of truth for scoring. Deterministic signals carry 90 points,
 * the LLM substance rubric at most 10, so prompt injection in code can move
 * a score by 10 points at most.
 */
export const RUBRIC_VERSION = "karma-rubric-v1";

export const WEIGHTS = {
  complexity: 25,
  hygiene: 25,
  authorship: 20,
  external: 20,
  substance: 10,
} as const;

export type Component = keyof typeof WEIGHTS;

/** Inclusive lower bounds. Basic 0-39, Medium 40-69, Top 70-100. */
export const TIER_CUTOFFS = { medium: 40, top: 70 } as const;

/** Weights for the top 3 repos of a language (best first). */
export const TOP_REPO_WEIGHTS = [0.5, 0.3, 0.2] as const;

export const GATES = {
  /** Medium+ requires at least this many repos in the language, or one merged external PR. */
  minReposForMedium: 2,
  /** Top requires a GitHub account at least this old. */
  minAccountAgeDaysForTop: 180,
  /** Top requires at least this many user-authored commits in the language. */
  minAuthoredCommitsForTop: 30,
} as const;

export const TIER_NUM: Record<Tier, 1 | 2 | 3> = { basic: 1, medium: 2, top: 3 };
export const TIER_ORDER: Tier[] = ["basic", "medium", "top"];

export function tierFor(score: number): Tier {
  if (score >= TIER_CUTOFFS.top) return "top";
  if (score >= TIER_CUTOFFS.medium) return "medium";
  return "basic";
}

export function tierAtLeast(tier: Tier, min: Tier): boolean {
  return TIER_NUM[tier] >= TIER_NUM[min];
}

/** Maps a GitHub language name to the on-chain skill id charset [a-z0-9+#._:-]. */
export function skillIdFor(language: string): string {
  return language
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9+#._:-]/g, "")
    .slice(0, 48);
}
