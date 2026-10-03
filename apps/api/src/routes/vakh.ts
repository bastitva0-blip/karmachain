import { Hono } from "hono";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client";
import { env } from "../env";
import { badRequest, HttpError, unauthorized } from "../lib/errors";
import { log } from "../lib/logger";
import { rateLimit } from "../lib/ratelimit";
import { body } from "../lib/validate";
import { findMatches } from "../recruiter/match";
import { VakhToolError } from "../vakh/client";
import { beginAuth, completeAuth, connection, disconnect, VakhNotConnectedError, type VakhAccount } from "../vakh/oauth";
import { backfillProofs, exportShortlist, proofsFormId, setupStudio, vakhFormUrl, vakhPostUrl } from "../vakh/publish";
import { syncPipeline } from "../vakh/pipeline";
import { kvGet } from "../vakh/store";
import type { AppEnv } from "../types";
import { requireAdmin } from "./admin";
import { loadJobSpec, recruiterKeyOf } from "./recruiter";

export const vakh = new Hono<AppEnv>();

const ReturnTo = z
  .string()
  .max(200)
  .regex(/^\/(?!\/)[A-Za-z0-9/_\-?=&.]*$/, "Must be a path on this site")
  .default("/");

/** Maps Vakh failures to readable API errors. */
function vakhError(err: unknown): never {
  if (err instanceof VakhNotConnectedError) {
    throw new HttpError(409, "vakh_not_connected", err.message);
  }
  if (err instanceof VakhToolError) {
    log.warn("vakh tool rejected", { err });
    throw new HttpError(502, "vakh_rejected", "Vakh rejected the request. Please retry or reconnect.");
  }
  if (err instanceof HttpError) throw err;
  log.warn("vakh unavailable", { err });
  throw new HttpError(503, "vakh_unavailable", "Vakh is unavailable right now. Please retry.");
}

function recruiterAccount(c: Parameters<typeof recruiterKeyOf>[0]): VakhAccount & { kind: "recruiter" } {
  const key = recruiterKeyOf(c);
  if (!key) throw unauthorized("Missing recruiter key");
  return { kind: "recruiter", recruiterKey: key };
}

/** Public link to the directory, plus this recruiter's connection (when the header is sent). */
vakh.get("/vakh/status", async (c) => {
  const formId = await proofsFormId();
  const key = recruiterKeyOf(c);
  const recruiter = key ? await connection({ kind: "recruiter", recruiterKey: key }) : { connected: false, displayName: null };
  const pipeline = key ? await kvGet<{ id: string }>(`form:pipeline:${key}`) : null;
  return c.json({
    directoryUrl: formId ? vakhFormUrl(formId) : null,
    recruiter: { ...recruiter, pipelineUrl: pipeline ? vakhFormUrl(pipeline.id, "board") : null },
  });
});

/** Public: this developer's proof posts in the Vakh directory. */
vakh.get("/vakh/proofs/:handle", async (c) => {
  const db = await getDb();
  const rows = await db
    .select({ skill: schema.analyses.skill, postId: schema.analyses.vakhPostId })
    .from(schema.analyses)
    .innerJoin(schema.users, eq(schema.users.id, schema.analyses.userId))
    .where(
      and(
        sql`lower(${schema.users.githubHandle}) = ${c.req.param("handle").toLowerCase()}`,
        isNotNull(schema.analyses.vakhPostId),
        isNull(schema.analyses.revokedAt),
      ),
    );
  return c.json({ items: rows.map((r) => ({ skill: r.skill, url: vakhPostUrl(r.postId!) })) });
});

vakh.post("/vakh/connect", rateLimit("vakh-connect", 20, 10 * 60_000), async (c) => {
  const input = await body(c, z.object({ as: z.enum(["recruiter", "studio"]), returnTo: ReturnTo }));
  const account: VakhAccount = input.as === "studio" ? (requireAdmin(c), { kind: "studio" }) : recruiterAccount(c);
  try {
    return c.json({ url: await beginAuth(account, input.returnTo) });
  } catch (err) {
    vakhError(err);
  }
});

/** OAuth redirect target (web origin /api/vakh/callback is proxied here). */
vakh.get("/vakh/callback", async (c) => {
  const home = env.WEB_ORIGIN.replace(/\/$/, "");
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    log.warn("vakh callback without code", { error: c.req.query("error") });
    return c.redirect(`${home}/recruiter?vakh=cancelled`);
  }
  try {
    const pending = await completeAuth(code, state);
    const sep = pending.returnTo.includes("?") ? "&" : "?";
    return c.redirect(`${home}${pending.returnTo}${sep}vakh=connected`);
  } catch (err) {
    log.warn("vakh callback failed", { err });
    return c.redirect(`${home}/recruiter?vakh=error`);
  }
});

vakh.post("/vakh/disconnect", async (c) => {
  const input = await body(c, z.object({ as: z.enum(["recruiter", "studio"]) }));
  const account: VakhAccount = input.as === "studio" ? (requireAdmin(c), { kind: "studio" }) : recruiterAccount(c);
  await disconnect(account);
  return c.json({ ok: true });
});

/** Sends this job's top matches to the recruiter's own Vakh pipeline board. */
vakh.post("/recruiter/jobs/:id/vakh", rateLimit("vakh-export", 10, 10 * 60_000), async (c) => {
  const account = recruiterAccount(c);
  const job = await loadJobSpec(c.req.param("id"));
  if (job.recruiterKey && job.recruiterKey !== account.recruiterKey) throw badRequest("This job belongs to a different recruiter");
  const matches = await findMatches(job.spec);
  if (!matches.length) throw badRequest("No matches to export yet");
  try {
    return c.json(await exportShortlist(account.recruiterKey, job.id, job.spec.title, matches));
  } catch (err) {
    vakhError(err);
  }
});

/** Reads the recruiter's Vakh board back: stage moves create interviews, finished ones post reports. */
vakh.post("/recruiter/vakh/sync", rateLimit("vakh-sync", 30, 10 * 60_000), async (c) => {
  const account = recruiterAccount(c);
  try {
    const out = await syncPipeline(account.recruiterKey);
    return c.json(out ?? { formId: null, items: [], interviewsCreated: 0, reportsWritten: 0 });
  } catch (err) {
    vakhError(err);
  }
});

// ---------------------------------------------------------------- admin

vakh.get("/admin/vakh", async (c) => {
  requireAdmin(c);
  const formId = await proofsFormId();
  const db = await getDb();
  const [counts] = await db
    .select({
      published: sql<number>`count(*) filter (where ${schema.analyses.vakhPostId} is not null)::int`,
      pending: sql<number>`count(*) filter (where ${schema.analyses.vakhPostId} is null and ${schema.analyses.tokenId} is not null and ${schema.analyses.revokedAt} is null and ${schema.users.consentSearchable})::int`,
    })
    .from(schema.analyses)
    .innerJoin(schema.users, eq(schema.users.id, schema.analyses.userId));
  return c.json({
    studio: await connection({ kind: "studio" }),
    directoryUrl: formId ? vakhFormUrl(formId) : null,
    published: counts?.published ?? 0,
    pending: counts?.pending ?? 0,
  });
});

vakh.post("/admin/vakh/setup", rateLimit("vakh-admin", 20, 10 * 60_000), async (c) => {
  requireAdmin(c);
  try {
    return c.json(await setupStudio());
  } catch (err) {
    vakhError(err);
  }
});

vakh.post("/admin/vakh/backfill", rateLimit("vakh-admin", 20, 10 * 60_000), async (c) => {
  requireAdmin(c);
  try {
    await setupStudio();
    return c.json(await backfillProofs());
  } catch (err) {
    vakhError(err);
  }
});
