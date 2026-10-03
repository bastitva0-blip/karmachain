import { GATES, TOP_REPO_WEIGHTS, WEIGHTS, skillIdFor, tierFor, type Tier } from "@karma/shared";
import type { ExternalPr, RepoSignals, Signals } from "./github-signals";

/** Pure scoring. No I/O. Every function here is unit-tested. */

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const logScale = (x: number, full: number) => clamp01(Math.log10(Math.max(0, x) + 1) / Math.log10(full + 1));
const round1 = (x: number) => Math.round(x * 10) / 10;
const DAY = 864e5;

export interface Components {
  complexity: number;
  hygiene: number;
  authorship: number;
  external: number;
  substance: number;
}

export interface RepoScore {
  complexity: number; // 0..25
  hygiene: number; // 0..25
  authorship: number; // 0..20
  starsForks: number; // 0..1 (feeds external)
  quality: number; // for ranking repos within a language
}

export function scoreRepo(r: RepoSignals, now: number): RepoScore {
  const totalBytes = Object.values(r.languages).reduce((a, b) => a + b, 0);
  const significantLangs = totalBytes
    ? Object.values(r.languages).filter((b) => b / totalBytes >= 0.05).length
    : 1;

  const complexity =
    WEIGHTS.complexity *
    (0.48 * logScale(r.sourceFileCount, 200) +
      0.2 * logScale(r.sizeKb, 10_000) +
      0.2 * clamp01(r.maxDepth / 5) +
      0.12 * clamp01((significantLangs - 1) / 3));

  const hygiene =
    WEIGHTS.hygiene *
    (0.32 * (r.hasTests ? 1 : 0) +
      0.24 * (r.hasCi ? 1 : 0) +
      0.16 * clamp01(r.readmeLength / 2000) +
      0.12 * (r.license ? 1 : 0) +
      0.16 * clamp01(r.lintConfigs.length / 2));

  const created = Date.parse(r.createdAt);
  const pushed = Date.parse(r.pushedAt);
  const spanMonths = (pushed - created) / (30 * DAY);
  const ageDays = (now - pushed) / DAY;
  const recency = ageDays <= 90 ? 1 : ageDays <= 365 ? 0.5 : ageDays <= 730 ? 0.2 : 0;
  const authorship =
    WEIGHTS.authorship *
    (0.4 * logScale(r.authoredCommits, 100) + 0.3 * clamp01(spanMonths / 12) + 0.3 * recency);

  const starsForks = logScale(r.stars + r.forks, 1000);
  const quality = complexity + hygiene + authorship + starsForks * 10;
  return { complexity, hygiene, authorship, starsForks, quality };
}

/** Star-weighted merged PR value for one PR: 1 + log10(stars+1). */
export const prWeight = (pr: ExternalPr) => 1 + Math.log10(Math.max(0, pr.targetStars) + 1);

export interface LanguageResult {
  language: string;
  skill: string;
  score: number;
  tier: Tier;
  components: Components;
  topRepos: RepoSignals[];
  repoCount: number;
  externalPrs: ExternalPr[];
  authoredCommits: number;
  gates: string[];
}

export function aggregate(
  weighted: { s: RepoScore; w: number }[],
  key: "complexity" | "hygiene" | "authorship" | "starsForks",
): number {
  const wsum = weighted.reduce((a, x) => a + x.w, 0);
  if (!wsum) return 0;
  return weighted.reduce((a, x) => a + x.s[key] * x.w, 0) / wsum;
}

/**
 * Group repos by primary language and compute deterministic components (90 pts).
 * `substance` is filled later from the LLM (0-10); pass a map to include it.
 */
export function scoreLanguages(
  signals: Signals,
  substanceByLanguage: Record<string, number> = {},
  now = Date.now(),
): LanguageResult[] {
  const groups = new Map<string, RepoSignals[]>();
  for (const r of signals.repos) {
    if (!r.primaryLanguage || r.sourceFileCount === 0) continue;
    if (!groups.has(r.primaryLanguage)) groups.set(r.primaryLanguage, []);
    groups.get(r.primaryLanguage)!.push(r);
  }
  // A language can also qualify through external merged PRs alone.
  for (const pr of signals.externalPrs) {
    if (pr.targetLanguage && !groups.has(pr.targetLanguage)) groups.set(pr.targetLanguage, []);
  }

  const accountAgeDays = signals.account.createdAt ? (now - Date.parse(signals.account.createdAt)) / DAY : 0;
  const results: LanguageResult[] = [];

  for (const [language, repos] of groups) {
    const scored = repos.map((r) => ({ r, s: scoreRepo(r, now) })).sort((a, b) => b.s.quality - a.s.quality);
    const top = scored.slice(0, 3);
    // Renormalise weights when fewer than 3 repos exist, but penalise via the gates below.
    const weighted = top.map((x, i) => ({ s: x.s, w: TOP_REPO_WEIGHTS[i]! }));

    const prs = signals.externalPrs.filter((p) => p.targetLanguage === language);
    const prValue = prs.reduce((a, p) => a + prWeight(p), 0);
    const starsForks = aggregate(weighted, "starsForks");
    const external = WEIGHTS.external * (0.4 * starsForks + 0.6 * clamp01(prValue / 10));

    const substance = Math.max(0, Math.min(WEIGHTS.substance, Math.round(substanceByLanguage[language] ?? 0)));
    const components: Components = {
      complexity: round1(aggregate(weighted, "complexity")),
      hygiene: round1(aggregate(weighted, "hygiene")),
      authorship: round1(aggregate(weighted, "authorship")),
      external: round1(external),
      substance,
    };
    let score = Math.round(
      components.complexity + components.hygiene + components.authorship + components.external + components.substance,
    );

    const authoredCommits = repos.reduce((a, r) => a + r.authoredCommits, 0);
    const gates: string[] = [];
    if (repos.length < GATES.minReposForMedium && prs.length === 0 && score >= 40) {
      score = 39;
      gates.push(`Medium needs ${GATES.minReposForMedium}+ repos or a merged external PR`);
    }
    if (score >= 70) {
      if (accountAgeDays < GATES.minAccountAgeDaysForTop) {
        score = 69;
        gates.push(`Top needs an account older than ${GATES.minAccountAgeDaysForTop} days`);
      } else if (authoredCommits < GATES.minAuthoredCommitsForTop) {
        score = 69;
        gates.push(`Top needs ${GATES.minAuthoredCommitsForTop}+ authored commits in ${language}`);
      }
    }
    score = Math.max(0, Math.min(100, score));

    results.push({
      language,
      skill: skillIdFor(language),
      score,
      tier: tierFor(score),
      components,
      topRepos: top.map((x) => x.r),
      repoCount: repos.length,
      externalPrs: prs,
      authoredCommits,
      gates,
    });
  }
  return results.sort((a, b) => b.score - a.score);
}

/** Drop languages with no meaningful work (keeps UI clean). */
export const meaningful = (r: LanguageResult) => r.repoCount > 0 || r.externalPrs.length > 0;
