import { githubHeaders } from "../auth/github";
import { HttpStatusError, fetchWithTimeout, isRetryable, withRetry } from "../lib/retry";

export class GithubRateLimitError extends Error {
  constructor(public readonly resetAt: Date | null) {
    super(
      `GitHub rate limit reached${resetAt ? `, resets at ${resetAt.toISOString().slice(11, 16)} UTC` : ""}. Try again shortly.`,
    );
  }
}

export interface GhResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

/** Minimal GitHub REST client: timeouts, retry on 5xx, readable rate-limit errors. */
export interface GithubApi {
  get<T>(path: string, query?: Record<string, string | number>): Promise<GhResponse<T>>;
  getRaw(owner: string, repo: string, ref: string, path: string, maxBytes: number): Promise<string | null>;
}

export function createGithubApi(token: string | null): GithubApi {
  const headers = githubHeaders(token);

  async function get<T>(path: string, query: Record<string, string | number> = {}): Promise<GhResponse<T>> {
    const url = new URL(`https://api.github.com${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    try {
      return await withRetry(
        async () => {
          const res = await fetchWithTimeout(url.toString(), { headers, timeoutMs: 15_000 });
          return { data: (await res.json()) as T, headers: res.headers, status: res.status };
        },
        {
          retries: 2,
          shouldRetry: (e) => isRetryable(e) && !(e instanceof HttpStatusError && isRateLimited(e)),
        },
      );
    } catch (err) {
      if (err instanceof HttpStatusError && isRateLimited(err)) {
        const reset = err.headers?.get("x-ratelimit-reset");
        throw new GithubRateLimitError(reset ? new Date(Number(reset) * 1000) : null);
      }
      throw err;
    }
  }

  async function getRaw(owner: string, repo: string, ref: string, path: string, maxBytes: number) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.split("/").map(encodeURIComponent).join("/")}`;
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": "KarmaChain" }, timeoutMs: 10_000 });
      const buf = await res.arrayBuffer();
      return new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, maxBytes));
    } catch {
      return null;
    }
  }

  return { get, getRaw };
}

function isRateLimited(e: HttpStatusError) {
  return (
    (e.status === 403 || e.status === 429) &&
    (e.headers?.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(e.bodyText))
  );
}

/** Parses `Link: <...&page=N>; rel="last"` and returns N. */
export function lastPageFromLink(link: string | null): number | null {
  if (!link) return null;
  const m = /[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link);
  return m ? Number(m[1]) : null;
}
