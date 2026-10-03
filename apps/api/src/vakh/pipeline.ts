import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import type { InterviewReport } from "@karma/shared";
import { getDb, schema } from "../db/client";
import { env } from "../env";
import { HttpError } from "../lib/errors";
import { log } from "../lib/logger";
import { createInterview } from "../routes/interviews";
import { withVakh, type CallTool } from "./client";
import { STAGE_OPTION } from "./forms";
import { VakhNotConnectedError } from "./oauth";
import { pipelineKey } from "./publish";
import { kvGet, kvSet } from "./store";

/**
 * Reads a recruiter's Vakh pipeline board back into KarmaChain. Vakh is the source of truth for
 * stages: a card moved to Interviewing gets an AI interview, and finished interviews write their
 * report link and score back onto the card. The hiring decision itself is never automated.
 */

const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STAGE_OPTION).map(([k, id]) => [id, k[0]!.toUpperCase() + k.slice(1)]),
);

const Post = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()).default({}),
});
const Page = z.object({ posts: z.array(Post).default([]), next_cursor: z.string().nullish(), has_more: z.boolean().optional() });

export interface PipelineItem {
  postId: string;
  candidate: string;
  role: string;
  stage: string;
  interviewUrl: string | null;
  reportUrl: string | null;
  status: string | null;
}

export interface PipelineSync {
  formId: string;
  items: PipelineItem[];
  interviewsCreated: number;
  reportsWritten: number;
}

const web = (path: string) => `${env.WEB_ORIGIN.replace(/\/$/, "")}${path}`;
const firstString = (v: unknown): string | null =>
  typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
const handleOf = (candidate: string) => /@([A-Za-z0-9-]{1,39})\)?\s*$/.exec(candidate)?.[1] ?? null;
const interviewKey = (postId: string) => `pipeline-interview:${postId}`;

async function readBoard(call: CallTool, formId: string) {
  const posts: z.infer<typeof Post>[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const res = Page.parse(await call("query_view", { form_id: formId, view_id: "table", limit: 100, ...(cursor ? { cursor } : {}) }));
    posts.push(...res.posts);
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return posts;
}

/** Finds the job a card came from: `job_ref` is "<title> · <first 8 chars of job id>". */
async function jobIdFor(recruiterKey: string, jobRef: string | null): Promise<string | null> {
  const prefix = jobRef?.split(" · ").pop();
  if (!prefix || !/^[0-9a-f-]{8}$/i.test(prefix)) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: schema.jobSpecs.id })
    .from(schema.jobSpecs)
    .where(and(eq(schema.jobSpecs.recruiterKey, recruiterKey), like(schema.jobSpecs.id, `${prefix}%`)))
    .limit(2);
  return rows.length === 1 ? rows[0]!.id : null;
}

export async function syncPipeline(recruiterKey: string): Promise<PipelineSync | null> {
  const form = await kvGet<{ id: string }>(pipelineKey(recruiterKey));
  if (!form) return null;
  const db = await getDb();

  return withVakh({ kind: "recruiter", recruiterKey }, async (call) => {
    const posts = await readBoard(call, form.id);
    let interviewsCreated = 0;
    let reportsWritten = 0;
    const items: PipelineItem[] = [];

    for (const p of posts) {
      const f = p.fields;
      const candidate = typeof f.candidate === "string" ? f.candidate : "";
      const stageId = firstString(f.stage) ?? "";
      const item: PipelineItem = {
        postId: p.id,
        candidate,
        role: typeof f.role === "string" ? f.role : "",
        stage: STAGE_LABEL[stageId] ?? "Unknown",
        interviewUrl: firstString(f.interview),
        reportUrl: firstString(f.report),
        status: typeof f.karma_status === "string" ? f.karma_status : null,
      };
      items.push(item);

      // Re-check our own record each run so retries never create a second interview.
      let interviewId = (await kvGet<{ id: string }>(interviewKey(p.id)))?.id ?? null;

      if (!interviewId && stageId === STAGE_OPTION.interviewing) {
        const handle = handleOf(candidate);
        const jobId = await jobIdFor(recruiterKey, typeof f.job_ref === "string" ? f.job_ref : null);
        let status: string;
        if (!handle || !jobId) {
          status = "Couldn't match this card to a KarmaChain job. Re-send the shortlist from KarmaChain.";
        } else {
          try {
            interviewId = await createInterview(jobId, handle, true);
            await kvSet(interviewKey(p.id), { id: interviewId });
            interviewsCreated++;
            status = "AI interview ready. Send the link to the candidate.";
          } catch (err) {
            if (!(err instanceof HttpError)) throw err;
            status = `No interview created: ${err.message}`;
          }
        }
        const fields: Record<string, unknown> = { karma_status: status };
        if (interviewId) fields.interview = [web(`/interview/${interviewId}`)];
        if (status !== item.status) await call("update_post", { id: p.id, fields });
        item.status = status;
        item.interviewUrl = interviewId ? web(`/interview/${interviewId}`) : item.interviewUrl;
        continue;
      }

      if (interviewId && !item.reportUrl) {
        const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, interviewId)).limit(1);
        if (iv?.status === "done") {
          const overall = (iv.reportJson as InterviewReport | null)?.overall ?? null;
          const status = overall === null ? "Interview finished. Report ready." : `Interview finished. Overall ${overall}/5. Report ready.`;
          const reportUrl = web(`/interview/${interviewId}/report`);
          await call("update_post", { id: p.id, fields: { report: [reportUrl], karma_status: status } });
          item.reportUrl = reportUrl;
          item.status = status;
          reportsWritten++;
        } else if (iv?.status === "failed" && item.status !== "Interview failed to process. Open it in KarmaChain to retry.") {
          item.status = "Interview failed to process. Open it in KarmaChain to retry.";
          await call("update_post", { id: p.id, fields: { karma_status: item.status } });
        }
      }
    }
    if (interviewsCreated || reportsWritten) log.info("vakh pipeline synced", { formId: form.id, interviewsCreated, reportsWritten });
    return { formId: form.id, items, interviewsCreated, reportsWritten };
  });
}

/** Background pass over every connected recruiter board. Never throws. */
export async function syncAllPipelines(): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db.select({ key: schema.vakhKv.key }).from(schema.vakhKv).where(like(schema.vakhKv.key, "form:pipeline:%"));
    for (const r of rows) {
      const recruiterKey = r.key.slice("form:pipeline:".length);
      try {
        await syncPipeline(recruiterKey);
      } catch (err) {
        if (!(err instanceof VakhNotConnectedError)) log.warn("vakh pipeline sync failed", { err });
      }
    }
  } catch (err) {
    log.warn("vakh pipeline sweep failed", { err });
  }
}

let timer: NodeJS.Timeout | null = null;
export function startPipelineSync(): void {
  if (timer || env.VAKH_SYNC_INTERVAL_SEC === 0) return;
  let running = false;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void syncAllPipelines().finally(() => (running = false));
  }, env.VAKH_SYNC_INTERVAL_SEC * 1000);
  timer.unref();
}
