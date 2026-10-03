import { Hono } from "hono";
import { z } from "zod";
import { env } from "../env";
import { safeEqual, sha256Hex } from "../lib/crypto";
import { HttpError, notFound, unauthorized } from "../lib/errors";
import { log } from "../lib/logger";
import { rateLimit } from "../lib/ratelimit";
import { body, parse } from "../lib/validate";
import { buildProfile, findUserByHandleOrAddress } from "../profile";
import { ElevenQuotaError, elevenConfigured, getSignedUrl, textToSpeech } from "../voice/elevenlabs";
import { getDeveloperTrust, normalizeHandle, profileBriefText } from "../voice/tools";
import type { AppEnv } from "../types";

export const voice = new Hono<AppEnv>();

const STOP = new Set(
  "is are was the a an this that developer dev legit check who what tell me about handle github profile can you trust they them safe hire to of for please on user is it their github.com com verified karma hey hi".split(
    " ",
  ),
);

/** "Is github.com/xyz legit?" / "check @xyz" / "what about xyz" → "xyz". */
export function handleFromQuestion(q: string): string | null {
  const explicit = /github\.com\/([A-Za-z0-9-]{1,39})/i.exec(q) ?? /@([A-Za-z0-9-]{1,39})/.exec(q);
  if (explicit) return normalizeHandle(explicit[1]!);
  const words = q.match(/[A-Za-z0-9][A-Za-z0-9-]{0,38}/g) ?? [];
  const cand = words.find((w) => !STOP.has(w.toLowerCase()));
  return cand ? normalizeHandle(cand) : null;
}

/**
 * ElevenLabs server tool webhook for the Karma Verify agent.
 * Authenticated with a shared secret header (constant-time compare).
 */
voice.post("/voice/tools/get-developer-trust", rateLimit("voice-tool", 60, 60_000), async (c) => {
  const secret = env.ELEVENLABS_TOOL_SECRET;
  const got = c.req.header("x-karma-tool-secret") ?? "";
  if (!secret || !safeEqual(got, secret)) throw unauthorized("Invalid tool secret");
  const { handle } = await body(c, z.object({ handle: z.string().min(1).max(120) }));
  return c.json(await getDeveloperTrust(handle));
});

/** Same answer for the typed/fallback "Ask Karma" (no secret: public data only, rate limited). */
voice.post("/voice/verify-text", rateLimit("verify-text", 20, 60_000), async (c) => {
  const { question } = await body(c, z.object({ question: z.string().min(1).max(300) }));
  const handle = handleFromQuestion(question);
  if (!handle) return c.json({ found: false, spoken_summary: "Tell me a GitHub handle and I'll check what's verified on-chain." });
  return c.json(await getDeveloperTrust(handle));
});

voice.get("/voice/verify-session", rateLimit("verify-session", 10, 10 * 60_000), async (c) => {
  if (!elevenConfigured() || !env.ELEVENLABS_VERIFY_AGENT_ID) return c.json({ fallback: true, reason: "not_configured" });
  try {
    return c.json({ fallback: false, signedUrl: await getSignedUrl(env.ELEVENLABS_VERIFY_AGENT_ID) });
  } catch (err) {
    log.warn("verify signed url failed", { err });
    return c.json({ fallback: true, reason: err instanceof ElevenQuotaError ? "quota" : "unavailable" });
  }
});

// ---- profile briefing: text always, audio when ElevenLabs is available (cached per evidence set)
const audioCache = new Map<string, ArrayBuffer>();
const textCache = new Map<string, string>();
const MAX_AUDIO = 50;

async function briefFor(handleParam: string) {
  const handle = normalizeHandle(handleParam);
  const user = handle ? await findUserByHandleOrAddress(handle) : null;
  if (!user) throw notFound("Profile not found");
  const p = await buildProfile(user);
  const key = sha256Hex(`${user.id}|${p.skills.map((s) => s.evidenceHash).join(",")}|${p.trustSignals.attestationCount}`);
  let text = textCache.get(key);
  if (!text) {
    text = await profileBriefText(p);
    textCache.set(key, text);
  }
  return { key, text };
}

voice.get("/voice/brief/:handle", rateLimit("brief", 30, 60_000), async (c) => {
  const { key, text } = await briefFor(c.req.param("handle"));
  const format = parse(z.enum(["text", "audio"]).default("text"), c.req.query("format"));
  if (format === "text") return c.json({ text, audio: elevenConfigured() && !!env.ELEVENLABS_VOICE_ID });

  if (!elevenConfigured() || !env.ELEVENLABS_VOICE_ID) throw new HttpError(503, "tts_unavailable", "Voice briefing is offline");
  let audio = audioCache.get(key);
  if (!audio) {
    try {
      audio = await textToSpeech(text, env.ELEVENLABS_VOICE_ID);
    } catch (err) {
      if (err instanceof ElevenQuotaError) throw new HttpError(503, "tts_quota", "Voice quota reached");
      throw err;
    }
    audioCache.set(key, audio);
    if (audioCache.size > MAX_AUDIO) audioCache.delete(audioCache.keys().next().value!);
  }
  return c.body(audio, 200, { "content-type": "audio/mpeg", "cache-control": "public, max-age=3600" });
});
