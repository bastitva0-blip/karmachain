import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { InterviewerStyleSchema, JobSpecSchema, type InterviewerStyle, type JobSpec } from "@karma/shared";
import { getDb, schema } from "../db/client";
import { llmConfigured } from "../llm/client";
import { badRequest, notFound, unavailable } from "../lib/errors";
import { log } from "../lib/logger";
import { rateLimit } from "../lib/ratelimit";
import { body } from "../lib/validate";
import { chatUserMessages, intakeTurn, MAX_TURNS, resetChat, summariseStyle } from "../recruiter/intake";
import { findMatches } from "../recruiter/match";
import type { AppEnv } from "../types";

export const recruiter = new Hono<AppEnv>();

const ChatId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

/** Anonymous recruiter identity: a random key the browser keeps in localStorage. */
export const recruiterKeyOf = (c: { req: { header: (n: string) => string | undefined } }) => {
  const k = c.req.header("x-recruiter-key");
  return k && /^[A-Za-z0-9_-]{16,64}$/.test(k) ? k : null;
};

export async function saveJobSpec(
  chatId: string,
  spec: JobSpec,
  style: InterviewerStyle | null,
  recruiterKey: string | null = null,
) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.jobSpecs)
    .values({ sessionId: chatId, specJson: spec, styleJson: style, recruiterKey })
    .returning();
  return row!;
}

export async function loadJobSpec(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.jobSpecs).where(eq(schema.jobSpecs.id, id)).limit(1);
  if (!row) throw notFound("Job spec not found");
  return {
    ...row,
    spec: JobSpecSchema.parse(row.specJson),
    style: row.styleJson ? InterviewerStyleSchema.parse(row.styleJson) : null,
  };
}

/** Streams one intake turn as SSE: `token` events, then optionally a `spec` event. */
recruiter.post("/recruiter/chat", rateLimit("llm-chat", 30, 5 * 60_000), async (c) => {
  if (!llmConfigured()) throw unavailable("llm_not_configured", "The AI assistant is offline. Use the manual form.");
  const { chatId, message } = await body(c, z.object({ chatId: ChatId, message: z.string().trim().min(1).max(2000) }));
  if (chatUserMessages(chatId).length >= MAX_TURNS) throw badRequest("This chat is long enough. Start a new one.");

  const rkey = recruiterKeyOf(c);
  return streamSSE(c, async (stream) => {
    try {
      for await (const ev of intakeTurn(chatId, message)) {
        if (ev.type === "token") await stream.writeSSE({ event: "token", data: JSON.stringify({ text: ev.text }) });
        if (ev.type === "spec") {
          const style = await summariseStyle(chatUserMessages(chatId));
          const row = await saveJobSpec(chatId, ev.spec, style, rkey);
          await stream.writeSSE({
            event: "spec",
            data: JSON.stringify({ jobSpecId: row.id, spec: ev.spec, style }),
          });
        }
      }
    } catch (err) {
      log.error("intake failed", { err });
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: "The assistant is having trouble. Retry, or fill the form manually." }),
      });
    }
    await stream.writeSSE({ event: "done", data: "{}" });
  });
});

recruiter.post("/recruiter/chat/reset", async (c) => {
  const { chatId } = await body(c, z.object({ chatId: ChatId }));
  resetChat(chatId);
  return c.json({ ok: true });
});

/** Manual path (and edits from the settings panel): create a job spec directly. */
recruiter.post("/recruiter/jobs", rateLimit("jobs", 30, 5 * 60_000), async (c) => {
  const input = await body(
    c,
    z.object({ chatId: ChatId, spec: JobSpecSchema, style: InterviewerStyleSchema.nullable().optional() }),
  );
  const row = await saveJobSpec(input.chatId, input.spec, input.style ?? null, recruiterKeyOf(c));
  return c.json({ jobSpecId: row.id, spec: input.spec, style: input.style ?? null });
});

recruiter.get("/recruiter/jobs/:id", async (c) => {
  const j = await loadJobSpec(c.req.param("id"));
  return c.json({ jobSpecId: j.id, spec: j.spec, style: j.style });
});

recruiter.get("/recruiter/jobs/:id/matches", rateLimit("matches", 30, 5 * 60_000), async (c) => {
  const j = await loadJobSpec(c.req.param("id"));
  return c.json({ jobSpecId: j.id, matches: await findMatches(j.spec) });
});

/** The interviews this browser's recruiter key created. */
recruiter.get("/recruiter/interviews", rateLimit("rec-interviews", 60, 60_000), async (c) => {
  const key = recruiterKeyOf(c);
  if (!key) return c.json({ items: [] });
  const db = await getDb();
  const rows = await db
    .select({ iv: schema.interviews, job: schema.jobSpecs, user: schema.users })
    .from(schema.interviews)
    .innerJoin(schema.jobSpecs, eq(schema.jobSpecs.id, schema.interviews.jobSpecId))
    .innerJoin(schema.users, eq(schema.users.id, schema.interviews.candidateUserId))
    .where(eq(schema.jobSpecs.recruiterKey, key))
    .orderBy(desc(schema.interviews.createdAt))
    .limit(200);
  return c.json({
    items: rows.map(({ iv, job, user }) => {
      const report = iv.reportJson as { overall?: number | null } | null;
      const plan = iv.planJson as { roleTitle?: string };
      return {
        id: iv.id,
        candidate: { handle: user.githubHandle, name: user.name, avatarUrl: user.avatarUrl, isDemo: user.isDemo },
        role: plan.roleTitle ?? (job.specJson as { title?: string }).title ?? "Role",
        status: iv.status,
        mode: iv.mode,
        overall: report?.overall ?? null,
        anchored: !!iv.attestationUid,
        canReprocess: !!iv.conversationId,
        error: iv.error,
        createdAt: iv.createdAt,
      };
    }),
  });
});
