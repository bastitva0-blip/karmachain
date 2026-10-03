import { sql } from "drizzle-orm";
import { env } from "../env";
import { getDb } from "../db/client";
import { publicClient, relayerAddress, sbtAddress } from "../chain/client";
import { MIN_RELAYER_BALANCE } from "../chain/sbt";
import { fetchWithTimeout } from "./retry";

type Check = { ok: boolean; detail?: string };

let cached: { at: number; checks: Record<string, Check> } | null = null;
const TTL_MS = 60_000;

async function timed(fn: () => Promise<Check>): Promise<Check> {
  try {
    return await Promise.race([
      fn(),
      new Promise<Check>((r) => setTimeout(() => r({ ok: false, detail: "timeout" }), 5000)),
    ]);
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.slice(0, 120) : "error" };
  }
}

/** Dependency status, cached 60 s so /health stays cheap. Never includes secrets. */
export async function healthChecks(): Promise<Record<string, Check>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.checks;
  const [db, rpc, relayer, nvidia, eleven] = await Promise.all([
    timed(async () => {
      const d = await getDb();
      await d.execute(sql`select 1`);
      return { ok: true, detail: env.DATABASE_URL ? "postgres" : "pglite (local)" };
    }),
    timed(async () => {
      const n = await publicClient.getBlockNumber();
      return { ok: true, detail: `block ${n}${sbtAddress() ? "" : ", SBT not deployed"}` };
    }),
    timed(async () => {
      const a = relayerAddress();
      if (!a) return { ok: false, detail: "not configured" };
      const bal = await publicClient.getBalance({ address: a });
      return { ok: bal >= MIN_RELAYER_BALANCE, detail: bal >= MIN_RELAYER_BALANCE ? "funded" : "low balance" };
    }),
    timed(async () => {
      if (!env.NVIDIA_API_KEY) return { ok: false, detail: "not configured" };
      await fetchWithTimeout(`${env.NVIDIA_BASE_URL}/models`, {
        headers: { authorization: `Bearer ${env.NVIDIA_API_KEY}` },
        timeoutMs: 5000,
      });
      return { ok: !!env.NVIDIA_LLM_MODEL, detail: env.NVIDIA_LLM_MODEL ? "ok" : "model id missing" };
    }),
    timed(async () => {
      if (!env.ELEVENLABS_API_KEY) return { ok: false, detail: "not configured (text fallback active)" };
      await fetchWithTimeout("https://api.elevenlabs.io/v1/models", {
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
        timeoutMs: 5000,
      });
      return { ok: true, detail: env.ELEVENLABS_INTERVIEW_AGENT_ID ? "ok" : "agent id missing" };
    }),
  ]);
  const checks = { db, rpc, relayer, nvidia, elevenlabs: eleven };
  cached = { at: Date.now(), checks };
  return checks;
}
