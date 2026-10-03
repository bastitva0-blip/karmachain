import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { env, requireEnv } from "../env";
import { getDb, schema } from "../db/client";
import { randomToken, safeEqual } from "../lib/crypto";
import { badRequest } from "../lib/errors";
import { log } from "../lib/logger";
import { fetchJson } from "../lib/retry";
import { rateLimit } from "../lib/ratelimit";
import type { AppEnv } from "../types";
import { createSession, destroySession } from "./session";

const STATE_COOKIE = "kc_oauth_state";

const trimSlash = (o: string) => o.trim().replace(/\/$/, "");

const allowedOrigins = () => [env.WEB_ORIGIN, ...env.WEB_ORIGINS_EXTRA.split(",")].map(trimSlash).filter(Boolean);

const ORIGIN_COOKIE = "kc_oauth_origin";

const allowed = (origin: string | undefined) => {
  if (!origin) return undefined;
  try {
    const o = new URL(origin).origin;
    return allowedOrigins().find((a) => a === o);
  } catch {
    return undefined;
  }
};

/**
 * Web origin the user started sign-in from. Railway's edge rewrites x-forwarded-host on the
 * web → api hop, so the same-origin Referer of the sign-in click is the reliable signal. Only
 * allow-listed origins count; anything else falls back to WEB_ORIGIN. The callback path is fixed,
 * so redirect_uri is `${origin}/api/auth/github/callback` (each one is registered on the GitHub app).
 */
function startOrigin(c: { req: { header: (n: string) => string | undefined } }): string {
  const host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
  return (
    allowed(host ? `https://${host}` : undefined) ??
    allowed(c.req.header("referer")) ??
    allowed(c.req.header("origin")) ??
    trimSlash(env.WEB_ORIGIN)
  );
}

const callbackFor = (origin: string) =>
  origin === trimSlash(env.WEB_ORIGIN) ? env.GITHUB_CALLBACK_URL : `${origin}/api/auth/github/callback`;

// read:user only. Public repos/PRs are readable with any token; we never ask for `repo`.
const SCOPE = "read:user";

const TokenResponse = z.object({
  access_token: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const GithubUser = z.object({
  id: z.number(),
  login: z.string(),
  avatar_url: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export const githubAuth = new Hono<AppEnv>();

githubAuth.use("*", rateLimit("auth", 30, 60_000));

githubAuth.get("/github", (c) => {
  const { GITHUB_CLIENT_ID } = requireEnv("GITHUB_CLIENT_ID");
  const state = randomToken(16);
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  const origin = startOrigin(c);
  // Host-only cookie: it lands on the browser's domain, which is where GitHub sends the callback.
  setCookie(c, ORIGIN_COOKIE, origin, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackFor(origin));
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "true");
  return c.redirect(url.toString());
});

githubAuth.get("/github/callback", async (c) => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = requireEnv("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET");
  const code = c.req.query("code");
  const state = c.req.query("state");
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  const origin = allowed(getCookie(c, ORIGIN_COOKIE)) ?? trimSlash(env.WEB_ORIGIN);
  deleteCookie(c, ORIGIN_COOKIE, { path: "/" });
  if (!code || !state || !expected || !safeEqual(state, expected)) {
    throw badRequest("OAuth state mismatch. Please try signing in again.");
  }

  const tok = TokenResponse.parse(
    await fetchJson("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: callbackFor(origin),
      }),
      timeoutMs: 10_000,
    }),
  );
  if (!tok.access_token) {
    log.warn("github token exchange failed", { error: tok.error });
    throw badRequest("GitHub sign-in failed. Please try again.");
  }

  const gh = GithubUser.parse(
    await fetchJson("https://api.github.com/user", {
      headers: githubHeaders(tok.access_token),
      timeoutMs: 10_000,
    }),
  );

  const db = await getDb();
  const [user] = await db
    .insert(schema.users)
    .values({
      githubId: String(gh.id),
      githubHandle: gh.login,
      avatarUrl: gh.avatar_url ?? null,
      name: gh.name ?? null,
      githubCreatedAt: gh.created_at ? new Date(gh.created_at) : null,
    })
    .onConflictDoUpdate({
      target: schema.users.githubId,
      set: {
        githubHandle: gh.login,
        avatarUrl: gh.avatar_url ?? null,
        name: gh.name ?? null,
        githubCreatedAt: gh.created_at ? new Date(gh.created_at) : sql`${schema.users.githubCreatedAt}`,
      },
    })
    .returning();

  await createSession(c, user!.id, tok.access_token);
  return c.redirect(`${origin}/dashboard`);
});

githubAuth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

export function githubHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "KarmaChain",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
