import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  CRITERIA,
  JobSpecSchema,
  type Criterion,
  type InterviewReport,
  type ReportCriterion,
  type TranscriptTurn,
} from "@karma/shared";
import { getDb, schema } from "../db/client";
import { canonicalJson } from "../analysis/evidence";
import { chatJson, llmConfigured } from "../llm/client";
import { dataBlock } from "../llm/json";
import { EVALUATOR_SYSTEM } from "../llm/prompts";
import { log } from "../lib/logger";
import { sleep } from "../lib/retry";
import { keccak256, toBytes } from "viem";
import { getConversation, type ElevenConversation } from "./elevenlabs";

export const DISCLAIMER = "AI-assisted summary. A human must make the hiring decision.";

const QuoteSchema = z.object({ text: z.string().max(600), t: z.coerce.number().catch(0) });
const CriterionSchema = z.object({
  score: z.union([z.coerce.number().min(0).max(5), z.null()]).catch(null),
  quotes: z.array(QuoteSchema).max(5).catch([]),
  note: z.string().max(600).catch(""),
});
export const EvaluatorSchema = z.object({
  scores: z.object({
    technical_depth: CriterionSchema.catch({ score: null, quotes: [], note: "" }),
    problem_solving: CriterionSchema.catch({ score: null, quotes: [], note: "" }),
    communication_clarity: CriterionSchema.catch({ score: null, quotes: [], note: "" }),
    role_fit: CriterionSchema.catch({ score: null, quotes: [], note: "" }),
  }),
  strengths: z.array(z.string().max(300)).max(6).catch([]),
  concerns: z.array(z.string().max(300)).max(6).catch([]),
  follow_up_questions: z.array(z.string().max(300)).max(6).catch([]),
  summary: z.string().max(1500).catch(""),
});

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Post-check: every quote must be a verbatim (whitespace/punctuation-normalised) substring of a
 * candidate turn. Invalid quotes are dropped; a criterion left without quotes loses its score.
 */
export function enforceQuotes(
  raw: z.infer<typeof EvaluatorSchema>,
  transcript: TranscriptTurn[],
): { scores: Record<Criterion, ReportCriterion>; dropped: number } {
  const candidateTurns = transcript.filter((t) => t.role === "user");
  const haystack = candidateTurns.map((t) => ({ t: t.t, text: norm(t.message) }));
  let dropped = 0;
  const scores = {} as Record<Criterion, ReportCriterion>;
  for (const c of CRITERIA) {
    const crit = raw.scores[c];
    const kept = crit.quotes.filter((q) => {
      const n = norm(q.text);
      const hit = n.length >= 8 && haystack.find((h) => h.text.includes(n));
      if (!hit) {
        dropped++;
        return false;
      }
      q.t = hit.t; // trust the transcript timestamp, not the model's
      return true;
    });
    const hasScore = crit.score !== null && kept.length > 0;
    scores[c] = {
      score: hasScore ? Math.round(crit.score! * 2) / 2 : null,
      quotes: kept.slice(0, 3),
      note: hasScore ? crit.note : crit.score !== null ? "Score removed: no verifiable quote supported it." : crit.note,
    };
  }
  return { scores, dropped };
}

export function overall(scores: Record<Criterion, ReportCriterion>): number | null {
  const vals = CRITERIA.map((c) => scores[c].score).filter((s): s is number => s !== null);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}

export function transcriptText(t: TranscriptTurn[]): string {
  return t.map((x) => `[${x.t}s] ${x.role === "agent" ? "INTERVIEWER" : "CANDIDATE"}: ${x.message}`).join("\n");
}

export async function evaluateTranscript(
  transcript: TranscriptTurn[],
  specJson: unknown,
  mode: "voice" | "text",
): Promise<InterviewReport> {
  const spec = JobSpecSchema.parse(specJson);
  const empty = (): ReportCriterion => ({ score: null, quotes: [], note: "Not evaluated." });
  let report: InterviewReport = {
    scores: { technical_depth: empty(), problem_solving: empty(), communication_clarity: empty(), role_fit: empty() },
    strengths: [],
    concerns: [],
    follow_up_questions: [],
    summary: "Automatic evaluation is unavailable. Review the transcript directly.",
    overall: null,
    droppedQuotes: 0,
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
    mode,
  };
  const candidateWords = transcript.filter((t) => t.role === "user").reduce((a, t) => a + t.message.split(/\s+/).length, 0);
  if (candidateWords < 10) {
    return { ...report, summary: "The candidate said too little to evaluate. Consider rescheduling." };
  }
  if (!llmConfigured()) return report;

  try {
    const raw = await chatJson(
      EvaluatorSchema,
      [
        { role: "system", content: EVALUATOR_SYSTEM },
        {
          role: "user",
          content: `Job requirements: ${JSON.stringify({ title: spec.title, seniority: spec.seniority, mustHaveSkills: spec.mustHaveSkills, softSkills: spec.softSkills })}\n${dataBlock(
            "untrusted_transcript",
            transcriptText(transcript).slice(0, 40_000),
          )}`,
        },
      ],
      { maxTokens: 1800, timeoutMs: 90_000 },
    );
    const { scores, dropped } = enforceQuotes(raw, transcript);
    report = {
      ...report,
      scores,
      strengths: raw.strengths,
      concerns: raw.concerns,
      follow_up_questions: raw.follow_up_questions,
      summary: raw.summary || "No summary.",
      overall: overall(scores),
      droppedQuotes: dropped,
    };
  } catch (err) {
    log.warn("evaluation failed", { err });
  }
  return report;
}

export const reportHash = (r: InterviewReport) => keccak256(toBytes(canonicalJson(r)));

export function mapElevenTranscript(c: ElevenConversation): TranscriptTurn[] {
  return c.transcript
    .filter((t) => t.message && t.message.trim())
    .map((t) => ({ role: t.role, message: t.message!.trim(), t: t.time_in_call_secs ?? 0 }));
}

/** Poll ElevenLabs until the conversation is processed (max ~60 s), then evaluate. */
export async function processVoiceInterview(interviewId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, interviewId)).limit(1);
  if (!row?.conversationId) return;
  const [job] = await db.select().from(schema.jobSpecs).where(eq(schema.jobSpecs.id, row.jobSpecId)).limit(1);
  try {
    let conv: ElevenConversation | null = null;
    const deadline = Date.now() + 60_000;
    let delay = 2000;
    while (Date.now() < deadline) {
      conv = await getConversation(row.conversationId);
      if (conv.status === "done" || conv.status === "failed") break;
      await sleep(delay);
      delay = Math.min(8000, delay * 1.5);
    }
    if (!conv || conv.status === "failed") throw new Error(`conversation status ${conv?.status ?? "unknown"}`);
    const transcript = mapElevenTranscript(conv);
    await db.update(schema.interviews).set({ transcriptJson: transcript }).where(eq(schema.interviews.id, interviewId));
    await finishWithTranscript(interviewId, transcript, job!.specJson, "voice");
  } catch (err) {
    log.error("voice interview processing failed", { interviewId, err });
    await db
      .update(schema.interviews)
      .set({ status: "failed", error: "Could not fetch the transcript from ElevenLabs. Retry processing in a minute." })
      .where(eq(schema.interviews.id, interviewId));
  }
}

export async function finishWithTranscript(
  interviewId: string,
  transcript: TranscriptTurn[],
  specJson: unknown,
  mode: "voice" | "text",
) {
  const db = await getDb();
  const report = await evaluateTranscript(transcript, specJson, mode);
  await db
    .update(schema.interviews)
    .set({ transcriptJson: transcript, reportJson: report, reportHash: reportHash(report), status: "done", error: null })
    .where(eq(schema.interviews.id, interviewId));
  return report;
}
