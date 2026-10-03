"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Download, Loader2, Minus, X } from "lucide-react";
import { keccak256, toBytes } from "viem";
import { useReadContract } from "wagmi";
import { BASESCAN, deployments, isDeployed, karmaSbtAbi, type Tier } from "@karma/shared";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, StateCard } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoBadge, TIER_LABEL } from "@/components/tier-badge";
import { AddressLink, ExternalLink, TxLink, truncate } from "@/components/tx-link";
import { api, ApiError, errorMessage } from "@/lib/api";
import { canonical } from "@/lib/verify";
import { CHAIN } from "@/lib/wagmi";
import { cn } from "@/lib/utils";

/** Response of GET /verify/:query (apps/api/src/routes/verify.ts). */
interface VerifyResponse {
  hash: string | null;
  evidence: unknown;
  bytes: number;
  analysis: {
    skill: string;
    tier: Tier;
    score: number;
    verified: boolean;
    source: string;
    createdAt: string;
    mintTx: string | null;
    revokedAt: string | null;
    revokeReason: string | null;
  } | null;
  owner: { handle: string; isDemo: boolean } | null;
  token: {
    tokenId: string;
    owner: string | null;
    skill: string | null;
    tier: Tier | null;
    score: number | null;
    evidenceHash: string | null;
    locked: boolean;
    revoked: boolean;
    revokedReason: string | null;
    revokedAt: string | null;
  } | null;
  sbt: string | null;
}

type CheckStatus = "ok" | "fail" | "warn" | "pending" | "skip";
interface CheckItem {
  key: string;
  status: CheckStatus;
  title: string;
  detail: React.ReactNode;
  mono?: boolean;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const TOKEN_RE = /^#?\d{1,12}$/;

const fmtDate = (iso: string | null | undefined, withYear = true) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) })
    : null;
const short = (h: string) => truncate(h, 6, 4);
const padId = (id: string) => id.padStart(4, "0");

function evidenceField(e: unknown, key: string): string | null {
  if (e && typeof e === "object" && key in e) {
    const v = (e as Record<string, unknown>)[key];
    return typeof v === "string" || typeof v === "number" ? String(v) : null;
  }
  return null;
}

export function VerifyView({ query }: { query: string | null }) {
  return (
    <div className="container-kc flex flex-col gap-8 pb-24 pt-14">
      <div className="flex max-w-[720px] flex-col gap-2.5">
        <Eyebrow>Verify · /evidence/[hash]</Eyebrow>
        <h1 className="display m-0 text-[40px] font-extrabold leading-none sm:text-[48px]">Don&apos;t trust us. Check it.</h1>
        <p className="m-0 text-[17px] leading-relaxed text-ink-muted">
          Paste an evidence hash or token ID. We fetch the evidence, hash it in your browser, and compare it with what&apos;s stored
          on-chain.
        </p>
      </div>
      <VerifyForm initial={query ?? ""} />
      {query ? <VerifyResult key={query} query={query} /> : <IdleHint />}
    </div>
  );
}

function VerifyForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!HASH_RE.test(v) && !TOKEN_RE.test(v)) {
      setError("Enter a 0x evidence hash (64 hex characters) or a token ID like 61.");
      return;
    }
    setError(null);
    router.push(`/evidence/${encodeURIComponent(v.replace(/^#/, "").toLowerCase())}`);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0 flex-1 basis-[280px]">
          <span className="sr-only">Evidence hash or token ID</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0x… or token ID"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={error ? "verify-err" : undefined}
            className="h-[52px] w-full rounded-xl border border-border-strong bg-surface px-4 font-mono text-[15px] text-ink placeholder:text-ink-dim focus-visible:outline-2 focus-visible:outline-karma"
          />
        </label>
        <Button type="submit" size="lg">
          Verify
        </Button>
      </div>
      {error && (
        <p id="verify-err" role="alert" className="m-0 text-sm text-error">
          {error}
        </p>
      )}
    </form>
  );
}

function IdleHint() {
  return (
    <Card className="flex max-w-xl flex-col gap-2 p-6">
      <Eyebrow tone="dim">How it works</Eyebrow>
      <p className="m-0 text-sm leading-relaxed text-ink-muted">
        Every soulbound token stores the keccak256 hash of its evidence JSON. We canonicalise the evidence (RFC 8785), hash it
        here in your browser, and read the token straight from Base Sepolia. If anyone edited the evidence after minting, the
        hashes won&apos;t match.
      </p>
    </Card>
  );
}

function VerifyResult({ query }: { query: string }) {
  const q = useQuery({
    queryKey: ["verify", query],
    queryFn: () => api<VerifyResponse>(`/verify/${encodeURIComponent(query)}`),
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 429)) && n < 1,
  });

  if (q.isLoading) return <ResultSkeleton />;
  if (q.error) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return notFound ? (
      <StateCard className="max-w-md" label="Not found" title="No evidence for that hash" body={q.error.message} />
    ) : (
      <StateCard
        className="max-w-md"
        tone="error"
        role="alert"
        label="Couldn't verify"
        title="The check didn't run"
        body={errorMessage(q.error)}
        action={
          <Button variant="outline" onClick={() => void q.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (!q.data) return <ResultSkeleton />;
  return <ResultBody data={q.data} />;
}

function ResultSkeleton() {
  return (
    <div aria-busy className="grid items-start gap-5 lg:grid-cols-2">
      <span className="sr-only" role="status">
        Fetching evidence…
      </span>
      <Card className="flex flex-col gap-4 p-7">
        <Skeleton className="h-6 w-32" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3.5">
            <Skeleton className="size-7 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </Card>
      <Card className="flex flex-col gap-4 p-7">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64" />
      </Card>
    </div>
  );
}

function ResultBody({ data }: { data: VerifyResponse }) {
  const { token, analysis, owner, evidence } = data;
  const tokenId = token?.tokenId ?? null;

  // keccak256 over the canonical JSON, computed here, never trusted from the server.
  const computed = useMemo(() => (evidence != null ? keccak256(toBytes(canonical(evidence))).toLowerCase() : null), [evidence]);

  // Read the token straight from Base Sepolia (public RPC) so the on-chain side doesn't rely on our API either.
  const sbt = isDeployed(deployments.sbt) ? deployments.sbt : null;
  const chainRead = useReadContract({
    address: sbt ?? undefined,
    abi: karmaSbtAbi,
    functionName: "skills",
    args: tokenId ? [BigInt(tokenId)] : undefined,
    chainId: CHAIN.id,
    query: { enabled: !!sbt && !!tokenId && !token?.revoked, retry: 1 },
  });
  const chainHash = chainRead.data ? (chainRead.data[3] as string).toLowerCase() : null;
  const onchainHash = chainHash ?? (chainRead.isError || !sbt ? (token?.evidenceHash ?? null) : null);
  const onchainSource = chainHash ? "read in your browser" : "via KarmaChain API";
  const chainPending = !!token && !token.revoked && !!sbt && chainRead.isLoading;

  const revoked = !!token?.revoked || !!analysis?.revokedAt;
  const revokedReason = token?.revokedReason ?? analysis?.revokeReason ?? null;
  const revokedAt = token?.revokedAt ?? analysis?.revokedAt ?? null;
  const recordMatches = !!computed && !!data.hash && computed === data.hash.toLowerCase();
  const chainMatches = !!computed && !!onchainHash && computed === onchainHash;
  const mismatch = (!!computed && !!data.hash && !recordMatches) || (!!computed && !!onchainHash && !chainMatches);

  const language = evidenceField(evidence, "language") ?? token?.skill ?? analysis?.skill ?? "Skill";
  const tier = token?.tier ?? analysis?.tier ?? null;
  const score = token?.score ?? analysis?.score ?? null;
  const rubric = evidenceField(evidence, "rubricVersion");
  const issued = fmtDate(evidenceField(evidence, "issuedAt") ?? analysis?.createdAt);
  const kb = data.bytes ? `${(data.bytes / 1024).toFixed(1)} KB` : null;

  const checks: CheckItem[] = [
    evidence != null
      ? { key: "fetched", status: "ok", title: "Evidence fetched", detail: [kb, rubric && `rubric v${rubric}`, issued].filter(Boolean).join(" · ") }
      : { key: "fetched", status: "fail", title: "Evidence not available", detail: "We have no evidence JSON stored for this token." },
    computed
      ? {
          key: "hashed",
          status: recordMatches ? "ok" : "fail",
          title: recordMatches ? "Hashed in your browser" : "Browser hash doesn't match the record",
          detail: recordMatches
            ? `keccak256 → ${short(computed)}`
            : `keccak256 → ${short(computed)} · expected ${data.hash ? short(data.hash) : "—"}`,
          mono: true,
        }
      : { key: "hashed", status: "skip", title: "Hashed in your browser", detail: "Nothing to hash.", mono: false },
    !token
      ? { key: "chain", status: "warn", title: "Not minted yet", detail: "No soulbound token stores this hash on Base Sepolia." }
      : token.revoked
        ? { key: "chain", status: "fail", title: `Token #${padId(token.tokenId)} was burned`, detail: "The on-chain hash went with it." }
        : chainPending
          ? { key: "chain", status: "pending", title: `Reading token #${padId(token.tokenId)} on Base Sepolia…`, detail: "eth_call · skills(tokenId)" }
          : onchainHash
            ? {
                key: "chain",
                status: chainMatches ? "ok" : "fail",
                title: chainMatches
                  ? `Matches token #${padId(token.tokenId)} on Base Sepolia`
                  : `Doesn't match token #${padId(token.tokenId)} on Base Sepolia`,
                detail: `evidenceHash → ${short(onchainHash)} · ${onchainSource}`,
                mono: true,
              }
            : { key: "chain", status: "warn", title: "Couldn't read the chain", detail: "Base Sepolia RPC didn't answer. Try again." },
    token
      ? {
          key: "sbt",
          status: token.revoked ? "fail" : token.locked ? "ok" : "warn",
          title: token.revoked ? "Token revoked" : token.locked ? "Token is soulbound and active" : "Token isn't locked",
          detail: token.revoked
            ? `revoked${fmtDate(revokedAt) ? ` ${fmtDate(revokedAt)}` : ""}${revokedReason ? ` · "${revokedReason}"` : ""}`
            : `locked = ${token.locked} · not revoked`,
          mono: !token.revoked,
        }
      : { key: "sbt", status: "skip", title: "Soulbound status", detail: "Nothing on-chain yet." },
    {
      key: "owner",
      status: token?.owner ? "ok" : "skip",
      title: "Owner",
      detail: (
        <span className="flex flex-wrap items-center gap-2">
          {token?.owner ? <AddressLink address={token.owner} /> : <span>No on-chain owner</span>}
          {owner && (
            <Link href={`/u/${encodeURIComponent(owner.handle)}`} className="text-sm">
              @{owner.handle}
            </Link>
          )}
          {owner?.isDemo && <DemoBadge />}
        </span>
      ),
    },
  ];

  const summary = [owner ? `@${owner.handle}` : null, language, tier ? TIER_LABEL[tier] : null, score != null ? String(score) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <section aria-labelledby="checks-h" className="rounded-2xl border border-border bg-surface p-6 sm:p-7">
        <h2 id="checks-h" className="display m-0 mb-2 text-[22px] font-bold">
          Checks
        </h2>
        <ol aria-live="polite" className="m-0 list-none p-0">
          {checks.map((c, i) => (
            <CheckRow key={c.key} item={c} last={i === checks.length - 1} />
          ))}
        </ol>
        <div className="mt-4">
          <Verdict
            revoked={revoked}
            revokedAt={revokedAt}
            revokedReason={revokedReason}
            mismatch={mismatch}
            pending={chainPending}
            minted={!!token}
            summary={summary}
            isDemo={!!owner?.isDemo}
            hasEvidence={evidence != null}
          />
        </div>
      </section>
      <EvidencePanel data={data} />
    </div>
  );
}

function CheckIcon({ status }: { status: CheckStatus }) {
  const base = "grid size-7 shrink-0 place-items-center rounded-full";
  if (status === "ok")
    return (
      <span className={cn(base, "bg-verified text-ground")}>
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </span>
    );
  if (status === "fail")
    return (
      <span className={cn(base, "bg-error text-ground")}>
        <X className="size-4" strokeWidth={3} aria-hidden />
      </span>
    );
  if (status === "warn")
    return (
      <span className={cn(base, "bg-warning text-ground")}>
        <AlertTriangle className="size-3.5" strokeWidth={2.5} aria-hidden />
      </span>
    );
  if (status === "pending")
    return (
      <span className={cn(base, "border-2 border-karma text-karma")}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      </span>
    );
  return (
    <span className={cn(base, "border-2 border-border-strong text-ink-dim")}>
      <Minus className="size-3.5" aria-hidden />
    </span>
  );
}

const STATUS_SR: Record<CheckStatus, string> = { ok: "passed", fail: "failed", warn: "warning", pending: "checking", skip: "not applicable" };

function CheckRow({ item, last }: { item: CheckItem; last: boolean }) {
  return (
    <li className={cn("flex items-start gap-3.5 py-4", !last && "border-b border-border")}>
      <CheckIcon status={item.status} />
      <div className="flex min-w-0 flex-col gap-1">
        <strong className="font-semibold">
          {item.title}
          <span className="sr-only"> ({STATUS_SR[item.status]})</span>
        </strong>
        <span className={cn("break-words text-ink-dim", item.mono ? "font-mono text-[13px]" : "text-sm")}>{item.detail}</span>
      </div>
    </li>
  );
}

function Verdict({
  revoked,
  revokedAt,
  revokedReason,
  mismatch,
  pending,
  minted,
  summary,
  isDemo,
  hasEvidence,
}: {
  revoked: boolean;
  revokedAt: string | null;
  revokedReason: string | null;
  mismatch: boolean;
  pending: boolean;
  minted: boolean;
  summary: string;
  isDemo: boolean;
  hasEvidence: boolean;
}) {
  if (mismatch) {
    return (
      <StateCard
        tone="error"
        role="alert"
        label="Mismatch"
        title="Hashes don't match"
        body="This evidence was changed after minting. Don't trust it."
      />
    );
  }
  if (revoked) {
    const when = fmtDate(revokedAt, false);
    return (
      <StateCard
        tone="warning"
        role="status"
        label="Revoked"
        title={when ? `Token revoked ${when}` : "Token revoked"}
        body={revokedReason ? `Reason: "${revokedReason}"` : "No reason was recorded."}
      />
    );
  }
  if (pending) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-[14px] border border-border bg-ground p-5 text-ink-muted">
        <Loader2 className="size-5 animate-spin text-karma" aria-hidden /> Checking Base Sepolia…
      </div>
    );
  }
  if (!hasEvidence) {
    return <StateCard label="Not found" title="No evidence for that hash" body="The token exists, but we can't show its evidence." />;
  }
  if (!minted) {
    return (
      <StateCard
        tone="warning"
        role="status"
        label="Not minted"
        title="Evidence intact, not on-chain"
        body="The evidence matches our record, but no soulbound token holds this hash yet."
      />
    );
  }
  return (
    <div role="status" className="flex items-center gap-3.5 rounded-[14px] border border-verified-border bg-verified-bg p-5">
      <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden className="shrink-0">
        <circle cx="32" cy="32" r="30" fill="var(--verified)" />
        <path d="M20 33l8 8 16-18" stroke="var(--ground)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex min-w-0 flex-col gap-1">
        <strong className="display text-xl font-bold text-verified">Verified</strong>
        <span className="flex flex-wrap items-center gap-2 text-sm text-[#C7EEDB]">
          {summary}
          {isDemo && <DemoBadge />}
        </span>
      </div>
    </div>
  );
}

function EvidencePanel({ data }: { data: VerifyResponse }) {
  const json = data.evidence != null ? JSON.stringify(data.evidence, null, 2) : null;
  const sbt = data.sbt ?? (isDeployed(deployments.sbt) ? deployments.sbt : null);
  const tokenId = data.token?.tokenId;
  const mintTx = data.analysis?.mintTx;

  function download() {
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `karmachain-evidence-${(data.hash ?? tokenId ?? "unknown").slice(0, 12)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-labelledby="ev-h" className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-border bg-surface p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ev-h" className="display m-0 text-[22px] font-bold">
          Evidence JSON
        </h2>
        <Button variant="outline" size="sm" onClick={download} disabled={!json}>
          <Download aria-hidden /> Download
        </Button>
      </div>
      {json ? (
        <pre
          tabIndex={0}
          aria-label="Evidence JSON"
          className="m-0 max-h-[520px] overflow-auto whitespace-pre rounded-xl bg-ground p-[18px] font-mono text-[13px] leading-relaxed text-[#C9C4D6]"
        >
          {json}
        </pre>
      ) : (
        <p className="m-0 text-sm text-ink-muted">No evidence JSON is stored for this token.</p>
      )}
      {data.hash && <span className="break-all font-mono text-xs text-ink-dim">hash {data.hash}</span>}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {sbt && tokenId && (
          <ExternalLink href={`${BASESCAN}/nft/${sbt}/${tokenId}`}>Open token on Basescan</ExternalLink>
        )}
        {mintTx && <TxLink hash={mintTx} prefix="mint tx " />}
      </div>
    </section>
  );
}
