import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { BASESCAN, type MatchCandidate, type Tier } from "@karma/shared";
import { getDb, schema } from "../db/client";
import { env } from "../env";
import type { Evidence } from "../analysis/evidence";
import { log } from "../lib/logger";
import { withVakh, VakhToolError } from "./client";
import { ensureForm, pipelineForm, PROOFS_FORM, STAGE_OPTION, TIER_OPTION, unwrapPost } from "./forms";
import { VakhNotConnectedError, type VakhAccount } from "./oauth";
import { kvGet } from "./store";

const STUDIO: VakhAccount = { kind: "studio" };
const PROOFS_KEY = "form:proofs";
const pipelineKey = (recruiterKey: string) => `form:pipeline:${recruiterKey}`;
const PostRef = z.object({ id: z.string() });

const web = (path: string) => `${env.WEB_ORIGIN.replace(/\/$/, "")}${path}`;
export const vakhFormUrl = (formId: string, viewId?: string) =>
  `${env.VAKH_APP_URL}/form/${formId}${viewId ? `/view/${viewId}` : ""}`;
export const vakhPostUrl = (postId: string) => `${env.VAKH_APP_URL}/post/${postId}`;

export async function proofsFormId(): Promise<string | null> {
  return (await kvGet<{ id: string }>(PROOFS_KEY))?.id ?? null;
}

/** Creates (or re-finds) the public directory form in the studio account. */
export async function setupStudio(): Promise<{ formId: string; url: string }> {
  const formId = await withVakh(STUDIO, (call) => ensureForm(call, PROOFS_KEY, PROOFS_FORM, { syncLayout: true }));
  return { formId, url: vakhFormUrl(formId) };
}

const TIER_LABEL: Record<Tier, string> = { basic: "Basic", medium: "Medium", top: "Top" };

/** Plain-language summary built only from stored evidence fields (no LLM, nothing invented). */
function summarise(ev: Evidence | null, tier: Tier, score: number): string {
  if (!ev) return `${TIER_LABEL[tier]} tier, ${score}/100.`;
  const parts = [`${TIER_LABEL[tier]} ${ev.language} (${score}/100), scored with rubric ${ev.rubricVersion}.`];
  if (ev.mergedExternalPrs.length) parts.push(`${ev.mergedExternalPrs.length} merged pull request(s) to other people's repositories.`);
  const repos = ev.topRepos.slice(0, 3).map((r) => r.fullName);
  if (repos.length) parts.push(`Top repositories: ${repos.join(", ")}.`);
  if (ev.substance.strengths.length) parts.push(`Strengths: ${ev.substance.strengths.slice(0, 2).join("; ")}.`);
  return parts.join(" ").slice(0, 1500);
}

/**
 * Publishes one minted analysis to the public directory. Idempotent: skips when already
 * published. Only for developers who opted in to discovery. Never throws to the caller.
 */
export async function publishProof(analysisId: string): Promise<{ status: "published" | "skipped"; postId?: string; reason?: string }> {
  try {
    const db = await getDb();
    const [row] = await db
      .select({ a: schema.analyses, u: schema.users })
      .from(schema.analyses)
      .innerJoin(schema.users, eq(schema.users.id, schema.analyses.userId))
      .where(eq(schema.analyses.id, analysisId))
      .limit(1);
    if (!row) return { status: "skipped", reason: "not found" };
    const { a, u } = row;
    if (!a.tokenId || a.revokedAt) return { status: "skipped", reason: "not minted or revoked" };
    if (!u.consentSearchable) return { status: "skipped", reason: "no discovery consent" };
    if (a.vakhPostId) return { status: "skipped", reason: "already published", postId: a.vakhPostId };

    const ev = (a.evidenceJson as Partial<Evidence>)?.kind === "karmachain.evidence" ? (a.evidenceJson as Evidence) : null;
    const fields = {
      developer: u.name ? `${u.name} (@${u.githubHandle})` : `@${u.githubHandle}`,
      skill: ev?.language ?? a.skill,
      tier: [TIER_OPTION[a.tier]],
      score: a.score,
      summary: summarise(ev, a.tier, a.score),
      profile: [web(`/u/${u.githubHandle}`)],
      evidence: [web(`/evidence/${a.evidenceHash}`)],
      token: [a.mintTx ? `${BASESCAN}/tx/${a.mintTx}` : web(`/u/${u.githubHandle}`)],
      verified_on: { start: new Date(a.createdAt).toISOString(), precision: "day" },
    };

    const postId = await withVakh(STUDIO, async (call) => {
      // Re-check inside the retried unit so a retry never double-posts.
      const [fresh] = await db.select({ p: schema.analyses.vakhPostId }).from(schema.analyses).where(eq(schema.analyses.id, a.id)).limit(1);
      if (fresh?.p) return fresh.p;
      const formId = await ensureForm(call, PROOFS_KEY, PROOFS_FORM);
      const post = PostRef.parse(unwrapPost(await call("create_post", { form_id: formId, fields })));
      await db.update(schema.analyses).set({ vakhPostId: post.id }).where(eq(schema.analyses.id, a.id));
      return post.id;
    });
    log.info("vakh proof published", { analysisId, postId });
    return { status: "published", postId };
  } catch (err) {
    if (err instanceof VakhNotConnectedError) return { status: "skipped", reason: "studio not connected" };
    log.warn("vakh publish failed", { analysisId, err });
    return { status: "skipped", reason: err instanceof Error ? err.message : "failed" };
  }
}

/** Archives the directory post for a revoked token. Reversible in Vakh. Never throws. */
export async function archiveProofsForToken(tokenId: string): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db
      .select({ id: schema.analyses.id, postId: schema.analyses.vakhPostId })
      .from(schema.analyses)
      .where(and(eq(schema.analyses.tokenId, tokenId), isNotNull(schema.analyses.vakhPostId)));
    if (!rows.length) return;
    await withVakh(STUDIO, async (call) => {
      for (const r of rows) {
        try {
          await call("archive_post", { id: r.postId });
        } catch (err) {
          if (!(err instanceof VakhToolError)) throw err; // already archived or gone
        }
      }
    });
    log.info("vakh proofs archived", { tokenId, count: rows.length });
  } catch (err) {
    log.warn("vakh archive failed", { tokenId, err });
  }
}

/** Publishes every minted, non-revoked, consented proof that isn't on Vakh yet. */
export async function backfillProofs(limit = 50): Promise<{ published: number; skipped: number }> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.analyses.id })
    .from(schema.analyses)
    .innerJoin(schema.users, eq(schema.users.id, schema.analyses.userId))
    .where(
      and(
        isNotNull(schema.analyses.tokenId),
        isNull(schema.analyses.revokedAt),
        isNull(schema.analyses.vakhPostId),
        eq(schema.users.consentSearchable, true),
      ),
    )
    .limit(limit);
  let published = 0;
  for (const r of rows) {
    const out = await publishProof(r.id);
    if (out.status === "published") published++;
  }
  return { published, skipped: rows.length - published };
}

export interface ShortlistExport {
  formId: string;
  url: string;
  created: number;
  linkedProofs: number;
}

/**
 * Writes a shortlist into the recruiter's own Vakh "KarmaChain Pipeline" board, linking each
 * candidate to their public proof posts. Re-exporting the same job skips candidates already there.
 */
export async function exportShortlist(recruiterKey: string, jobId: string, role: string, matches: MatchCandidate[]): Promise<ShortlistExport> {
  const account: VakhAccount = { kind: "recruiter", recruiterKey };
  const db = await getDb();
  const studioForm = await proofsFormId();

  // Proof posts for these candidates, from the public directory.
  const handles = matches.map((m) => m.handle);
  const proofRows = handles.length
    ? await db
        .select({ handle: schema.users.githubHandle, postId: schema.analyses.vakhPostId })
        .from(schema.analyses)
        .innerJoin(schema.users, eq(schema.users.id, schema.analyses.userId))
        .where(and(inArray(schema.users.githubHandle, handles), isNotNull(schema.analyses.vakhPostId), isNull(schema.analyses.revokedAt)))
    : [];
  const proofsByHandle = new Map<string, string[]>();
  for (const r of proofRows) if (r.postId) proofsByHandle.set(r.handle, [...(proofsByHandle.get(r.handle) ?? []), r.postId]);

  return withVakh(account, async (call) => {
    const formId = await ensureForm(call, pipelineKey(recruiterKey), pipelineForm(studioForm));
    const jobRef = `${role} · ${jobId.slice(0, 8)}`;

    // Skip candidates this job already exported (re-runs and retries stay idempotent).
    const existing = new Set<string>();
    const q = (await call("query_view", { form_id: formId, view_id: "table", filter_override: { field_id: "job_ref", op: "eq", value: jobRef }, limit: 100 })) as { posts?: { fields?: { candidate?: unknown } }[] };
    for (const p of q.posts ?? []) if (typeof p.fields?.candidate === "string") existing.add(p.fields.candidate);

    let created = 0;
    let linkedProofs = 0;
    for (const m of matches) {
      const candidate = m.name ? `${m.name} (@${m.handle})` : `@${m.handle}`;
      if (existing.has(candidate)) continue;
      const proofIds = (proofsByHandle.get(m.handle) ?? []).slice(0, 5);
      const fields: Record<string, unknown> = {
        candidate,
        role,
        stage: [STAGE_OPTION.shortlisted],
        match: Math.round(m.score * 100),
        why: m.reasons.join(" ").slice(0, 1500) || "Matched on verified skills.",
        skills: m.skills.map((s) => `${s.language} ${TIER_LABEL[s.tier]}`).join(", ").slice(0, 200),
        profile: [web(`/u/${m.handle}`)],
        job_ref: jobRef,
      };
      if (studioForm && proofIds.length) fields.proof = proofIds.map((id) => ({ id, type: "reference" }));
      try {
        await call("create_post", { form_id: formId, fields });
        linkedProofs += fields.proof ? proofIds.length : 0;
      } catch (err) {
        // A proof the recruiter can't read (directory not public yet) shouldn't lose the candidate.
        if (!(err instanceof VakhToolError) || !fields.proof) throw err;
        delete fields.proof;
        await call("create_post", { form_id: formId, fields });
      }
      created++;
    }
    return { formId, url: vakhFormUrl(formId, "board"), created, linkedProofs };
  });
}

/**
 * Keeps the directory in line with a user's discovery consent: opting in publishes their
 * minted proofs, opting out (or deleting the account) archives them. Never throws.
 */
export async function syncUserProofs(userId: string, listed: boolean): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db
      .select({ id: schema.analyses.id, postId: schema.analyses.vakhPostId })
      .from(schema.analyses)
      .where(and(eq(schema.analyses.userId, userId), isNotNull(schema.analyses.tokenId), isNull(schema.analyses.revokedAt)));
    if (listed) {
      for (const r of rows) if (!r.postId) await publishProof(r.id);
      return;
    }
    const posted = rows.filter((r) => r.postId);
    if (!posted.length) return;
    await withVakh(STUDIO, async (call) => {
      for (const r of posted) {
        try {
          await call("archive_post", { id: r.postId });
        } catch (err) {
          if (!(err instanceof VakhToolError)) throw err;
        }
      }
    });
    await db.update(schema.analyses).set({ vakhPostId: null }).where(inArray(schema.analyses.id, posted.map((r) => r.id)));
  } catch (err) {
    if (!(err instanceof VakhNotConnectedError)) log.warn("vakh consent sync failed", { userId, err });
  }
}
