import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { conflict } from "../lib/errors";
import { log } from "../lib/logger";
import { randomToken } from "../lib/crypto";
import type { User } from "../types";
import { buildEvidence, evidenceHash, repoFingerprint } from "./evidence";
import { GithubRateLimitError, type GithubApi } from "./github-client";
import { collectSignals } from "./github-signals";
import { sampleFiles, scoreSubstance } from "./llm-rubric";
import { meaningful, scoreLanguages } from "./scoring";

export type Analysis = typeof schema.analyses.$inferSelect;

export interface Job {
  id: string;
  userId: string;
  status: "running" | "done" | "failed";
  steps: { label: string; at: string }[];
  results: AnalysisSummary[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AnalysisSummary {
  id: string;
  skill: string;
  language: string;
  tier: string;
  score: number;
  evidenceHash: string;
  cached: boolean;
  tokenId: string | null;
  mintTx: string | null;
}

const MAX_LANGUAGES = 8;
const JOB_TTL_MS = 60 * 60 * 1000;
const jobs = new Map<string, Job>();

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, j] of jobs) if (Date.parse(j.startedAt) < cutoff && j.status !== "running") jobs.delete(id);
}, 5 * 60_000).unref();

export const getJob = (id: string) => jobs.get(id) ?? null;

export function summarize(a: Analysis, cached: boolean): AnalysisSummary {
  const ev = a.evidenceJson as { language?: string };
  return {
    id: a.id,
    skill: a.skill,
    language: ev.language ?? a.skill,
    tier: a.tier,
    score: a.score,
    evidenceHash: a.evidenceHash,
    cached,
    tokenId: a.tokenId,
    mintTx: a.mintTx,
  };
}

export function startAnalysisJob(user: User, gh: GithubApi): Job {
  for (const j of jobs.values()) {
    if (j.userId === user.id && j.status === "running") throw conflict("An analysis is already running");
  }
  const job: Job = {
    id: randomToken(12),
    userId: user.id,
    status: "running",
    steps: [],
    results: [],
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  const progress = (label: string) => job.steps.push({ label, at: new Date().toISOString() });

  runAnalysis(user, gh, progress)
    .then((results) => {
      job.results = results;
      job.status = "done";
      progress("Done");
    })
    .catch((err: unknown) => {
      job.status = "failed";
      job.error =
        err instanceof GithubRateLimitError
          ? err.message
          : "Analysis failed. GitHub or the scoring service may be busy, please retry.";
      log.error("analysis job failed", { jobId: job.id, err });
    })
    .finally(() => {
      job.finishedAt = new Date().toISOString();
    });
  return job;
}

/** The whole pipeline. Exported so tests can run it synchronously with a fake GitHub. */
export async function runAnalysis(
  user: User,
  gh: GithubApi,
  progress: (s: string) => void = () => {},
): Promise<AnalysisSummary[]> {
  const db = await getDb();
  const signals = await collectSignals(gh, user.githubHandle, progress);

  const prelim = scoreLanguages(signals).filter(meaningful).slice(0, MAX_LANGUAGES);
  if (prelim.length === 0) progress("No public source code found yet");

  const out: AnalysisSummary[] = [];
  for (const base of prelim) {
    const fingerprint = repoFingerprint(base);
    const [hit] = await db
      .select()
      .from(schema.analyses)
      .where(
        and(
          eq(schema.analyses.userId, user.id),
          eq(schema.analyses.skill, base.skill),
          eq(schema.analyses.repoFingerprint, fingerprint),
          eq(schema.analyses.source, "github"),
        ),
      )
      .orderBy(desc(schema.analyses.createdAt))
      .limit(1);
    if (hit) {
      progress(`${base.language}: unchanged since last run, using cached result`);
      out.push(summarize(hit, true));
      continue;
    }

    progress(`${base.language}: reviewing code samples`);
    const files = await sampleFiles(gh, base.language, base.topRepos);
    const rubric = await scoreSubstance(base.language, files);
    const final = scoreLanguages(signals, { [base.language]: rubric.substance }).find(
      (r) => r.language === base.language,
    )!;

    const evidence = buildEvidence(user.githubHandle, final, rubric);
    const hash = evidenceHash(evidence);
    const [row] = await db
      .insert(schema.analyses)
      .values({
        userId: user.id,
        skill: final.skill,
        tier: final.tier,
        score: final.score,
        source: "github",
        verified: true,
        evidenceJson: evidence,
        evidenceHash: hash,
        repoFingerprint: fingerprint,
      })
      .returning();
    progress(`${base.language}: ${final.tier} (${final.score}/100)`);
    out.push(summarize(row!, false));
  }
  return out;
}

/** Latest analysis per skill for a user. */
export async function latestAnalyses(userId: string): Promise<Analysis[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.analyses)
    .where(eq(schema.analyses.userId, userId))
    .orderBy(desc(schema.analyses.createdAt));
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.skill) ? false : (seen.add(r.skill), true)));
}
