import { RUBRIC_VERSION, type Tier } from "@karma/shared";
import { evidenceHash } from "../analysis/evidence";
import type { Portfolio } from "./extract";

/**
 * Portfolios have no deterministic quality signal, so tiers are capped:
 * Basic by default, Medium with 3+ described projects that link to real work,
 * Top only with 2+ client attestations (ClientReview) on the wallet.
 */
export function portfolioTier(p: Portfolio, clientReviews: number): { tier: Tier; score: number; reason: string } {
  const described = p.projects.filter((x) => x.description.length >= 40);
  const linked = described.filter((x) => x.links.length > 0);
  if (clientReviews >= 2 && linked.length >= 3) {
    return { tier: "top", score: 72, reason: "3+ linked projects and 2+ signed client reviews" };
  }
  if (linked.length >= 3) return { tier: "medium", score: 50, reason: "3+ described projects with links" };
  return { tier: "basic", score: 25, reason: "verified ownership, limited project detail" };
}

export const portfolioSkill = (discipline: string) => `portfolio:${discipline}`;

export function portfolioEvidence(handle: string, source: string, p: Portfolio, t: ReturnType<typeof portfolioTier>, verifiedWhere: string) {
  const ev = {
    kind: "karmachain.evidence",
    rubricVersion: `${RUBRIC_VERSION}+portfolio`,
    subject: { github: handle },
    language: `Portfolio (${p.discipline})`,
    skill: portfolioSkill(p.discipline),
    tier: t.tier,
    score: t.score,
    components: null,
    gates: [t.reason],
    topRepos: [],
    mergedExternalPrs: [],
    portfolio: { source, verifiedVia: verifiedWhere, projects: p.projects },
    substance: null,
    verified: true,
    source: "portfolio",
    issuedAt: new Date().toISOString(),
  };
  return { evidence: ev, hash: evidenceHash(ev) };
}
