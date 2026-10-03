"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAccount, useSignMessage, useSwitchChain } from "wagmi";
import type { Tier } from "@karma/shared";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, StateCard } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { GithubIcon } from "@/components/icons";
import { MintSuccess, type MintSuccessInfo } from "@/components/mint-success";
import { Pill, TierBadge } from "@/components/tier-badge";
import { TxLink, truncate } from "@/components/tx-link";
import { useMe } from "@/hooks/use-me";
import { api, errorMessage } from "@/lib/api";
import type { AnalysisSummary, Job, Me, MintOutcome } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CHAIN } from "@/lib/wagmi";

/** Rough progress from the job's step labels (repos dominate the runtime). */
export function jobProgress(job: Job | undefined): { pct: number; repos: number | null } {
  if (!job) return { pct: 0, repos: null };
  if (job.status === "done") return { pct: 100, repos: null };
  let repos: number | null = null;
  let analysed = 0;
  let reviewing = false;
  for (const s of job.steps) {
    const m = /^Analysing (\d+) repositories/.exec(s.label);
    if (m) repos = Number(m[1]);
    const a = /^Analysed (\d+)\/(\d+)/.exec(s.label);
    if (a) analysed = Number(a[1]);
    if (/reviewing code samples|merged pull requests/i.test(s.label)) reviewing = true;
  }
  let pct = Math.min(8, job.steps.length * 4);
  if (repos) pct = 10 + Math.round((60 * analysed) / repos);
  if (reviewing) pct = Math.max(pct, 78);
  return { pct: Math.min(96, pct), repos };
}

export function Dashboard() {
  const { me, loading } = useMe();

  return (
    <div className="container-kc flex flex-col gap-8 pb-24 pt-12">
      <div className="flex flex-col gap-2">
        <h1 className="display m-0 text-[40px] font-extrabold leading-tight">Turn your GitHub into proof</h1>
        <p className="m-0 text-base text-ink-muted">
          We read public repos and PRs only. We store your scores and evidence, never your code.
        </p>
      </div>
      {loading ? (
        <Card className="flex flex-col gap-3 p-5" aria-busy>
          <Skeleton className="h-[22px] w-3/5" />
          <Skeleton className="h-3" />
          <Skeleton className="h-3 w-4/5" />
        </Card>
      ) : !me ? (
        <StateCard
          className="max-w-md"
          label="Signed out"
          title="Sign in to start"
          body="Read-only access to public data."
          action={
            <Button asChild>
              <a href="/api/auth/github">
                <GithubIcon className="size-[18px]" /> Continue with GitHub
              </a>
            </Button>
          }
        />
      ) : (
        <SignedIn me={me} />
      )}
    </div>
  );
}

type StepState = "done" | "current" | "todo";

function ProgressTile({ n, label, state, right }: { n: number; label: string; state: StepState; right?: string }) {
  return (
    <li
      aria-current={state === "current" ? "step" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-xl border px-4 py-3.5",
        state === "current" ? "border-karma bg-surface-2" : state === "done" ? "border-border bg-surface" : "border-border",
      )}
    >
      {state === "done" ? (
        <span className="grid size-[26px] place-items-center rounded-full bg-verified text-ground">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <span
          className={cn(
            "grid size-[26px] place-items-center rounded-full border-2 font-mono text-[13px]",
            state === "current" ? "border-karma text-karma" : "border-border-strong text-ink-dim",
          )}
        >
          {n}
        </span>
      )}
      <span className={cn("font-medium", state === "current" && "font-semibold", state === "todo" && "text-ink-dim")}>{label}</span>
      {state === "done" && <span className="ml-auto text-[13px] text-ink-dim">Done</span>}
      {state === "current" && right && <span className="ml-auto font-mono text-[13px] text-karma">{right}</span>}
      <span className="sr-only">{state === "done" ? "complete" : state === "current" ? "current step" : "not started"}</span>
    </li>
  );
}

function SignedIn({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sealed, setSealed] = useState<MintSuccessInfo | null>(null);

  const analyses = useQuery({
    queryKey: ["analyses"],
    queryFn: () => api<{ analyses: AnalysisSummary[] }>("/analyses").then((r) => r.analyses),
  });
  const job = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api<Job>(`/analysis/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1200 : false),
  });

  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    const s = job.data?.status;
    if (s && s !== prev.current) {
      if (s === "done") {
        toast.success("Analysis complete");
        void qc.invalidateQueries({ queryKey: ["analyses"] });
      }
      if (s === "failed") toast.error(job.data?.error ?? "Analysis failed");
    }
    prev.current = s;
  }, [job.data?.status, job.data?.error, qc]);

  async function start() {
    setStarting(true);
    try {
      const r = await api<{ jobId: string }>("/analysis/start", { method: "POST" });
      setJobId(r.jobId);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  }

  const results = analyses.data ?? [];
  const running = starting || job.data?.status === "running";
  const failed = job.data?.status === "failed";
  const { pct, repos } = jobProgress(job.data);
  const allMinted = results.length > 0 && results.filter((r) => r.verified !== false).every((r) => r.tokenId);

  const states: StepState[] = [
    "done",
    me.walletAddress ? "done" : "current",
    running || results.length === 0 ? (me.walletAddress ? "current" : "todo") : "done",
    !me.walletAddress || results.length === 0 || running ? "todo" : allMinted ? "done" : "current",
  ];

  return (
    <>
      <ol aria-label="Progress" className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressTile n={1} label="GitHub" state={states[0]!} />
        <ProgressTile n={2} label="Wallet" state={states[1]!} />
        <ProgressTile n={3} label="Analyse" state={states[2]!} right={running ? `${pct}%` : undefined} />
        <ProgressTile n={4} label="Mint" state={states[3]!} />
      </ol>

      <div className="grid items-start gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {failed ? (
            <StateCard
              tone="error"
              role="alert"
              label="Analysis failed"
              title={/rate limit/i.test(job.data?.error ?? "") ? "GitHub rate limit hit" : "Analysis didn't finish"}
              body={`${job.data?.error ?? ""} Nothing was lost. Try again in a minute.`}
              action={
                <Button variant="outline" onClick={start} disabled={starting}>
                  Retry
                </Button>
              }
            />
          ) : (
            <AnalysisCard
              job={job.data}
              running={running}
              pct={pct}
              repos={repos}
              hasResults={results.length > 0}
              canStart
              walletLinked={!!me.walletAddress}
              onStart={start}
            />
          )}

          <Card className="flex flex-col gap-5 p-7" aria-labelledby="tiers-h">
            <div className="flex flex-col gap-1">
              <Eyebrow>Step 4{running ? " · preview when done" : ""}</Eyebrow>
              <h2 id="tiers-h" className="display m-0 text-[26px] font-bold">
                Your tiers
              </h2>
            </div>
            {analyses.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            ) : results.length === 0 ? (
              <StateCard
                label="No results yet"
                title="No tiers yet"
                body="Run an analysis to see your languages."
                action={
                  <Button onClick={start} disabled={running}>
                    Start analysis
                  </Button>
                }
              />
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((r) => (
                  <TierCard
                    key={r.id}
                    r={r}
                    canMint={!!me.walletAddress}
                    onMinted={(tokenId, txHash) =>
                      setSealed({
                        tokenId,
                        txHash,
                        language: r.language,
                        tier: r.tier as Tier,
                        score: r.score,
                        wallet: me.walletAddress,
                        handle: me.githubHandle,
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-5">
          <WalletCard me={me} />
          <PrivacyCard me={me} />
        </aside>
      </div>
      <MintSuccess info={sealed} onClose={() => setSealed(null)} />
    </>
  );
}

function AnalysisCard({
  job,
  running,
  pct,
  repos,
  hasResults,
  canStart,
  walletLinked,
  onStart,
}: {
  job: Job | undefined;
  running: boolean;
  pct: number;
  repos: number | null;
  hasResults: boolean;
  canStart: boolean;
  walletLinked: boolean;
  onStart: () => void;
}) {
  const steps = job?.steps ?? [];
  const visible = steps.filter((s) => !/^Analysed \d+\//.test(s.label)).slice(-6);
  const latestRepo = [...steps].reverse().find((s) => /^Analysed \d+\//.test(s.label));
  return (
    <Card className="flex flex-col gap-5 p-7" aria-labelledby="an-h">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Eyebrow>Step 3</Eyebrow>
          <h2 id="an-h" className="display m-0 text-[26px] font-bold">
            {running ? (repos ? `Analysing ${repos} repositories` : "Starting analysis") : hasResults ? "Analysis complete" : "Analyse your public work"}
          </h2>
        </div>
        {!running && (
          <Button onClick={onStart} disabled={!canStart} variant={hasResults ? "outline" : "default"} title={canStart ? undefined : "Link a wallet first"}>
            {hasResults ? "Re-analyse" : "Start analysis"}
          </Button>
        )}
        {running && latestRepo && <span className="font-mono text-[13px] text-ink-dim">{latestRepo.label.replace(/^Analysed /, "")}</span>}
      </div>
      {!walletLinked && !running && <p className="m-0 text-sm text-ink-dim">You can analyse now; link your wallet to mint the result.</p>}
      {(running || job) && (
        <>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Analysis progress"
            className="h-2 rounded-full bg-track"
          >
            <div className="h-full rounded-full bg-karma transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <ul aria-live="polite" className="m-0 flex list-none flex-col gap-3 p-0 text-[15px]">
            {visible.map((s, i) => {
              const current = running && i === visible.length - 1;
              return (
                <li key={`${s.at}-${s.label}`} className="flex items-center gap-3">
                  {current ? (
                    <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-karma border-t-transparent" />
                  ) : (
                    <span aria-hidden className="text-verified">
                      ✓
                    </span>
                  )}
                  {current ? <strong className="font-semibold">{s.label}</strong> : s.label}
                </li>
              );
            })}
            {running && (
              <li className="flex items-center gap-3 text-ink-dim">
                <span aria-hidden>○</span>Scoring each language and building evidence
              </li>
            )}
          </ul>
        </>
      )}
    </Card>
  );
}

function TierCard({
  r,
  canMint,
  onMinted,
}: {
  r: AnalysisSummary;
  canMint: boolean;
  onMinted: (tokenId: string, txHash: string | null) => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<string | null>(r.mintTx);
  const selfDeclared = r.verified === false;

  async function mint() {
    setBusy(true);
    try {
      const out = await api<MintOutcome>("/mint", { method: "POST", json: { analysisId: r.id } });
      if (out.txHash) setTx(out.txHash);
      if ((out.status === "minted" || out.status === "updated") && out.tokenId) onMinted(out.tokenId, out.txHash);
      else toast.success(out.txHash ? `${out.message} · tx ${truncate(out.txHash)}` : out.message);
      void qc.invalidateQueries({ queryKey: ["analyses"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3.5 rounded-[14px] border p-5",
        selfDeclared ? "border-dashed border-border-strong" : "border-[#2A2638] bg-ground",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="display truncate text-xl font-bold">{r.language}</span>
        <TierBadge tier={r.tier as Tier} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="display text-[40px] font-extrabold leading-none">{r.score}</span>
        <span className="text-ink-dim">/100</span>
      </div>
      {selfDeclared ? (
        <span className="text-[13px] text-ink-dim">Self-declared (from zip) · can&apos;t be minted</span>
      ) : r.tokenId ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-verified">Minted · token #{r.tokenId.padStart(4, "0")}</span>
          {tx && <TxLink hash={tx} className="text-xs" />}
        </div>
      ) : (
        <Button onClick={mint} disabled={busy || !canMint} title={canMint ? undefined : "Link a wallet first"}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {busy ? "Minting…" : "Mint soulbound token"}
        </Button>
      )}
    </li>
  );
}

function WalletCard({ me }: { me: Me }) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { setMe } = useMe();
  const [busy, setBusy] = useState(false);

  async function link() {
    if (!address) return;
    setBusy(true);
    try {
      const { nonce, message } = await api<{ nonce: string; message: string }>("/wallet/nonce", { method: "POST", json: { address } });
      const signature = await signMessageAsync({ message });
      const r = await api<{ user: Me }>("/wallet/link", { method: "POST", json: { nonce, address, signature } });
      setMe(r.user);
      toast.success("Wallet linked");
    } catch (e) {
      toast.error(/User rejected|denied/i.test(errorMessage(e)) ? "Signature cancelled" : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (me.walletAddress) {
    return (
      <Card className="flex flex-col gap-4 p-6" aria-labelledby="w-h">
        <Eyebrow>Connected</Eyebrow>
        <h2 id="w-h" className="display m-0 text-xl font-bold">
          Wallet
        </h2>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm">{truncate(me.walletAddress)}</span>
          <Pill tone="success">Base Sepolia</Pill>
        </div>
        <span className="text-[13px] text-ink-dim">Linked to @{me.githubHandle} by signature</span>
      </Card>
    );
  }

  if (isConnected && chainId !== CHAIN.id) {
    return (
      <StateCard
        tone="warning"
        label="Wrong network"
        title="Switch to Base Sepolia"
        body="Your wallet is on another network. KarmaChain runs on Base Sepolia testnet."
        action={<Button onClick={() => switchChain({ chainId: CHAIN.id })}>Switch network</Button>}
      />
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-6" aria-labelledby="w-h">
      <Eyebrow>Step 2</Eyebrow>
      <h2 id="w-h" className="display m-0 text-xl font-bold">
        Connect your wallet
      </h2>
      <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
      {isConnected && (
        <Button onClick={link} disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />} Sign link message
        </Button>
      )}
      <span className="text-[13px] text-ink-dim">
        Signing is free and sends no transaction. It proves this wallet belongs to @{me.githubHandle}.
      </span>
    </Card>
  );
}

function PrivacyCard({ me }: { me: Me }) {
  const { setMe } = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle(searchable: boolean) {
    setBusy(true);
    try {
      const r = await api<{ user: Me }>("/me/consent", { method: "POST", json: { searchable } });
      setMe(r.user);
      toast.success(searchable ? "Recruiters can now find you" : "You are hidden from recruiter search");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    if (!window.confirm("Delete your KarmaChain account and everything we store? Tokens already on-chain stay there.")) return;
    try {
      await api("/me", { method: "DELETE" });
      qc.clear();
      router.push("/");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Card id="privacy" className="flex scroll-mt-24 flex-col gap-[18px] p-6" aria-labelledby="pv-h">
      <Eyebrow>Privacy</Eyebrow>
      <h2 id="pv-h" className="display m-0 text-xl font-bold">
        You&apos;re in control
      </h2>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="consent" className="flex cursor-pointer flex-col gap-1">
          <span className="font-semibold">Let recruiters find me</span>
          <span className="text-[13px] text-ink-dim">Off by default. Turn off anytime.</span>
        </label>
        <Switch id="consent" checked={me.consentSearchable} disabled={busy} onCheckedChange={toggle} />
      </div>
      <div className="h-px bg-border" />
      <Button variant="destructive" onClick={deleteAll}>
        Delete my data
      </Button>
      <span className="text-xs leading-normal text-ink-dim">Tokens already on-chain stay there; we remove everything we store.</span>
    </Card>
  );
}
