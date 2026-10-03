import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getAddress, type Hex } from "viem";
import { z } from "zod";
import { MAX_INTERVIEW_MINUTES, type InterviewReport, type TranscriptTurn } from "@karma/shared";
import { env } from "../env";
import { getDb, schema } from "../db/client";
import { requireUser } from "../auth/session";
import { encodeInterviewResult, prepareDelegated, serializeTyped, submitDelegated } from "../chain/eas";
import { badRequest, conflict, notFound } from "../lib/errors";
import { log } from "../lib/logger";
import { rateLimit } from "../lib/ratelimit";
import { body } from "../lib/validate";
import { findUserByHandleOrAddress } from "../profile";
import { invalidateReader } from "../chain/reader";
import { loadJobSpec } from "./recruiter";
import { ElevenQuotaError, elevenConfigured, getSignedUrl } from "../voice/elevenlabs";
import { finishWithTranscript, processVoiceInterview } from "../voice/evaluate";
import { assertCandidate, buildPlan, dynamicVariables, fallbackTurn, loadInterview, type Plan } from "../voice/interview";
import type { AppEnv } from "../types";

export const interviews = new Hono<AppEnv>();

const publicInterview = (row: Awaited<ReturnType<typeof loadInterview>>, candidateHandle: string) => {
  const plan = row.planJson as Plan;
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    candidateHandle,
    roleTitle: plan.roleTitle,
    maxMinutes: plan.maxMinutes,
    maxSeconds: Math.min(env.INTERVIEW_MAX_SECONDS, plan.maxMinutes * 60),
    questions: plan.questions.map((q) => ({ track: q.track, text: q.text })),
    tone: plan.tone,
    transcript: (row.transcriptJson as TranscriptTurn[] | null) ?? null,
    report: (row.reportJson as InterviewReport | null) ?? null,
    reportHash: row.reportHash,
    attestationUid: row.attestationUid,
    error: row.error,
    createdAt: row.createdAt,
  };
};

async function handleOf(userId: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return u!;
}

/** Creates an interview for a consenting candidate (also used by the Vakh pipeline sync). */
export async function createInterview(jobSpecId: string, candidateHandle: string, useStyle: boolean): Promise<string> {
  const job = await loadJobSpec(jobSpecId);
  const candidate = await findUserByHandleOrAddress(candidateHandle);
  if (!candidate) throw notFound("Candidate not found");
  if (!candidate.consentSearchable) throw badRequest("This candidate has not opted in to recruiter contact");
  const plan = await buildPlan(
    { ...job.spec, interview: { ...job.spec.interview, durationMinutes: Math.min(job.spec.interview.durationMinutes, MAX_INTERVIEW_MINUTES) } },
    useStyle ? job.style : null,
    candidate,
  );
  const db = await getDb();
  const [row] = await db
    .insert(schema.interviews)
    .values({ jobSpecId: job.id, candidateUserId: candidate.id, planJson: plan, status: "created" })
    .returning();
  return row!.id;
}

interviews.post("/interviews", rateLimit("interviews", 10, 10 * 60_000), async (c) => {
  const input = await body(
    c,
    z.object({ jobSpecId: z.string().min(1).max(64), candidateHandle: z.string().min(1).max(64), useStyle: z.boolean().default(true) }),
  );
  return c.json({ id: await createInterview(input.jobSpecId, input.candidateHandle, input.useStyle) }, 201);
});

interviews.get("/interviews/:id", async (c) => {
  const row = await loadInterview(c.req.param("id"));
  const cand = await handleOf(row.candidateUserId);
  return c.json(publicInterview(row, cand.githubHandle));
});

/**
 * Signed URL for the private ElevenLabs agent + dynamic variables.
 * `fallback: true` tells the client to use the text interview instead.
 */
interviews.get("/interviews/:id/session", rateLimit("voice-session", 10, 10 * 60_000), async (c) => {
  const row = await loadInterview(c.req.param("id"));
  if (row.status === "done") throw conflict("This interview is already finished");
  const plan = row.planJson as Plan;
  const vars = dynamicVariables(plan);
  const forceFallback = c.req.query("fallback") === "1";
  if (forceFallback || !elevenConfigured() || !env.ELEVENLABS_INTERVIEW_AGENT_ID) {
    return c.json({ fallback: true, reason: forceFallback ? "requested" : "not_configured", dynamicVariables: vars });
  }
  try {
    const signedUrl = await getSignedUrl(env.ELEVENLABS_INTERVIEW_AGENT_ID);
    return c.json({ fallback: false, signedUrl, dynamicVariables: vars });
  } catch (err) {
    log.warn("signed url failed, switching to fallback", { err });
    return c.json({ fallback: true, reason: err instanceof ElevenQuotaError ? "quota" : "unavailable", dynamicVariables: vars });
  }
});

interviews.post("/interviews/:id/started", async (c) => {
  const { conversationId } = await body(c, z.object({ conversationId: z.string().min(4).max(128).optional() }));
  const db = await getDb();
  await db
    .update(schema.interviews)
    .set({ status: "live", conversationId: conversationId ?? null, mode: conversationId ? "voice" : "text" })
    .where(eq(schema.interviews.id, c.req.param("id")));
  return c.json({ ok: true });
});

/** Voice call ended: kick off transcript polling + evaluation in the background. */
interviews.post("/interviews/:id/ended", async (c) => {
  const { conversationId } = await body(c, z.object({ conversationId: z.string().min(4).max(128) }));
  const id = c.req.param("id");
  const row = await loadInterview(id);
  if (row.status === "done") return c.json({ ok: true });
  const db = await getDb();
  await db.update(schema.interviews).set({ status: "processing", conversationId, mode: "voice" }).where(eq(schema.interviews.id, id));
  void processVoiceInterview(id);
  return c.json({ ok: true });
});

interviews.post("/interviews/:id/reprocess", rateLimit("reprocess", 5, 5 * 60_000), async (c) => {
  const id = c.req.param("id");
  const row = await loadInterview(id);
  if (!row.conversationId) throw badRequest("No voice conversation to process");
  const db = await getDb();
  await db.update(schema.interviews).set({ status: "processing", error: null }).where(eq(schema.interviews.id, id));
  void processVoiceInterview(id);
  return c.json({ ok: true });
});

const TurnSchema = z.object({ role: z.enum(["agent", "user"]), message: z.string().max(4000), t: z.number().min(0).max(3600) });

/** Text fallback: next interviewer message. */
interviews.post("/interviews/:id/text-turn", rateLimit("text-turn", 60, 10 * 60_000), async (c) => {
  const { transcript } = await body(c, z.object({ transcript: z.array(TurnSchema).max(60) }));
  const row = await loadInterview(c.req.param("id"));
  if (row.status === "done") throw conflict("This interview is already finished");
  return c.json(await fallbackTurn(row.planJson as Plan, transcript));
});

/** Text fallback finished: evaluate synchronously. */
interviews.post("/interviews/:id/text-complete", rateLimit("text-complete", 5, 10 * 60_000), async (c) => {
  const { transcript } = await body(c, z.object({ transcript: z.array(TurnSchema).min(1).max(60) }));
  const id = c.req.param("id");
  const row = await loadInterview(id);
  if (row.status === "done") throw conflict("This interview is already finished");
  const db = await getDb();
  const [job] = await db.select().from(schema.jobSpecs).where(eq(schema.jobSpecs.id, row.jobSpecId)).limit(1);
  await db.update(schema.interviews).set({ status: "processing", mode: "text" }).where(eq(schema.interviews.id, id));
  // Evaluation can take a while on large models: run it in the background; the report page polls.
  void finishWithTranscript(id, transcript, job!.specJson, "text").catch(async (err: unknown) => {
    log.error("text interview evaluation failed", { interviewId: id, err });
    await db
      .update(schema.interviews)
      .set({ status: "failed", transcriptJson: transcript, error: "Evaluation failed. Retry in a minute." })
      .where(eq(schema.interviews.id, id));
  });
  return c.json({ ok: true }, 202);
});

// ---------------------------------------------------------------- candidate anchors the result on EAS

function anchorData(row: Awaited<ReturnType<typeof loadInterview>>, wallet: string) {
  const report = row.reportJson as InterviewReport | null;
  if (!report || !row.reportHash) throw badRequest("The report is not ready yet");
  return encodeInterviewResult({
    candidate: getAddress(wallet),
    reportHash: row.reportHash as Hex,
    overall: Math.round(report.overall ?? 0),
    role: (row.planJson as Plan).roleTitle.slice(0, 120),
  });
}

interviews.post("/interviews/:id/anchor/prepare", rateLimit("anchor", 10, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const row = await loadInterview(c.req.param("id"));
  assertCandidate(row, user);
  if (!user.walletAddress) throw badRequest("Link a wallet first");
  if (row.attestationUid) throw conflict("Already anchored");
  const wallet = getAddress(user.walletAddress);
  const typed = await prepareDelegated("interviewResult", wallet, wallet, anchorData(row, wallet));
  return c.json({ typedData: serializeTyped(typed) });
});

interviews.post("/interviews/:id/anchor", rateLimit("anchor", 10, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const { signature, deadline } = await body(
    c,
    z.object({ signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/), deadline: z.string().regex(/^\d{1,12}$/) }),
  );
  const id = c.req.param("id");
  const row = await loadInterview(id);
  assertCandidate(row, user);
  if (!user.walletAddress) throw badRequest("Link a wallet first");
  if (row.attestationUid) throw conflict("Already anchored");
  const wallet = getAddress(user.walletAddress);
  // The data is rebuilt server-side, so the client can only sign what we'd submit.
  const { uid, txHash } = await submitDelegated("interviewResult", wallet, wallet, anchorData(row, wallet), BigInt(deadline), signature as Hex);
  const db = await getDb();
  await db.update(schema.interviews).set({ attestationUid: uid }).where(eq(schema.interviews.id, id));
  invalidateReader(wallet);
  return c.json({ uid, txHash, url: `https://base-sepolia.easscan.org/attestation/view/${uid}` });
});
