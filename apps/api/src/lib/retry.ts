export class TimeoutError extends Error {}

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  /** Return true when the error is worth retrying. */
  shouldRetry?: (err: unknown) => boolean;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries with full-jitter exponential backoff. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { retries = 2, baseMs = 400, maxMs = 5000, shouldRetry = () => true } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err)) break;
      await sleep(Math.random() * Math.min(maxMs, baseMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly bodyText: string,
    public readonly headers?: Headers,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

export const isRetryable = (err: unknown) =>
  err instanceof TimeoutError ||
  (err instanceof HttpStatusError && (err.status === 429 || err.status >= 500)) ||
  err instanceof TypeError; // network failure inside fetch

export type FetchInit = RequestInit & { timeoutMs?: number };

/** fetch with a hard timeout; non-2xx becomes HttpStatusError. */
export async function fetchWithTimeout(url: string, init: FetchInit = {}): Promise<Response> {
  const { timeoutMs = 15_000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    if (!res.ok) {
      throw new HttpStatusError(res.status, url, (await res.text()).slice(0, 500), res.headers);
    }
    return res;
  } catch (err) {
    if (ctrl.signal.aborted) throw new TimeoutError(`Timed out after ${timeoutMs} ms: ${new URL(url).host}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init: FetchInit & { retries?: number } = {}): Promise<T> {
  const { retries = 2, ...rest } = init;
  return withRetry(async () => (await (await fetchWithTimeout(url, rest)).json()) as T, {
    retries,
    shouldRetry: isRetryable,
  });
}
