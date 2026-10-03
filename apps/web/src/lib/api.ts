export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

// Only same-origin paths or absolute http(s) URLs are valid; anything else falls back to /api.
const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";
const BASE = /^(\/[^/]|https?:\/\/)/.test(RAW_BASE) ? RAW_BASE.replace(/\/$/, "") : "/api";

/** JSON fetch against the API (proxied through Next rewrites, so cookies are first-party). */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the server. Check your connection and retry.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data as T;
}

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong";
