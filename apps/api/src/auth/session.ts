import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq, gt } from "drizzle-orm";
import { env } from "../env";
import { getDb, schema } from "../db/client";
import { decrypt, encrypt, randomToken, sha256Hex } from "../lib/crypto";
import { unauthorized } from "../lib/errors";
import type { AppEnv, User } from "../types";

export const SESSION_COOKIE = "kc_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOpts = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "Lax" as const,
  path: "/",
});

export async function createSession(c: Context, userId: string, githubToken: string | null) {
  const db = await getDb();
  const raw = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({
    id: sha256Hex(raw),
    userId,
    encGithubToken: githubToken ? encrypt(githubToken) : null,
    expiresAt,
  });
  setCookie(c, SESSION_COOKIE, raw, { ...cookieOpts(), expires: expiresAt });
}

export async function destroySession(c: Context) {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) {
    const db = await getDb();
    // Deleting the row deletes the encrypted GitHub token with it.
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256Hex(raw)));
  }
  deleteCookie(c, SESSION_COOKIE, cookieOpts());
}

/** Loads the user (if any) into context. Never throws for anonymous requests. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", null);
  c.set("sessionId", null);
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) {
    const db = await getDb();
    const id = sha256Hex(raw);
    const rows = await db
      .select({ user: schema.users })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
      .limit(1);
    if (rows[0]) {
      c.set("user", rows[0].user);
      c.set("sessionId", id);
    }
  }
  await next();
};

export function requireUser(c: Context<AppEnv>): User {
  const user = c.get("user");
  if (!user) throw unauthorized();
  return user;
}

/** Decrypted GitHub token for this session, or null (e.g. seeded/demo users). */
export async function sessionGithubToken(sessionId: string | null): Promise<string | null> {
  if (!sessionId) return null;
  const db = await getDb();
  const [row] = await db
    .select({ enc: schema.sessions.encGithubToken })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  if (!row?.enc) return null;
  try {
    return decrypt(row.enc);
  } catch {
    return null;
  }
}
