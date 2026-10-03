import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod";
import {
  InterviewerStyleSchema,
  JobSpecSchema,
  MAX_INTERVIEW_MINUTES,
  type InterviewerStyle,
  type JobSpec,
} from "@karma/shared";
import { chatJson, chatStreamWithTools, LlmToolsUnsupportedError, type Msg } from "../llm/client";
import { dataBlock, extractJson } from "../llm/json";
import { intakeJsonFallbackSystem, intakeSystem, STYLE_SYSTEM } from "../llm/prompts";
import { log } from "../lib/logger";

/** In-memory chat state per recruiter chat id. Small and short-lived by design. */
interface ChatState {
  messages: Msg[];
  userMessages: string[];
  updatedAt: number;
  turns: number;
}

const chats = new Map<string, ChatState>();
const CHAT_TTL_MS = 2 * 60 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - CHAT_TTL_MS;
  for (const [id, c] of chats) if (c.updatedAt < cutoff) chats.delete(id);
}, 10 * 60_000).unref();

export const MAX_TURNS = 12;

function getChat(chatId: string): ChatState {
  let c = chats.get(chatId);
  if (!c) {
    c = { messages: [], userMessages: [], updatedAt: Date.now(), turns: 0 };
    chats.set(chatId, c);
  }
  return c;
}

export const resetChat = (chatId: string) => chats.delete(chatId);
export const chatUserMessages = (chatId: string) => chats.get(chatId)?.userMessages ?? [];

/** JSON Schema for the tool, kept close to JobSpecSchema. */
export const SUBMIT_JOB_SPEC_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "submit_job_spec",
    description: "Submit the structured job spec once you know enough about the role.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        seniority: { type: "string", enum: ["junior", "mid", "senior", "lead"] },
        mustHaveSkills: { type: "array", items: { type: "string" } },
        niceToHave: { type: "array", items: { type: "string" } },
        minTier: { type: "string", enum: ["basic", "medium", "top"] },
        softSkills: { type: "array", items: { type: "string" } },
        domain: { type: "string" },
        location: { type: "string" },
        interview: {
          type: "object",
          properties: {
            tracks: {
              type: "array",
              items: { type: "string", enum: ["technical", "system_design", "behavioural", "role_specific"] },
            },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            durationMinutes: { type: "integer", minimum: 1, maximum: MAX_INTERVIEW_MINUTES },
            customQuestions: { type: "array", items: { type: "string" } },
            tone: { type: "string", enum: ["friendly", "neutral", "strict"] },
          },
        },
      },
      required: ["title", "mustHaveSkills"],
    },
  },
};

export type IntakeEvent =
  | { type: "token"; text: string }
  | { type: "spec"; spec: JobSpec }
  | { type: "error"; message: string };

function parseSpec(raw: unknown): JobSpec | null {
  const r = JobSpecSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/**
 * One recruiter turn. Streams the assistant's question, or emits a validated JobSpec
 * when the model calls submit_job_spec (or, on models without tools, returns JSON).
 */
export async function* intakeTurn(chatId: string, userMessage: string): AsyncGenerator<IntakeEvent> {
  const chat = getChat(chatId);
  chat.updatedAt = Date.now();
  chat.turns++;
  chat.userMessages.push(userMessage);
  // Recruiter text is user content; it lives in the user role only.
  chat.messages.push({ role: "user", content: userMessage });
  const forceSubmit = chat.turns >= 7 || /^\s*go\s*[.!]?\s*$/i.test(userMessage);
  const system: Msg = {
    role: "system",
    content: intakeSystem(MAX_INTERVIEW_MINUTES) + (forceSubmit ? "\nYou now have enough. Call submit_job_spec now." : ""),
  };

  try {
    let text = "";
    for await (const ev of chatStreamWithTools([system, ...chat.messages], [SUBMIT_JOB_SPEC_TOOL])) {
      if (ev.type === "text") {
        text += ev.text;
        yield { type: "token", text: ev.text };
      } else if (ev.name === "submit_job_spec") {
        const spec = parseSpec(extractJson(ev.arguments));
        if (spec) {
          chat.messages.push({ role: "assistant", content: `Submitted job spec: ${JSON.stringify(spec)}` });
          yield { type: "spec", spec };
          return;
        }
        log.warn("invalid job spec from tool call");
        const msg = "I need one more detail: what is the role title and the must-have skills?";
        yield { type: "token", text: msg };
        text += msg;
      }
    }
    // Some models print the JSON instead of calling the tool.
    const inline = parseSpec((extractJson(text) as { spec?: unknown } | undefined)?.spec ?? extractJson(text));
    if (inline && /"title"/.test(text)) {
      yield { type: "spec", spec: inline };
      return;
    }
    chat.messages.push({ role: "assistant", content: text });
  } catch (err) {
    if (!(err instanceof LlmToolsUnsupportedError)) throw err;
    yield* jsonFallbackTurn(chat, forceSubmit);
  }
}

const FallbackReply = z.union([
  z.object({ type: z.literal("question"), text: z.string().min(1).max(600) }),
  z.object({ type: z.literal("submit"), spec: JobSpecSchema }),
]);

async function* jsonFallbackTurn(chat: ChatState, forceSubmit: boolean): AsyncGenerator<IntakeEvent> {
  const system: Msg = {
    role: "system",
    content: intakeJsonFallbackSystem(MAX_INTERVIEW_MINUTES) + (forceSubmit ? '\nReply with type "submit" now.' : ""),
  };
  const r = await chatJson(FallbackReply, [system, ...chat.messages], { temperature: 0.3, maxTokens: 700 });
  if (r.type === "submit") {
    chat.messages.push({ role: "assistant", content: `Submitted job spec: ${JSON.stringify(r.spec)}` });
    yield { type: "spec", spec: r.spec };
  } else {
    chat.messages.push({ role: "assistant", content: r.text });
    yield { type: "token", text: r.text };
  }
}

/** Style of the recruiter's own messages, as a persona hint. Not voice cloning. */
export async function summariseStyle(userMessages: string[]): Promise<InterviewerStyle | null> {
  if (userMessages.length === 0) return null;
  try {
    return await chatJson(
      InterviewerStyleSchema,
      [
        { role: "system", content: STYLE_SYSTEM },
        { role: "user", content: dataBlock("recruiter_messages", userMessages.join("\n---\n").slice(0, 6000)) },
      ],
      { maxTokens: 200 },
    );
  } catch (err) {
    log.warn("style summary failed", { err });
    return null;
  }
}
