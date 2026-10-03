"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { formatEther } from "viem";
import { useAccount, usePublicClient, useSignMessage, useSwitchChain, useWriteContract } from "wagmi";
import { BASE_SEPOLIA_CHAIN_ID, deployments, isDeployed, karmaSbtAbi } from "@karma/shared";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, StateCard } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AddressLink, TxLink, truncate } from "@/components/tx-link";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VakhPanel } from "./vakh-panel";

interface Flag {
  id: string;
  status: "open" | "dismissed" | "revoked";
  signal: string;
  details: string[];
  source: "system" | "report";
  tokenId: string | null;
  skill: string | null;
  tier: string | null;
  score: number | null;
  evidenceHash: string | null;
  mintedAt: string | null;
  owner: { handle: string; wallet: string | null } | null;
  reason: string | null;
  revokeTx: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface Overview {
  admin: string;
  stats: { openFlags: number; active: number; revoked: number };
  flags: Flag[];
  relayer: {
    address: string | null;
    balanceWei: string | null;
    gasCapGwei: number;
    mintsToday: number;
    checks: Record<string, { ok: boolean; detail?: string }>;
  };
}

const OVERVIEW_KEY = ["admin-overview"] as const;
const REASON_MAX = 200;

const tierLabel = (t: string | null) => (t ? t[0]!.toUpperCase() + t.slice(1) : null);
const tokenLabel = (id: string | null) => (id ? `#${id.padStart(4, "0")}` : "No token");
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const isUserRejection = (e: unknown) => /User rejected|denied|rejected the request/i.test(errorMessage(e));

export function AdminView() {
  const overview = useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => api<Overview>("/admin/overview"),
    retry: (count, err) => !(err instanceof ApiError && (err.status === 401 || err.status === 403)) && count < 1,
  });

  const unauth = overview.error instanceof ApiError && overview.error.status === 401;

  return (
    <div className="flex flex-1 flex-col">
      <AdminBar address={overview.data?.admin ?? null} />
      {overview.isLoading ? (
        <LoadingState />
      ) : unauth ? (
        <SignIn />
      ) : overview.error ? (
        <div className="mx-auto w-full max-w-[1320px] px-6 py-10">
          <StateCard
            tone="error"
            role="alert"
            label="Couldn't load"
            title="Admin overview didn't load"
            body={errorMessage(overview.error)}
            action={
              <Button variant="outline" onClick={() => overview.refetch()}>
                Retry
              </Button>
            }
          />
        </div>
      ) : overview.data ? (
        <Dashboard data={overview.data} />
      ) : null}
    </div>
  );
}

function AdminBar({ address }: { address: string | null }) {
  const qc = useQueryClient();
  async function logout() {
    await api("/admin/logout", { method: "POST" }).catch(() => undefined);
    qc.removeQueries({ queryKey: OVERVIEW_KEY });
    await qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    toast.success("Signed out of admin");
  }
  return (
    <div className="border-b border-error-border bg-[#160F12]">
      <div className="mx-auto flex min-h-12 w-full max-w-[1320px] flex-wrap items-center justify-between gap-3 px-6 py-2">
        <span className="rounded-full bg-error-bg px-2.5 py-1 text-xs font-semibold text-error">Admin</span>
        {address ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-[13px] text-ink-dim">
              signed in as admin {truncate(address)} · DEFAULT_ADMIN_ROLE
            </span>
            <Button variant="ghost" size="sm" onClick={logout} aria-label="Sign out of admin">
              <LogOut aria-hidden /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        ) : (
          <span className="font-mono text-[13px] text-ink-dim">not signed in</span>
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto grid w-full max-w-[1320px] gap-6 px-6 py-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-busy="true" aria-label="Loading admin overview">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-12 w-2/3" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-[84px] rounded-2xl" />
          <Skeleton className="h-[84px] rounded-2xl" />
          <Skeleton className="h-[84px] rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}

function SignIn() {
  const qc = useQueryClient();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);

  async function signIn() {
    if (!address) return;
    setBusy(true);
    setDenied(null);
    try {
      const { nonce, message } = await api<{ nonce: string; message: string }>("/admin/nonce", { method: "POST", json: { address } });
      const signature = await signMessageAsync({ message });
      await api("/admin/session", { method: "POST", json: { nonce, signature } });
      await qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setDenied(e.message);
      else toast.error(isUserRejection(e) ? "Signature cancelled" : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5 px-6 py-16">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>/admin</Eyebrow>
        <h1 className="display m-0 text-[clamp(30px,4vw,40px)] font-extrabold leading-tight">Flags &amp; revocations</h1>
        <p className="m-0 text-ink-muted">Sign in with a wallet that holds DEFAULT_ADMIN_ROLE on KarmaSBT.</p>
      </div>
      <Card tone="error" className="flex flex-col gap-4 p-6">
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
        {isConnected && (
          <Button onClick={signIn} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />} {busy ? "Waiting for signature…" : "Sign in as admin"}
          </Button>
        )}
        <span className="text-[13px] text-ink-dim">Signing is free and sends no transaction. The session lasts 2 hours.</span>
      </Card>
      {denied && (
        <StateCard
          tone="warning"
          role="alert"
          label="Wrong wallet"
          title="This wallet isn't an admin"
          body={`${denied}. Switch to the admin wallet in your wallet app, then sign in again.`}
        />
      )}
    </div>
  );
}

function FlagStatus({ f }: { f: Flag }) {
  const base = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold";
  if (f.status === "revoked") return <span className={cn(base, "bg-error-bg text-error")}>Revoked {shortDate(f.resolvedAt)}</span>;
  if (f.status === "dismissed") return <span className={cn(base, "bg-surface-2 text-ink-muted")}>Dismissed</span>;
  return <span className={cn(base, "bg-warning-bg text-warning")}>Flagged</span>;
}

function Dashboard({ data }: { data: Overview }) {
  const firstOpen = data.flags.find((f) => f.status === "open")?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(firstOpen);
  const selected = data.flags.find((f) => f.id === selectedId && f.status === "open") ?? null;

  return (
    <div className="mx-auto grid w-full max-w-[1320px] items-start gap-6 px-6 pb-24 pt-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>/admin</Eyebrow>
          <h1 className="display m-0 text-[clamp(30px,4vw,40px)] font-extrabold leading-tight">Flags &amp; revocations</h1>
          <p className="m-0 text-ink-muted">Revoking burns the token on-chain with a public reason. It can&apos;t be undone.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { n: data.stats.openFlags, label: "Open flags", cls: "text-warning" },
            { n: data.stats.active, label: "Active tokens", cls: "" },
            { n: data.stats.revoked, label: "Revoked", cls: "text-error" },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <div className={cn("display text-[28px] font-extrabold leading-tight", s.cls)}>{s.n}</div>
              <div className="text-sm text-ink-muted">{s.label}</div>
            </Card>
          ))}
        </div>

        {data.flags.length === 0 ? (
          <StateCard tone="success" label="All clear" title="No flags" body="Nothing has been flagged or reported. New signals and reports land here." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Flags</caption>
              <thead>
                <tr className="border-b border-border text-left font-mono text-xs tracking-[0.06em] text-ink-dim">
                  <th scope="col" className="px-4 py-3 font-medium">TOKEN</th>
                  <th scope="col" className="px-4 py-3 font-medium">OWNER</th>
                  <th scope="col" className="px-4 py-3 font-medium">SIGNAL</th>
                  <th scope="col" className="px-4 py-3 font-medium">STATUS</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.flags.map((f) => {
                  const resolved = f.status !== "open";
                  const isSel = f.id === selected?.id;
                  return (
                    <tr key={f.id} className={cn("border-b border-border-soft last:border-b-0", isSel && "bg-surface-2")}>
                      <td className={cn("px-4 py-3.5 font-mono", resolved && "text-ink-dim")}>
                        {[tokenLabel(f.tokenId), f.skill, tierLabel(f.tier)].filter(Boolean).join(" · ")}
                      </td>
                      <td className={cn("px-4 py-3.5", resolved && "text-ink-dim")}>{f.owner ? `@${f.owner.handle}` : "Unknown"}</td>
                      <td className={cn("px-4 py-3.5", resolved ? "text-ink-dim" : isSel ? "text-warning" : "text-ink-muted")}>
                        {f.signal}
                        {f.source === "report" && <span className="ml-1.5 text-xs text-ink-dim">(report)</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <FlagStatus f={f} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {f.status === "revoked" && f.revokeTx ? (
                          <TxLink hash={f.revokeTx} prefix="tx " />
                        ) : f.status === "open" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(isSel && "border-karma")}
                            aria-pressed={isSel}
                            onClick={() => setSelectedId(f.id)}
                          >
                            {isSel ? "Reviewing" : "Review"}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        <RelayerHealth relayer={data.relayer} />
        <VakhPanel />
      </div>

      {selected ? (
        <RevokePanel key={selected.id} flag={selected} admin={data.admin} onDone={() => setSelectedId(null)} />
      ) : (
        <StateCard
          className="lg:sticky lg:top-[92px]"
          label="Nothing selected"
          title={data.stats.openFlags ? "Pick a flag to review" : "No open flags"}
          body={data.stats.openFlags ? "Press Review on a flagged token to see its evidence." : "Revocations need a flag first."}
        />
      )}
    </div>
  );
}

function RelayerHealth({ relayer }: { relayer: Overview["relayer"] }) {
  const balance = relayer.balanceWei ? `${Number(formatEther(BigInt(relayer.balanceWei))).toFixed(4)} ETH` : "unknown";
  const NAMES: Record<string, string> = { db: "Database", rpc: "RPC", relayer: "Relayer", nvidia: "NVIDIA", elevenlabs: "ElevenLabs" };
  return (
    <Card className="flex flex-col gap-2.5 p-5" aria-labelledby="rh-h">
      <Eyebrow id="rh-h">Relayer health</Eyebrow>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span>
          Balance <strong className="font-mono">{balance}</strong>
        </span>
        <span>
          Gas cap <strong className="font-mono">{relayer.gasCapGwei} gwei</strong>
        </span>
        <span>
          Mints today <strong className="font-mono">{relayer.mintsToday}</strong>
        </span>
        {relayer.address && (
          <span>
            Address <AddressLink address={relayer.address} className="text-sm" />
          </span>
        )}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-sm">
        {Object.entries(relayer.checks).map(([k, c]) => (
          <li key={k} className={c.ok ? "text-verified" : "text-warning"}>
            <span aria-hidden>●</span> {NAMES[k] ?? k} {c.ok ? "ok" : "issue"}
            {c.detail ? <span className="text-ink-dim"> · {c.detail}</span> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

type Phase =
  | { kind: "idle" }
  | { kind: "switching" }
  | { kind: "signing" }
  | { kind: "confirming"; hash: `0x${string}` }
  | { kind: "recording"; hash: `0x${string}` }
  | { kind: "failed"; message: string; hash?: `0x${string}`; mined?: boolean };

function RevokePanel({ flag, admin, onDone }: { flag: Flag; admin: string; onDone: () => void }) {
  const qc = useQueryClient();
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: BASE_SEPOLIA_CHAIN_ID });
  const [reason, setReason] = useState(flag.signal.replace(/^Reported:\s*/, "").slice(0, REASON_MAX));
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dismissing, setDismissing] = useState(false);

  const sbtReady = isDeployed(deployments.sbt);
  const walletMismatch = isConnected && !!address && address.toLowerCase() !== admin.toLowerCase();
  const busy = phase.kind === "switching" || phase.kind === "signing" || phase.kind === "confirming" || phase.kind === "recording";
  const canRevoke = !!flag.tokenId && sbtReady && isConnected && !walletMismatch && confirmed && reason.trim().length >= 5 && !busy;

  async function record(hash: `0x${string}`) {
    setPhase({ kind: "recording", hash });
    try {
      await api(`/admin/flags/${flag.id}/revoked`, { method: "POST", json: { txHash: hash } });
      toast.success(`Token ${tokenLabel(flag.tokenId)} revoked and burned`);
      await qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
      onDone();
    } catch (e) {
      setPhase({ kind: "failed", message: `Burned on-chain, but recording failed: ${errorMessage(e)}`, hash, mined: true });
    }
  }

  async function revoke() {
    if (!flag.tokenId || !publicClient) return;
    try {
      if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
        setPhase({ kind: "switching" });
        await switchChainAsync({ chainId: BASE_SEPOLIA_CHAIN_ID });
      }
      setPhase({ kind: "signing" });
      const hash = await writeContractAsync({
        address: deployments.sbt,
        abi: karmaSbtAbi,
        functionName: "revoke",
        args: [BigInt(flag.tokenId), reason.trim()],
        chainId: BASE_SEPOLIA_CHAIN_ID,
      });
      setPhase({ kind: "confirming", hash });
      const rc = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
      if (rc.status !== "success") {
        setPhase({ kind: "failed", message: "The transaction reverted. Check the wallet holds DEFAULT_ADMIN_ROLE and the token still exists.", hash });
        return;
      }
      await record(hash);
    } catch (e) {
      setPhase({ kind: "failed", message: isUserRejection(e) ? "Transaction cancelled in the wallet." : errorMessage(e).split("\n")[0]! });
    }
  }

  async function dismiss() {
    setDismissing(true);
    try {
      await api(`/admin/flags/${flag.id}/dismiss`, { method: "POST" });
      toast.success("Flag dismissed");
      await qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDismissing(false);
    }
  }

  const label = tokenLabel(flag.tokenId);
  const busyText =
    phase.kind === "switching"
      ? "Switching to Base Sepolia…"
      : phase.kind === "signing"
        ? "Confirm in your wallet…"
        : phase.kind === "confirming"
          ? "Waiting for confirmation…"
          : phase.kind === "recording"
            ? "Recording revocation…"
            : null;

  return (
    <Card tone="error" className="flex flex-col gap-4 p-6 lg:sticky lg:top-[92px]" aria-labelledby="rv-h" role="region">
      <h2 id="rv-h" className="display m-0 text-[22px] font-bold">
        {flag.tokenId ? `Revoke token ${label}` : "Flag without a token"}
      </h2>
      <div className="flex flex-col gap-1.5 rounded-xl bg-ground p-3.5 text-sm">
        <span>
          <strong>{flag.owner ? `@${flag.owner.handle}` : "Unknown owner"}</strong>
          {[flag.skill, tierLabel(flag.tier), flag.score !== null ? String(flag.score) : null]
            .filter(Boolean)
            .map((x) => ` · ${x}`)
            .join("")}
        </span>
        {(flag.evidenceHash || flag.mintedAt) && (
          <span className="font-mono text-xs text-ink-dim">
            {flag.evidenceHash ? `evidence ${truncate(flag.evidenceHash)}` : ""}
            {flag.evidenceHash && flag.mintedAt ? " · " : ""}
            {flag.mintedAt ? `minted ${shortDate(flag.mintedAt)}` : ""}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink-muted">Evidence we found</span>
        <ul className="m-0 pl-[18px] text-sm leading-[1.55]">
          <li>{flag.signal}</li>
          {flag.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>

      {!flag.tokenId ? (
        <StateCard
          tone="warning"
          label="Nothing to burn"
          title="No minted token is linked to this flag"
          body="The profile has no active token for this skill. Dismiss the flag, or wait for a mint and review again."
        />
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-[13px] text-ink-muted">
            Public reason (stored on-chain)
            <Textarea
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              aria-describedby="reason-hint"
            />
            <span id="reason-hint" className="text-xs text-ink-dim">
              {reason.trim().length}/{REASON_MAX}. Anyone can read this. No personal data.
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm leading-[1.45]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={busy}
              className="mt-0.5 size-[18px] shrink-0 accent-danger"
            />
            I understand this burns the token permanently and notifies the owner.
          </label>

          {!sbtReady ? (
            <StateCard tone="warning" label="Not deployed" title="KarmaSBT address missing" body="packages/shared/deployments.json has no SBT address." />
          ) : !isConnected ? (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-ink-muted">Connect the admin wallet to send the revoke transaction.</span>
              <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
            </div>
          ) : walletMismatch ? (
            <StateCard
              tone="warning"
              role="alert"
              label="Wrong wallet"
              title="Connected wallet isn't the signed-in admin"
              body={`Switch your wallet to ${truncate(admin)} to send the revoke.`}
            />
          ) : null}

          <Button variant="danger" size="lg" onClick={revoke} disabled={!canRevoke}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {busyText ?? "Revoke and burn"}
          </Button>

          <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
            {(phase.kind === "confirming" || phase.kind === "recording") && <TxLink hash={phase.hash} />}
            {phase.kind === "failed" && (
              <StateCard
                tone="error"
                role="alert"
                label="Transaction failed"
                title={phase.mined ? "Burned, not recorded" : "Token not revoked"}
                body={
                  <span className="flex flex-col gap-1.5">
                    <span>{phase.message}</span>
                    {phase.hash && <TxLink hash={phase.hash} />}
                  </span>
                }
                action={
                  phase.mined && phase.hash ? (
                    <Button variant="outline" onClick={() => record(phase.hash!)}>
                      Retry recording
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        </>
      )}

      <Button variant="outline" onClick={dismiss} disabled={busy || dismissing}>
        {dismissing && <Loader2 className="animate-spin" aria-hidden />} Dismiss flag
      </Button>
      <span className="text-xs leading-normal text-ink-dim">The admin key is separate from the minting relayer key.</span>
    </Card>
  );
}
