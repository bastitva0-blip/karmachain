import { env, requireEnv } from "../env";
import { HttpStatusError, fetchJson, fetchWithTimeout, isRetryable, withRetry } from "../lib/retry";

export const ELEVEN_BASE = "https://api.elevenlabs.io";

export class ElevenQuotaError extends Error {}

export const elevenConfigured = () => Boolean(env.ELEVENLABS_API_KEY);

function headers(): Record<string, string> {
  const { ELEVENLABS_API_KEY } = requireEnv("ELEVENLABS_API_KEY");
  return { "xi-api-key": ELEVENLABS_API_KEY };
}

/** 401 (bad/killed key), 402/429 with quota wording → fallback mode. */
export function isQuotaOrAuthError(err: unknown): boolean {
  return (
    err instanceof HttpStatusError &&
    (err.status === 401 || err.status === 402 || (err.status === 429 && /quota|credit|limit/i.test(err.bodyText)))
  );
}

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  try {
    return await fetchJson<T>(`${ELEVEN_BASE}${path}`, { ...init, headers: { ...headers(), ...init.headers } });
  } catch (err) {
    if (isQuotaOrAuthError(err)) throw new ElevenQuotaError("ElevenLabs quota exhausted or key invalid");
    throw err;
  }
}

/** GET /v1/convai/conversation/get-signed-url?agent_id=… → { signed_url } */
export async function getSignedUrl(agentId: string): Promise<string> {
  const r = await call<{ signed_url: string }>(
    `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { timeoutMs: 10_000 },
  );
  return r.signed_url;
}

export interface ElevenConversation {
  conversation_id: string;
  status: "initiated" | "in-progress" | "processing" | "done" | "failed";
  transcript: { role: "user" | "agent"; message: string | null; time_in_call_secs: number }[];
  metadata?: { call_duration_secs?: number; start_time_unix_secs?: number };
}

export const getConversation = (id: string) =>
  call<ElevenConversation>(`/v1/convai/conversations/${encodeURIComponent(id)}`, { timeoutMs: 15_000 });

/** TTS → mp3 bytes. */
export async function textToSpeech(text: string, voiceId: string): Promise<ArrayBuffer> {
  try {
    return await withRetry(
      async () => {
        const res = await fetchWithTimeout(`${ELEVEN_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { ...headers(), "content-type": "application/json", accept: "audio/mpeg" },
          body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
          timeoutMs: 30_000,
        });
        return res.arrayBuffer();
      },
      { retries: 1, shouldRetry: isRetryable },
    );
  } catch (err) {
    if (isQuotaOrAuthError(err)) throw new ElevenQuotaError("ElevenLabs quota exhausted or key invalid");
    throw err;
  }
}

/** Speech-to-text (Scribe). */
export async function speechToText(audio: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.set("model_id", env.ELEVENLABS_STT_MODEL);
  form.set("file", audio, filename);
  try {
    const res = await fetchWithTimeout(`${ELEVEN_BASE}/v1/speech-to-text`, {
      method: "POST",
      headers: headers(),
      body: form,
      timeoutMs: 60_000,
    });
    const j = (await res.json()) as { text?: string };
    return (j.text ?? "").trim();
  } catch (err) {
    if (isQuotaOrAuthError(err)) throw new ElevenQuotaError("ElevenLabs quota exhausted or key invalid");
    throw err;
  }
}
