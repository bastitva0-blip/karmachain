import canonicalize from "canonicalize";
import { keccak256, toBytes } from "viem";
import { RUBRIC_VERSION } from "@karma/shared";
import { sha256Hex } from "../lib/crypto";
import type { RubricResult } from "./llm-rubric";
import type { LanguageResult } from "./scoring";

export interface Evidence {
  kind: "karmachain.evidence";
  rubricVersion: string;
  subject: { github: string };
  language: string;
  skill: string;
  tier: string;
  score: number;
  components: LanguageResult["components"];
  gates: string[];
  topRepos: {
    fullName: string;
    url: string;
    commitSha: string | null;
    stars: number;
    forks: number;
    sourceFiles: number;
    hasTests: boolean;
    hasCi: boolean;
    license: string | null;
    authoredCommits: number;
  }[];
  mergedExternalPrs: { repo: string; url: string; targetStars: number; mergedAt: string | null }[];
  substance: { score: number; strengths: string[]; concerns: string[]; files: { repo: string; path: string }[]; llmUnavailable: boolean };
  verified: boolean;
  source: "github" | "zip" | "portfolio";
  issuedAt: string;
}

export function buildEvidence(
  handle: string,
  r: LanguageResult,
  rubric: RubricResult,
  issuedAt = new Date().toISOString(),
): Evidence {
  return {
    kind: "karmachain.evidence",
    rubricVersion: RUBRIC_VERSION,
    subject: { github: handle },
    language: r.language,
    skill: r.skill,
    tier: r.tier,
    score: r.score,
    components: r.components,
    gates: r.gates,
    topRepos: r.topRepos.map((t) => ({
      fullName: t.fullName,
      url: t.url,
      commitSha: t.headSha,
      stars: t.stars,
      forks: t.forks,
      sourceFiles: t.sourceFileCount,
      hasTests: t.hasTests,
      hasCi: t.hasCi,
      license: t.license,
      authoredCommits: t.authoredCommits,
    })),
    mergedExternalPrs: r.externalPrs.slice(0, 20).map((p) => ({
      repo: p.repoFullName,
      url: p.url,
      targetStars: p.targetStars,
      mergedAt: p.mergedAt,
    })),
    substance: {
      score: rubric.substance,
      strengths: rubric.strengths,
      concerns: rubric.concerns,
      files: rubric.files,
      llmUnavailable: rubric.llmUnavailable,
    },
    verified: true,
    source: "github",
    issuedAt,
  };
}

/** RFC 8785 canonical JSON (sorted keys, no whitespace). */
export function canonicalJson(value: unknown): string {
  const s = canonicalize(value);
  if (s === undefined) throw new Error("Value cannot be canonicalized");
  return s;
}

/** bytes32 hex committed on-chain. Anyone can rehash GET /evidence/:hash to verify. */
export const evidenceHash = (value: unknown) => keccak256(toBytes(canonicalJson(value)));

/** Cache key: changes when any analysed repo gets a new commit or the rubric changes. */
export function repoFingerprint(r: LanguageResult): string {
  const parts = r.topRepos.map((t) => `${t.fullName}@${t.headSha ?? "none"}`).sort();
  const prs = r.externalPrs.map((p) => p.url).sort();
  return sha256Hex([RUBRIC_VERSION, ...parts, ...prs].join("|"));
}
