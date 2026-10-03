import {
  discoverAuthorizationServerMetadata,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { AuthorizationServerMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { env } from "../env";
import { randomToken } from "../lib/crypto";
import { badRequest, unavailable } from "../lib/errors";
import { log } from "../lib/logger";
import { fetchWithTimeout, withRetry, isRetryable } from "../lib/retry";
import { kvDelete, kvGet, kvSet, kvTake } from "./store";

/**
 * OAuth 2.1 for Vakh's MCP server: discovery, dynamic client registration, PKCE,
 * and rotating refresh tokens. Verified against the live server (docs/VERIFIED.md).
 */

const SCOPE = "openid profile email offline_access";
const issuer = () => new URL(env.VAKH_MCP_URL).origin;
const resource = () => new URL(env.VAKH_MCP_URL);
// Refresh a little before expiry so a call never starts with a token about to lapse.
const SKEW_MS = 60_000;

/** Which Vakh account a token set belongs to. */
export type VakhAccount = { kind: "studio" } | { kind: "recruiter"; recruiterKey: string };

const tokenKey = (a: VakhAccount) => (a.kind === "studio" ? "tokens:studio" : `tokens:rec:${a.recruiterKey}`);

interface StoredTokens {
  clientId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  displayName: string | null;
}

interface PendingAuth {
  account: VakhAccount;
  codeVerifier: string;
  clientId: string;
  /** Where the browser goes after the callback (path on the web app). */
  returnTo: string;
}

const timedFetch: typeof fetch = (url, init) =>
  fetchWithTimeout(String(url instanceof Request ? url.url : url), { ...init, timeoutMs: 15_000 }).catch((err: unknown) => {
    // The SDK reads error bodies itself; give it the response instead of our HttpStatusError.
    if (err && typeof err === "object" && "status" in err && "bodyText" in err) {
      const e = err as { status: number; bodyText: string };
      return new Response(e.bodyText, { status: e.status, headers: { "content-type": "application/json" } });
    }
    throw err;
  });

let metadataCache: { at: number; value: AuthorizationServerMetadata } | null = null;

async function metadata(): Promise<AuthorizationServerMetadata> {
  if (metadataCache && Date.now() - metadataCache.at < 60 * 60_000) return metadataCache.value;
  const value = await withRetry(() => discoverAuthorizationServerMetadata(issuer(), { fetchFn: timedFetch }), {
    shouldRetry: isRetryable,
  });
  if (!value) throw unavailable("vakh_unavailable", "Vakh sign-in is unavailable right now. Please retry.");
  metadataCache = { at: Date.now(), value };
  return value;
}

/** One registered OAuth client per callback URL, reused across sign-ins. */
async function clientId(): Promise<string> {
  const key = `client:${env.VAKH_CALLBACK_URL}`;
  const cached = await kvGet<{ clientId: string }>(key);
  if (cached) return cached.clientId;
  const info = await registerClient(issuer(), {
    metadata: await metadata(),
    clientMetadata: {
      client_name: "KarmaChain",
      client_uri: env.WEB_ORIGIN,
      redirect_uris: [env.VAKH_CALLBACK_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    },
    fetchFn: timedFetch,
  });
  await kvSet(key, { clientId: info.client_id });
  return info.client_id;
}

/** Starts a sign-in. Returns the Vakh consent URL to send the browser to. */
export async function beginAuth(account: VakhAccount, returnTo: string): Promise<string> {
  const id = await clientId();
  const state = randomToken(16);
  const { authorizationUrl, codeVerifier } = await startAuthorization(issuer(), {
    metadata: await metadata(),
    clientInformation: { client_id: id },
    redirectUrl: env.VAKH_CALLBACK_URL,
    scope: SCOPE,
    state,
    resource: resource(),
  });
  const pending: PendingAuth = { account, codeVerifier, clientId: id, returnTo };
  await kvSet(`pkce:${state}`, pending, 10 * 60_000);
  return authorizationUrl.toString();
}

/** Completes a sign-in from the OAuth callback. */
export async function completeAuth(code: string, state: string): Promise<PendingAuth> {
  const pending = await kvTake<PendingAuth>(`pkce:${state}`);
  if (!pending) throw badRequest("This Vakh sign-in link expired. Start again.");
  const tokens = await exchangeAuthorization(issuer(), {
    metadata: await metadata(),
    clientInformation: { client_id: pending.clientId },
    authorizationCode: code,
    codeVerifier: pending.codeVerifier,
    redirectUri: env.VAKH_CALLBACK_URL,
    resource: resource(),
    fetchFn: timedFetch,
  });
  await saveTokens(pending.account, pending.clientId, tokens, await displayName(tokens.access_token));
  return pending;
}

async function displayName(accessToken: string): Promise<string | null> {
  const url = (await metadata()).userinfo_endpoint;
  if (typeof url !== "string") return null;
  try {
    const res = await fetchWithTimeout(url, { headers: { authorization: `Bearer ${accessToken}` }, timeoutMs: 8_000 });
    const info = (await res.json()) as { name?: unknown; preferred_username?: unknown };
    const name = info.preferred_username ?? info.name;
    return typeof name === "string" ? name.slice(0, 80) : null;
  } catch {
    return null; // cosmetic only
  }
}

async function saveTokens(account: VakhAccount, clientIdValue: string, t: OAuthTokens, name: string | null) {
  const stored: StoredTokens = {
    clientId: clientIdValue,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    displayName: name,
  };
  await kvSet(tokenKey(account), stored);
}

// Vakh rotates refresh tokens, so two concurrent refreshes would race. Serialise per account.
const inflight = new Map<string, Promise<string>>();

/** A valid access token for the account, refreshing (and persisting the rotated token) when needed. */
export async function accessToken(account: VakhAccount, force = false): Promise<string> {
  const key = tokenKey(account);
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const t = await kvGet<StoredTokens>(key);
    if (!t) throw new VakhNotConnectedError(account);
    if (!force && t.expiresAt - SKEW_MS > Date.now()) return t.accessToken;
    if (!t.refreshToken) throw new VakhNotConnectedError(account);
    try {
      const fresh = await refreshAuthorization(issuer(), {
        metadata: await metadata(),
        clientInformation: { client_id: t.clientId },
        refreshToken: t.refreshToken,
        resource: resource(),
        fetchFn: timedFetch,
      });
      await saveTokens(account, t.clientId, { ...fresh, refresh_token: fresh.refresh_token ?? t.refreshToken }, t.displayName);
      return fresh.access_token;
    } catch (err) {
      log.warn("vakh token refresh failed", { account: account.kind, err });
      throw new VakhNotConnectedError(account);
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function connection(account: VakhAccount): Promise<{ connected: boolean; displayName: string | null }> {
  const t = await kvGet<StoredTokens>(tokenKey(account));
  return { connected: Boolean(t?.refreshToken || (t && t.expiresAt > Date.now())), displayName: t?.displayName ?? null };
}

export async function disconnect(account: VakhAccount): Promise<void> {
  await kvDelete(tokenKey(account));
}

export class VakhNotConnectedError extends Error {
  constructor(public readonly account: VakhAccount) {
    super(account.kind === "studio" ? "KarmaChain's Vakh account isn't connected" : "Connect your Vakh account first");
  }
}
