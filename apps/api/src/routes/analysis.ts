import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { requireUser, sessionGithubToken } from "../auth/session";
import { createGithubApi } from "../analysis/github-client";
import { getJob, latestAnalyses, startAnalysisJob, summarize } from "../analysis/jobs";
import { forbidden, notFound } from "../lib/errors";
import { rateLimit } from "../lib/ratelimit";
import type { AppEnv } from "../types";

export const analysis = new Hono<AppEnv>();

analysis.post("/analysis/start", rateLimit("analysis", 5, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const token = await sessionGithubToken(c.get("sessionId"));
  const job = startAnalysisJob(user, createGithubApi(token));
  return c.json({ jobId: job.id }, 202);
});

analysis.get("/analysis/:jobId", (c) => {
  const user = requireUser(c);
  const job = getJob(c.req.param("jobId"));
  if (!job) throw notFound("Job not found or expired");
  if (job.userId !== user.id) throw forbidden();
  return c.json(job);
});

analysis.get("/analyses", async (c) => {
  const user = requireUser(c);
  const rows = await latestAnalyses(user.id);
  return c.json({ analyses: rows.map((r) => ({ ...summarize(r, false), source: r.source, verified: r.verified })) });
});

/** Public: anyone can fetch the evidence JSON and rehash it against the on-chain evidenceHash. */
analysis.get("/evidence/:hash", async (c) => {
  const hash = c.req.param("hash").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw notFound();
  const db = await getDb();
  const [row] = await db
    .select({ evidence: schema.analyses.evidenceJson, verified: schema.analyses.verified, source: schema.analyses.source })
    .from(schema.analyses)
    .where(eq(schema.analyses.evidenceHash, hash))
    .limit(1);
  if (!row) throw notFound("Evidence not found");
  c.header("Cache-Control", "public, max-age=3600, immutable");
  return c.json({
    hash,
    algorithm: "keccak256(RFC8785 canonical JSON)",
    evidence: row.evidence,
  });
});
