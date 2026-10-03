import { z } from "zod";
import { chatJson, llmConfigured, truncateToTokens } from "../llm/client";
import { dataBlock } from "../llm/json";
import { CODE_RUBRIC_SYSTEM } from "../llm/prompts";
import { log } from "../lib/logger";
import type { GithubApi } from "./github-client";
import { LANGUAGE_EXTENSIONS, type RepoSignals } from "./github-signals";

export const RubricSchema = z.object({
  substance: z.coerce.number(),
  strengths: z.array(z.string().max(300)).max(5).default([]),
  concerns: z.array(z.string().max(300)).max(5).default([]),
});

export interface RubricResult {
  substance: number; // clamped 0..10
  strengths: string[];
  concerns: string[];
  files: { repo: string; path: string }[];
  llmUnavailable: boolean;
}

export interface SampledFile {
  repo: string;
  path: string;
  content: string;
}

const MAX_FILES = 3;
const MAX_TOKENS_PER_FILE = 4000;

/** Pick up to 3 of the largest non-generated source files for the language across its top repos. */
export async function sampleFiles(gh: GithubApi, language: string, repos: RepoSignals[]): Promise<SampledFile[]> {
  const exts = LANGUAGE_EXTENSIONS[language];
  const matchExt = (p: string) => !exts || exts.some((e) => p.toLowerCase().endsWith(e));
  const picks: { repo: RepoSignals; path: string; size: number }[] = [];
  for (const r of repos) {
    for (const f of r.sampleCandidates) if (matchExt(f.path)) picks.push({ repo: r, path: f.path, size: f.size });
  }
  // Prefer spreading across repos: take the largest file from each repo first.
  const seen = new Set<string>();
  const ordered = [
    ...picks.filter((p) => (seen.has(p.repo.fullName) ? false : (seen.add(p.repo.fullName), true))),
    ...picks,
  ];
  const chosen: typeof picks = [];
  for (const p of ordered) {
    if (chosen.length >= MAX_FILES) break;
    if (!chosen.some((c) => c.repo.fullName === p.repo.fullName && c.path === p.path)) chosen.push(p);
  }
  const out: SampledFile[] = [];
  for (const c of chosen) {
    const content = await gh.getRaw(c.repo.owner, c.repo.name, c.repo.headSha ?? c.repo.defaultBranch, c.path, 64_000);
    if (content) out.push({ repo: c.repo.fullName, path: c.path, content });
  }
  return out;
}

export function buildRubricMessages(language: string, files: SampledFile[]) {
  const blocks = files
    .map((f) =>
      dataBlock("untrusted_code", truncateToTokens(f.content, MAX_TOKENS_PER_FILE), { path: `${f.repo}/${f.path}` }),
    )
    .join("\n\n");
  return [
    { role: "system" as const, content: CODE_RUBRIC_SYSTEM },
    { role: "user" as const, content: `Language: ${language}\n${blocks}` },
  ];
}

export const clampSubstance = (n: number) => Math.max(0, Math.min(10, Math.round(Number.isFinite(n) ? n : 0)));

/**
 * The LLM contributes at most 10 of 100 points. On any failure we record 0 and
 * `llmUnavailable: true` rather than blocking the analysis.
 */
export async function scoreSubstance(language: string, files: SampledFile[]): Promise<RubricResult> {
  const meta = files.map((f) => ({ repo: f.repo, path: f.path }));
  if (files.length === 0 || !llmConfigured()) {
    return { substance: 0, strengths: [], concerns: [], files: meta, llmUnavailable: true };
  }
  try {
    const r = await chatJson(RubricSchema, buildRubricMessages(language, files), { maxTokens: 400 });
    return {
      substance: clampSubstance(r.substance),
      strengths: r.strengths.slice(0, 3),
      concerns: r.concerns.slice(0, 3),
      files: meta,
      llmUnavailable: false,
    };
  } catch (err) {
    log.warn("llm rubric failed", { language, err });
    return { substance: 0, strengths: [], concerns: [], files: meta, llmUnavailable: true };
  }
}
