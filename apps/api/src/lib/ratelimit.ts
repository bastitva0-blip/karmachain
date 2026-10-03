import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { tooMany } from "./errors";
import type { AppEnv } from "../types";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic sweep so the map can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60_000).unref();

export function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Returns false when the key is over its limit. */
export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}

/**
 * Fixed-window limiter, per IP and (when signed in) per user.
 * In-memory: fine for a single Railway instance.
 */
export function rateLimit(name: string, max: number, windowMs: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ipOk = hit(`${name}:ip:${clientIp(c)}`, max, windowMs);
    const user = c.get("user");
    const userOk = user ? hit(`${name}:user:${user.id}`, max, windowMs) : true;
    if (!ipOk || !userOk) throw tooMany();
    await next();
  };
}

export function resetRateLimits() {
  buckets.clear();
}
