import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { env } from "../env";
import { log } from "../lib/logger";
import { sleep } from "../lib/retry";
import { accessToken, type VakhAccount } from "./oauth";

/** A tool call that Vakh rejected (validation, permissions). Not retried. */
export class VakhToolError extends Error {
  constructor(
    public readonly tool: string,
    message: string,
  ) {
    super(`Vakh ${tool}: ${message}`);
  }
}

export type CallTool = <T = unknown>(name: string, args: Record<string, unknown>) => Promise<T>;

const CALL_TIMEOUT_MS = 20_000;
const isAuthError = (err: unknown) =>
  err instanceof UnauthorizedError || (err instanceof StreamableHTTPError && err.code === 401);
const isTransient = (err: unknown) =>
  !(err instanceof VakhToolError) && !isAuthError(err);

async function open(account: VakhAccount, forceRefresh: boolean): Promise<Client> {
  const token = await accessToken(account, forceRefresh);
  const transport = new StreamableHTTPClientTransport(new URL(env.VAKH_MCP_URL), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "karmachain", version: "1.0.0" });
  await client.connect(transport, { timeout: CALL_TIMEOUT_MS });
  return client;
}

function parseResult(tool: string, res: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const text = Array.isArray(res.content)
    ? res.content.map((c) => (c.type === "text" ? c.text : "")).join("")
    : "";
  if (res.isError) throw new VakhToolError(tool, text.slice(0, 500) || "tool error");
  if (res.structuredContent) return res.structuredContent;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Opens one MCP session as `account`, runs `fn` with a typed `call`, and closes it.
 * Retries the whole unit on network/5xx failures, and once with a forced token refresh on 401.
 * `fn` must be safe to re-run (look things up before creating them).
 */
export async function withVakh<T>(account: VakhAccount, fn: (call: CallTool) => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let client: Client | null = null;
    try {
      client = await open(account, attempt > 0 && isAuthError(lastErr));
      const c = client;
      const call: CallTool = async <R>(name: string, args: Record<string, unknown>) =>
        parseResult(name, await c.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS })) as R;
      return await fn(call);
    } catch (err) {
      lastErr = err;
      const retry = isAuthError(err) ? attempt === 0 : isTransient(err);
      if (!retry || attempt === 2) break;
      log.warn("vakh call retry", { attempt, err });
      await sleep(Math.random() * 400 * 2 ** attempt);
    } finally {
      await client?.close().catch(() => undefined);
    }
  }
  throw lastErr;
}
