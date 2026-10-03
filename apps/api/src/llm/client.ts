import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { z } from "zod";
import { env, requireEnv } from "../env";
import { sha256Hex } from "../lib/crypto";
import { log } from "../lib/logger";
import { withRetry } from "../lib/retry";
import { extractJson } from "./json";

export type Msg = ChatCompletionMessageParam;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const { NVIDIA_API_KEY } = requireEnv("NVIDIA_API_KEY");
  client ??= new OpenAI({
    apiKey: NVIDIA_API_KEY,
    baseURL: env.NVIDIA_BASE_URL,
    timeout: 30_000,
    maxRetries: 0, // we retry ourselves with jitter
  });
  return client;
}

/**
 * Extra request fields for NVIDIA models (e.g. turning off reasoning traces so replies are
 * plain JSON). Configured via NVIDIA_CHAT_EXTRA_JSON.
 */
function chatExtra(): Record<string, unknown> {
  try {
    return env.NVIDIA_CHAT_EXTRA_JSON ? (JSON.parse(env.NVIDIA_CHAT_EXTRA_JSON) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const llmConfigured = () => Boolean(env.NVIDIA_API_KEY && env.NVIDIA_LLM_MODEL);

// ---- tiny LRU for deterministic (temperature 0) calls
const CACHE_MAX = 300;
const cache = new Map<string, string>();
function cacheGet(k: string) {
  const v = cache.get(k);
  if (v !== undefined) {
    cache.delete(k);
    cache.set(k, v);
  }
  return v;
}
function cacheSet(k: string, v: string) {
  cache.set(k, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

const isRetryableLlm = (err: unknown) => {
  if (err instanceof OpenAI.APIError) return err.status === 429 || (err.status ?? 0) >= 500;
  return err instanceof OpenAI.APIConnectionError || err instanceof OpenAI.APIConnectionTimeoutError;
};

/** Rough token budget: ~4 chars per token. */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…[truncated]`;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  cache?: boolean;
  /** Per-call timeout (default 30 s). */
  timeoutMs?: number;
  /** Retries on 429/5xx/timeouts (default 2). Interactive paths use 0 and fall back to templates. */
  retries?: number;
}

export async function chat(messages: Msg[], opts: ChatOptions = {}): Promise<string> {
  const { NVIDIA_LLM_MODEL } = requireEnv("NVIDIA_LLM_MODEL");
  const { temperature = 0.2, maxTokens = 1024, cache: useCache = temperature === 0 } = opts;
  const key = useCache ? sha256Hex(JSON.stringify([NVIDIA_LLM_MODEL, temperature, maxTokens, messages])) : "";
  if (useCache) {
    const hit = cacheGet(key);
    if (hit !== undefined) return hit;
  }
  const out = await withRetry(
    async () => {
      const res = await getClient().chat.completions.create({
        model: NVIDIA_LLM_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...chatExtra(),
      }, { timeout: opts.timeoutMs ?? 30_000 });
      return res.choices[0]?.message?.content ?? "";
    },
    { retries: opts.retries ?? 2, shouldRetry: isRetryableLlm },
  );
  if (useCache) cacheSet(key, out);
  return out;
}

/**
 * Ask for JSON, validate with zod, one repair retry on failure.
 * Throws if the model still returns invalid output.
 */
export async function chatJson<T extends z.ZodType>(
  schema: T,
  messages: Msg[],
  opts: ChatOptions = {},
): Promise<z.infer<T>> {
  const first = await chat(messages, { temperature: 0, ...opts });
  const r1 = schema.safeParse(extractJson(first));
  if (r1.success) return r1.data;

  log.warn("llm json invalid, repairing", { issues: r1.error.issues.slice(0, 3).map((i) => i.message) });
  const repaired = await chat(
    [
      ...messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content: `That was not valid. Errors: ${r1.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}. Reply with ONLY the corrected JSON object, no prose, no code fences.`,
      },
    ],
    { temperature: 0, ...opts, cache: false },
  );
  const r2 = schema.safeParse(extractJson(repaired));
  if (r2.success) return r2.data;
  throw new LlmInvalidOutputError("LLM returned invalid JSON twice");
}

export class LlmInvalidOutputError extends Error {}

export interface ToolCallResult {
  content: string;
  toolCall: { name: string; arguments: string } | null;
}

/** Single chat turn that may call one tool. Falls back to plain chat if tools are rejected. */
export async function chatWithTools(
  messages: Msg[],
  tools: ChatCompletionTool[],
  opts: ChatOptions = {},
): Promise<ToolCallResult> {
  const { NVIDIA_LLM_MODEL } = requireEnv("NVIDIA_LLM_MODEL");
  const res = await withRetry(
    () =>
      getClient().chat.completions.create({
        model: NVIDIA_LLM_MODEL,
        messages,
        tools,
        tool_choice: "auto",
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 800,
        ...chatExtra(),
      }),
    { retries: 2, shouldRetry: isRetryableLlm },
  );
  const msg = res.choices[0]?.message;
  const tc = msg?.tool_calls?.[0];
  return {
    content: msg?.content ?? "",
    toolCall: tc && tc.type === "function" ? { name: tc.function.name, arguments: tc.function.arguments } : null,
  };
}

export type StreamEvent = { type: "text"; text: string } | { type: "tool"; name: string; arguments: string };

/**
 * Streams text deltas and, at the end, at most one assembled tool call.
 * Throws LlmToolsUnsupportedError when the model rejects the `tools` parameter.
 */
export async function* chatStreamWithTools(
  messages: Msg[],
  tools: ChatCompletionTool[],
  opts: ChatOptions = {},
): AsyncGenerator<StreamEvent> {
  const { NVIDIA_LLM_MODEL } = requireEnv("NVIDIA_LLM_MODEL");
  let stream;
  try {
    stream = await withRetry(
      () =>
        getClient().chat.completions.create({
          model: NVIDIA_LLM_MODEL,
          messages,
          tools,
          tool_choice: "auto",
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 700,
          ...chatExtra(),
          stream: true,
        }),
      { retries: 2, shouldRetry: isRetryableLlm },
    );
  } catch (err) {
    if (err instanceof OpenAI.APIError && (err.status === 400 || err.status === 422)) {
      throw new LlmToolsUnsupportedError(err.message);
    }
    throw err;
  }
  let toolName = "";
  let toolArgs = "";
  for await (const chunk of stream) {
    const d = chunk.choices[0]?.delta;
    if (d?.content) yield { type: "text", text: d.content };
    for (const tc of d?.tool_calls ?? []) {
      if (tc.function?.name) toolName = tc.function.name;
      if (tc.function?.arguments) toolArgs += tc.function.arguments;
    }
  }
  if (toolName) yield { type: "tool", name: toolName, arguments: toolArgs };
}

export class LlmToolsUnsupportedError extends Error {}

/** Streams plain text tokens. */
export async function* chatStream(messages: Msg[], opts: ChatOptions = {}): AsyncGenerator<string> {
  const { NVIDIA_LLM_MODEL } = requireEnv("NVIDIA_LLM_MODEL");
  const stream = await getClient().chat.completions.create({
    model: NVIDIA_LLM_MODEL,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 600,
    ...chatExtra(),
    stream: true,
  });
  for await (const chunk of stream) {
    const t = chunk.choices[0]?.delta?.content;
    if (t) yield t;
  }
}

export async function embed(texts: string[], inputType: "query" | "passage"): Promise<number[][]> {
  const { NVIDIA_EMBED_MODEL } = requireEnv("NVIDIA_EMBED_MODEL");
  const out: number[][] = [];
  const BATCH = 16;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => truncateToTokens(t, 400));
    const res = await withRetry(
      () =>
        getClient().embeddings.create({
          model: NVIDIA_EMBED_MODEL,
          input: batch,
          encoding_format: "float",
          // NVIDIA-specific params, passed through by the OpenAI client.
          ...({ input_type: inputType, truncate: "END" } as Record<string, string>),
        }),
      { retries: 2, shouldRetry: isRetryableLlm },
    );
    for (const d of res.data) out.push(d.embedding);
  }
  return out;
}
