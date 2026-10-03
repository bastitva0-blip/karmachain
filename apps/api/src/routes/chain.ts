import { Hono } from "hono";
import { and, eq, isNotNull } from "drizzle-orm";
import type { InterviewReport } from "@karma/shared";
import { getDb, schema } from "../db/client";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { mintAnalysis } from "../chain/mint";
import { RelayerLowBalanceError } from "../chain/sbt";
import { HttpError, notFound } from "../lib/errors";
import { rateLimit } from "../lib/ratelimit";
import { body } from "../lib/validate";
import { buildProfile, findUserByHandleOrAddress } from "../profile";
import type { AppEnv } from "../types";

export const chain = new Hono<AppEnv>();

chain.post("/mint", rateLimit("mint", 6, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const { analysisId } = await body(c, z.object({ analysisId: z.string().min(1).max(64) }));
  try {
    return c.json(await mintAnalysis(user, analysisId));
  } catch (err) {
    if (err instanceof RelayerLowBalanceError) throw new HttpError(503, "relayer_low_balance", err.message);
    throw err;
  }
});

/**
 * Soft-skill evidence (never a score): quotes from interviews the candidate chose to anchor
 * publicly, plus signed client review summaries.
 */
chain.get("/profile/:handle/communication", rateLimit("profile", 120, 60_000), async (c) => {
  const user = await findUserByHandleOrAddress(c.req.param("handle"));
  if (!user) throw notFound("Profile not found");
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.candidateUserId, user.id), isNotNull(schema.interviews.attestationUid)));
  const cards: { source: string; quote: string; t: number | null; observation: string; url: string | null }[] = [];
  for (const r of rows) {
    const rep = r.reportJson as InterviewReport | null;
    const crit = rep?.scores.communication_clarity;
    for (const q of crit?.quotes ?? []) {
      cards.push({
        source: `Interview: ${(r.planJson as { roleTitle?: string }).roleTitle ?? "role"}`,
        quote: q.text,
        t: q.t,
        observation: crit?.note ?? "",
        url: `https://base-sepolia.easscan.org/attestation/view/${r.attestationUid}`,
      });
    }
  }
  const reviewRows = await db.select().from(schema.testimonials).where(eq(schema.testimonials.devUserId, user.id));
  for (const t of reviewRows) {
    const s = t.structuredJson as { summary?: string; skillTag?: string };
    if (s.summary)
      cards.push({
        source: `Client review (${s.skillTag ?? "general"})`,
        quote: s.summary,
        t: null,
        observation: "Signed by the client's wallet.",
        url: t.attestationUid ? `https://base-sepolia.easscan.org/attestation/view/${t.attestationUid}` : null,
      });
  }
  return c.json({
    cards: cards.slice(0, 12),
    note: "Evidence only, never a score. AI analysis of speech can be biased by accent, fluency and audio quality; read the quotes, not the labels.",
  });
});

chain.get("/profile/:handle", rateLimit("profile", 120, 60_000), async (c) => {
  const handle = c.req.param("handle");
  if (!/^[A-Za-z0-9-]{1,39}$|^0x[0-9a-fA-F]{40}$/.test(handle)) throw notFound("Profile not found");
  const user = await findUserByHandleOrAddress(handle);
  if (!user) throw notFound("Profile not found");
  return c.json(await buildProfile(user));
});
