import { eq } from "drizzle-orm";
import { z } from "zod";
import { TIER_NUM, skillIdFor, tierAtLeast, type JobSpec, type MatchCandidate, type Tier } from "@karma/shared";
import { getDb, schema } from "../db/client";
import { chatJson, llmConfigured } from "../llm/client";
import { dataBlock } from "../llm/json";
import { MATCH_REASON_SYSTEM } from "../llm/prompts";
import { log } from "../lib/logger";
import { cosine, embedQuery, keywordSimilarity } from "./embeddings";

interface ProfileSkillRow {
  skill: string;
  language: string;
  tier: Tier;
  score: number;
}

const ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  node: "javascript",
  "node.js": "javascript",
  nodejs: "javascript",
  react: "typescript",
  nextjs: "typescript",
  "next.js": "typescript",
  golang: "go",
  py: "python",
  django: "python",
  rails: "ruby",
  "c-sharp": "c#",
  csharp: "c#",
  cpp: "c++",
  solidity: "solidity",
};

/** "TypeScript" / "ts" / "Node.js" → on-chain skill id. */
export function normalizeSkill(s: string): string {
  const id = skillIdFor(s.trim());
  return ALIASES[id] ?? id;
}

export function jobText(spec: JobSpec): string {
  return [
    `${spec.seniority} ${spec.title}`,
    `Must have: ${spec.mustHaveSkills.join(", ")}`,
    spec.niceToHave.length ? `Nice to have: ${spec.niceToHave.join(", ")}` : "",
    spec.softSkills.length ? `Soft skills: ${spec.softSkills.join(", ")}` : "",
    spec.domain ? `Domain: ${spec.domain}` : "",
  ]
    .filter(Boolean)
    .join(". ");
}

/** Fraction of must-haves covered at ≥ minTier, weighted by tier level (0..1). */
export function tierFit(spec: JobSpec, skills: ProfileSkillRow[]): number {
  const wanted = spec.mustHaveSkills.map(normalizeSkill);
  const bySkill = new Map(skills.map((s) => [s.skill, s]));
  if (wanted.length === 0) {
    const best = Math.max(0, ...skills.map((s) => (tierAtLeast(s.tier, spec.minTier) ? TIER_NUM[s.tier] : 0)));
    return best / 3;
  }
  let sum = 0;
  for (const w of wanted) {
    const s = bySkill.get(w);
    if (s && tierAtLeast(s.tier, spec.minTier)) sum += TIER_NUM[s.tier] / 3;
  }
  return sum / wanted.length;
}

export function passesHardFilter(spec: JobSpec, skills: ProfileSkillRow[]): boolean {
  const wanted = new Set(spec.mustHaveSkills.map(normalizeSkill));
  return skills.some((s) => (wanted.size === 0 || wanted.has(s.skill)) && tierAtLeast(s.tier, spec.minTier));
}

export const rankScore = (similarity: number, fit: number, ext: number) =>
  0.5 * Math.max(0, similarity) + 0.3 * fit + 0.2 * Math.max(0, Math.min(1, ext));

/** Flattened, key-addressable evidence the LLM may cite. */
export function evidenceFacts(handle: string, skills: ProfileSkillRow[], summary: string, ext: number) {
  const facts: Record<string, string | number> = { handle, externalValidation: Math.round(ext * 100) / 100 };
  for (const s of skills) {
    facts[`skills.${s.skill}.tier`] = s.tier;
    facts[`skills.${s.skill}.score`] = s.score;
  }
  facts.summary = summary;
  return facts;
}

const ReasonSchema = z.object({
  sentences: z.array(z.string().max(300)).min(1).max(3),
  claims: z.array(z.object({ text: z.string(), evidenceKey: z.string() })).max(8).default([]),
});

export function templateReasons(spec: JobSpec, skills: ProfileSkillRow[], ext: number): string[] {
  const wanted = new Set(spec.mustHaveSkills.map(normalizeSkill));
  const hits = skills.filter((s) => wanted.has(s.skill)).sort((a, b) => b.score - a.score);
  const top = hits[0] ?? [...skills].sort((a, b) => b.score - a.score)[0];
  const first = top
    ? `Verified ${top.language} at ${top.tier} tier (${top.score}/100)${hits.length > 1 ? `, plus ${hits.length - 1} more required skill${hits.length > 2 ? "s" : ""}` : ""}.`
    : "Has verified skills on KarmaChain.";
  const second =
    ext >= 0.5
      ? "Strong external validation from stars and merged pull requests to other projects."
      : ext > 0.1
        ? "Some external validation from other projects."
        : "Limited external validation so far; consider probing real-world usage.";
  return [first, second];
}

/** Two sentences; every claim must reference an evidence key that exists, else we use the template. */
async function llmReasons(spec: JobSpec, facts: Record<string, string | number>): Promise<string[] | null> {
  if (!llmConfigured()) return null;
  try {
    const r = await chatJson(
      ReasonSchema,
      [
        { role: "system", content: MATCH_REASON_SYSTEM },
        {
          role: "user",
          content: `Job spec: ${JSON.stringify({ title: spec.title, seniority: spec.seniority, mustHaveSkills: spec.mustHaveSkills, minTier: spec.minTier })}\n${dataBlock(
            "candidate_evidence",
            JSON.stringify({ keys: Object.keys(facts), facts }),
          )}`,
        },
      ],
      { maxTokens: 300, timeoutMs: 15_000, retries: 0 },
    );
    const valid = r.claims.length > 0 && r.claims.every((c) => c.evidenceKey in facts);
    if (!valid) return null;
    // Reject numbers that don't appear in the evidence (common hallucination).
    const factNumbers = new Set(
      Object.values(facts)
        .map(String)
        .join(" ")
        .match(/\d+/g) ?? [],
    );
    const nums = r.sentences.join(" ").match(/\d+/g) ?? [];
    if (nums.some((n) => !factNumbers.has(n))) return null;
    return r.sentences.slice(0, 2);
  } catch (err) {
    log.warn("match reasons failed", { err });
    return null;
  }
}

export async function findMatches(spec: JobSpec, limit = 5): Promise<MatchCandidate[]> {
  const db = await getDb();
  const rows = await db
    .select({ user: schema.users, profile: schema.profiles })
    .from(schema.users)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
    .where(eq(schema.users.consentSearchable, true));

  const qText = jobText(spec);
  const qVec = await embedQuery(qText);

  const ranked = rows
    .map(({ user, profile }) => {
      const skills = (profile.skillsJson as ProfileSkillRow[]) ?? [];
      if (!passesHardFilter(spec, skills)) return null;
      const emb = profile.embedding;
      const similarity = qVec && emb?.length ? cosine(qVec, emb) : keywordSimilarity(qText, profile.summary) * 2;
      const fit = tierFit(spec, skills);
      const ext = profile.externalValidation;
      return {
        user,
        profile,
        skills,
        parts: {
          similarity: Math.round(Math.max(0, Math.min(1, similarity)) * 100) / 100,
          tierFit: Math.round(fit * 100) / 100,
          externalValidation: Math.round(ext * 100) / 100,
        },
        score: rankScore(Math.min(1, similarity), fit, ext),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return Promise.all(
    ranked.map(async (r) => {
      const facts = evidenceFacts(r.user.githubHandle, r.skills, r.profile.summary, r.profile.externalValidation);
      const llm = await llmReasons(spec, facts);
      return {
        handle: r.user.githubHandle,
        name: r.user.name,
        avatarUrl: r.user.avatarUrl,
        isDemo: r.user.isDemo,
        score: Math.round(r.score * 100) / 100,
        parts: r.parts,
        skills: r.skills,
        reasons: llm ?? templateReasons(spec, r.skills, r.profile.externalValidation),
        reasonsSource: llm ? "llm" : "template",
      } satisfies MatchCandidate;
    }),
  );
}
