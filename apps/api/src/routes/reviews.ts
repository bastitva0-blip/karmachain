import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq, gt } from "drizzle-orm";
import { getAddress, isAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import { z } from "zod";
import { env } from "../env";
import { getDb, schema } from "../db/client";
import { encodeClientReview, prepareDelegated, serializeTyped, submitDelegated } from "../chain/eas";
import { invalidateReader, walletTxCount } from "../chain/reader";
import { chatJson, llmConfigured } from "../llm/client";
import { dataBlock } from "../llm/json";
import { TESTIMONIAL_SYSTEM } from "../llm/prompts";
import { badRequest, conflict, HttpError, notFound, unavailable } from "../lib/errors";
import { log } from "../lib/logger";
import { rateLimit } from "../lib/ratelimit";
import { body } from "../lib/validate";
import { findUserByHandleOrAddress } from "../profile";
import { ElevenQuotaError, elevenConfigured, speechToText } from "../voice/elevenlabs";
import type { AppEnv, User } from "../types";

export const reviews = new Hono<AppEnv>();

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // ~60 s of opus/webm is well under 1 MB
const REVIEW_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** Speech-to-text via ElevenLabs Scribe. Audio is not stored. */
reviews.post(
  "/voice/scribe",
  rateLimit("scribe", 6, 10 * 60_000),
  bodyLimit({ maxSize: MAX_AUDIO_BYTES, onError: (c) => c.json({ error: { code: "too_large", message: "Recording too long" } }, 413) }),
  async (c) => {
  if (!elevenConfigured()) throw unavailable("stt_unavailable", "Voice transcription is offline. Type your review instead.");
  const len = Number(c.req.header("content-length") ?? 0);
  if (len > MAX_AUDIO_BYTES) throw new HttpError(413, "too_large", "Recording too long (max about 60 seconds)");
  const form = await c.req.formData();
  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) throw badRequest("Missing audio");
  if (file.size > MAX_AUDIO_BYTES) throw new HttpError(413, "too_large", "Recording too long (max about 60 seconds)");
  if (!/^audio\//.test(file.type)) throw badRequest("Unsupported audio type");
  try {
    const ext = /mpeg|mp3/.test(file.type) ? "mp3" : /wav/.test(file.type) ? "wav" : /ogg/.test(file.type) ? "ogg" : /mp4|m4a|aac/.test(file.type) ? "m4a" : "webm";
    const transcript = await speechToText(file, `review.${ext}`);
    return c.json({ transcript: transcript.slice(0, 4000) });
  } catch (err) {
    if (err instanceof ElevenQuotaError) throw unavailable("stt_quota", "Voice quota reached. Type your review instead.");
    throw err;
  }
});

export const StructuredReview = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  skillTag: z.string().trim().min(1).max(40),
  summary: z.string().trim().min(1).max(280),
  sentiment: z.enum(["positive", "mixed", "negative"]).catch("mixed"),
  rating_inferred: z.boolean().catch(false),
});

reviews.post("/reviews/structure", rateLimit("review-structure", 10, 10 * 60_000), async (c) => {
  const { transcript } = await body(c, z.object({ transcript: z.string().trim().min(5).max(4000) }));
  if (!llmConfigured()) {
    return c.json({ rating: 5, skillTag: "", summary: transcript.slice(0, 280), sentiment: "mixed", rating_inferred: true, source: "template" });
  }
  try {
    const r = await chatJson(
      StructuredReview,
      [
        { role: "system", content: TESTIMONIAL_SYSTEM },
        { role: "user", content: dataBlock("transcript", transcript) },
      ],
      { maxTokens: 300 },
    );
    return c.json({ ...r, source: "llm" });
  } catch (err) {
    log.warn("review structuring failed", { err });
    return c.json({ rating: 5, skillTag: "", summary: transcript.slice(0, 280), sentiment: "mixed", rating_inferred: true, source: "template" });
  }
});

const ReviewInput = z.object({
  handle: z.string().min(1).max(64),
  clientAddress: z.string().refine(isAddress, "Invalid address"),
  rating: z.number().int().min(1).max(5),
  skillTag: z.string().trim().min(1).max(40),
  summary: z.string().trim().min(1).max(280),
  transcript: z.string().trim().min(1).max(4000),
  confirmed: z.literal(true),
});

async function checkReview(input: z.infer<typeof ReviewInput>, viewer: User | null) {
  const dev = await findUserByHandleOrAddress(input.handle);
  if (!dev) throw notFound("Developer not found");
  if (!dev.walletAddress) throw badRequest("This developer has not linked a wallet yet");
  const client = getAddress(input.clientAddress);
  const devWallet = getAddress(dev.walletAddress);
  if (client === devWallet || viewer?.id === dev.id) throw badRequest("You can't review yourself");

  const db = await getDb();
  const [recent] = await db
    .select({ id: schema.testimonials.id })
    .from(schema.testimonials)
    .where(
      and(
        eq(schema.testimonials.devUserId, dev.id),
        eq(schema.testimonials.clientAddress, client.toLowerCase()),
        gt(schema.testimonials.createdAt, new Date(Date.now() - REVIEW_COOLDOWN_MS)),
      ),
    )
    .limit(1);
  if (recent) throw conflict("You already reviewed this developer in the last 30 days");

  const transcriptHash = keccak256(toBytes(input.transcript));
  const data = encodeClientReview({
    developer: devWallet,
    rating: input.rating,
    skillTag: input.skillTag,
    summary: input.summary,
    transcriptHash,
  });
  return { dev, client, devWallet, data };
}

/** Returns EIP-712 typed data for the client to sign. Nothing is attested without their signature. */
reviews.post("/reviews/prepare", rateLimit("review-prepare", 10, 10 * 60_000), async (c) => {
  const input = await body(c, ReviewInput);
  const { client, devWallet, data } = await checkReview(input, c.get("user"));
  const typed = await prepareDelegated("clientReview", client, devWallet, data);
  return c.json({ typedData: serializeTyped(typed) });
});

reviews.post("/reviews/submit", rateLimit("review-submit", 5, 10 * 60_000), async (c) => {
  const input = await body(
    c,
    ReviewInput.extend({
      signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
      deadline: z.string().regex(/^\d{1,12}$/),
    }),
  );
  const { dev, client, devWallet, data } = await checkReview(input, c.get("user"));
  // EAS verifies the signature against `client`; a signature over different data reverts in simulation.
  const { uid, txHash } = await submitDelegated("clientReview", client as Address, devWallet, data, BigInt(input.deadline), input.signature as Hex);
  const db = await getDb();
  await db.insert(schema.testimonials).values({
    devUserId: dev.id,
    clientAddress: client.toLowerCase(),
    audioTranscript: input.transcript,
    structuredJson: { rating: input.rating, skillTag: input.skillTag, summary: input.summary },
    attestationUid: uid,
  });
  invalidateReader(devWallet);
  void flagReviewBurst(dev.id).catch(() => undefined);
  return c.json({ uid, txHash, url: `https://base-sepolia.easscan.org/attestation/view/${uid}`, network: env.RPC_URL.includes("sepolia") ? "base-sepolia" : "custom" });
});

/** System flag: 3+ reviews from wallets with no on-chain history within an hour. */
async function flagReviewBurst(devUserId: string) {
  const db = await getDb();
  const recent = await db
    .select()
    .from(schema.testimonials)
    .where(and(eq(schema.testimonials.devUserId, devUserId), gt(schema.testimonials.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  let fresh = 0;
  for (const t of recent) if ((await walletTxCount(getAddress(t.clientAddress))) === 0) fresh++;
  if (fresh < 3) return;
  const [open] = await db
    .select({ id: schema.flags.id })
    .from(schema.flags)
    .where(and(eq(schema.flags.userId, devUserId), eq(schema.flags.status, "open"), eq(schema.flags.source, "system")))
    .limit(1);
  if (open) return;
  await db.insert(schema.flags).values({
    userId: devUserId,
    signal: fresh + " reviews from fresh wallets in 1 hour",
    source: "system",
    details: ["Reviewer wallets have no prior on-chain transactions"],
  });
}
