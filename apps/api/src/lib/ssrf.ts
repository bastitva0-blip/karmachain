import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup as dnsLookupP } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

/**
 * SSRF-safe fetch for user-supplied URLs.
 * - http/https only, default ports only, no credentials in the URL
 * - DNS resolved before the request AND validated again at connect time (defeats DNS rebinding)
 * - private, loopback, link-local, CGNAT, multicast, reserved and metadata ranges blocked (v4 + v6)
 * - at most 3 redirects, each re-validated
 * - 10 s timeout, 2 MB cap, content-type allowlist
 */

export class SsrfError extends Error {}

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (fam === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
    // IPv4-mapped / translated (::ffff:a.b.c.d, ::a.b.c.d)
    const mapped = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isBlockedIp(mapped[1]!);
    if (lower === "::" || lower === "::1") return true;
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (lower.startsWith("64:ff9b:")) return true; // NAT64
    if (lower.startsWith("2001:db8:")) return true; // documentation
    return false;
  }
  return true; // not an IP at all → refuse
}

export async function assertPublicHost(host: string): Promise<void> {
  const h = host.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(h)) {
    throw new SsrfError("Local hostnames are not allowed");
  }
  const addrs = isIP(h) ? [{ address: h }] : await dnsLookupP(h, { all: true, verbatim: true }).catch(() => []);
  if (addrs.length === 0) throw new SsrfError("Could not resolve host");
  for (const a of addrs) if (isBlockedIp(a.address)) throw new SsrfError("That address is not publicly routable");
}

export function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SsrfError("Only http and https URLs are allowed");
  if (u.username || u.password) throw new SsrfError("Credentials in URLs are not allowed");
  if (u.port && !["80", "443"].includes(u.port)) throw new SsrfError("Only default ports are allowed");
  return u;
}

/** Connect-time check: runs for every socket, so a DNS answer can't change between check and use. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as unknown as LookupAddress[];
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad || list.length === 0) return callback(new SsrfError("Blocked address at connect time"), "", 4);
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    } else {
      callback(null, list[0]!.address, list[0]!.family);
    }
  });
};

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowTypes?: RegExp;
}

function requestOnce(u: URL, opts: Required<SafeFetchOptions>): Promise<SafeFetchResult & { location?: string }> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      u,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: opts.timeoutMs,
        headers: { "user-agent": "KarmaChain-Verifier/1.0", accept: "text/html,text/plain;q=0.9" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ url: u.toString(), status, contentType: "", body: Buffer.alloc(0), location: res.headers.location });
        }
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 400) {
          res.resume();
          return reject(new SsrfError(`Page returned HTTP ${status}`));
        }
        if (!opts.allowTypes.test(contentType)) {
          res.resume();
          return reject(new SsrfError(`Unsupported content type: ${contentType || "unknown"}`));
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          return reject(new SsrfError("Page is too large"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            res.destroy();
            reject(new SsrfError("Page is too large"));
          } else chunks.push(c);
        });
        res.on("end", () => resolve({ url: u.toString(), status, contentType, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new SsrfError("Timed out fetching the page")));
    req.on("error", (e) => reject(e instanceof SsrfError ? e : new SsrfError(e.message)));
    req.end();
  });
}

export async function safeFetch(raw: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts: Required<SafeFetchOptions> = {
    maxBytes: options.maxBytes ?? 2 * 1024 * 1024,
    timeoutMs: options.timeoutMs ?? 10_000,
    maxRedirects: options.maxRedirects ?? 3,
    allowTypes: options.allowTypes ?? /^text\/html\b/i,
  };
  let u = validateUrl(raw);
  const deadline = Date.now() + opts.timeoutMs;
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    await assertPublicHost(u.hostname);
    const r = await requestOnce(u, { ...opts, timeoutMs: Math.max(1000, deadline - Date.now()) });
    if (!r.location) return r;
    u = validateUrl(new URL(r.location, u).toString());
  }
  throw new SsrfError("Too many redirects");
}
