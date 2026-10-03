/**
 * Anonymous recruiter identity. A random key kept in this browser's localStorage and sent as
 * `x-recruiter-key` so the API can list the jobs and interviews this browser created.
 * It is not a secret or an auth credential: anyone with the key sees the same list.
 */

const STORAGE_KEY = "kc_recruiter_key";
const VALID = /^[A-Za-z0-9_-]{16,64}$/;

// Fallback for when storage is blocked (private mode, disabled site data): stable for this tab only.
let memoryKey: string | null = null;

function randomKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gets or creates this browser's recruiter key. Returns null during SSR. */
export function getRecruiterKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && VALID.test(existing)) return existing;
    const fresh = randomKey();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    memoryKey ??= randomKey();
    return memoryKey;
  }
}

/** Headers to spread into every recruiter API call. Empty during SSR. */
export function recruiterHeaders(): Record<string, string> {
  const key = getRecruiterKey();
  return key ? { "x-recruiter-key": key } : {};
}
