import { z } from "zod";

/**
 * Most integrations are optional at boot so the API runs with a partial .env.
 * Features call `requireEnv()` and fail with a readable 503 when their keys are missing.
 * In production, the security-critical keys are mandatory.
 */
const optional = z.string().optional();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  /** Extra web origins (comma-separated) allowed to start GitHub sign-in, e.g. a second domain. */
  WEB_ORIGINS_EXTRA: z.string().default(""),
  DATABASE_URL: optional,
  PGLITE_DIR: z.string().default("./.data/pglite"),
  SESSION_SECRET: optional,
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  GITHUB_CALLBACK_URL: z.url().default("http://localhost:3000/api/auth/github/callback"),
  NVIDIA_API_KEY: optional,
  NVIDIA_BASE_URL: z.url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_LLM_MODEL: optional,
  NVIDIA_EMBED_MODEL: optional,
  NVIDIA_CHAT_EXTRA_JSON: z.string().default('{"chat_template_kwargs":{"enable_thinking":false}}'),
  ELEVENLABS_API_KEY: optional,
  ELEVENLABS_INTERVIEW_AGENT_ID: optional,
  ELEVENLABS_VERIFY_AGENT_ID: optional,
  ELEVENLABS_VOICE_ID: optional,
  ELEVENLABS_TOOL_SECRET: optional,
  ELEVENLABS_STT_MODEL: z.string().default("scribe_v1"),
  INTERVIEW_MAX_SECONDS: z.coerce.number().int().positive().default(180),
  RPC_URL: z.url().default("https://sepolia.base.org"),
  RELAYER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex key")
    .optional(),
  SBT_ADDRESS: optional,
  EAS_ADDRESS: optional,
  EAS_SCHEMA_REVIEW_UID: optional,
  EAS_SCHEMA_INTERVIEW_UID: optional,
  MAX_GAS_PRICE_GWEI: z.coerce.number().positive().default(5),
  /** Vakh MCP server (Streamable HTTP). OAuth discovery runs against its origin. */
  VAKH_MCP_URL: z.url().default("https://xo.vakh.com/mcp"),
  /** Public web app, used for links to forms and posts. */
  VAKH_APP_URL: z.url().default("https://vakh.com"),
  /** Where Vakh redirects after OAuth. Must be the web origin's /api/vakh/callback (proxied to the API). */
  VAKH_CALLBACK_URL: z.url().default("http://localhost:3000/api/vakh/callback"),
});

export type Env = z.infer<typeof EnvSchema>;

// GitHub OAuth is optional: without it, sign-in returns 503 and demo profiles still work.
const PROD_REQUIRED = ["SESSION_SECRET", "DATABASE_URL"] as const;

function loadEnv(): Env {
  // Empty strings from .env files mean "unset".
  const raw = Object.fromEntries(
    Object.entries(process.env)
      // Empty values, and values that are only an inline comment, mean "unset".
      .filter(([, v]) => v !== undefined && v.trim() !== "" && !v.trim().startsWith("#"))
      .map(([k, v]) => [k, v!.replace(/\s+#.*$/, "").trim()]),
  );
  const parsed = EnvSchema.safeParse(raw);
  const issues = parsed.success
    ? []
    : parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  if (parsed.success && parsed.data.NODE_ENV === "production") {
    for (const k of PROD_REQUIRED) if (!parsed.data[k]) issues.push(`  - ${k}: required in production`);
  }
  if (parsed.success && parsed.data.SESSION_SECRET && parsed.data.SESSION_SECRET.length < 32) {
    issues.push("  - SESSION_SECRET: must be at least 32 characters");
  }
  if (issues.length > 0 || !parsed.success) {
    console.error(`\nInvalid environment configuration:\n${issues.join("\n")}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

/** Dev-only fallback so local sessions work before SESSION_SECRET is set. Never used in production. */
export const sessionSecret =
  env.SESSION_SECRET ?? "dev-insecure-session-secret-change-me-0000000000000000";

export class ConfigMissingError extends Error {
  constructor(public readonly keys: string[]) {
    super(`Missing configuration: ${keys.join(", ")}`);
  }
}

/** Returns the values or throws ConfigMissingError (mapped to a 503 by the error handler). */
export function requireEnv<K extends keyof Env>(...keys: K[]): { [P in K]-?: NonNullable<Env[P]> } {
  const missing = keys.filter((k) => env[k] === undefined || env[k] === "");
  if (missing.length > 0) throw new ConfigMissingError(missing as string[]);
  return Object.fromEntries(keys.map((k) => [k, env[k]])) as { [P in K]-?: NonNullable<Env[P]> };
}
