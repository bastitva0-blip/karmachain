"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "radix-ui";
import { motion, useReducedMotion } from "motion/react";
import { Loader2, X } from "lucide-react";
import type { Tier } from "@karma/shared";
import { Button } from "@/components/ui/button";
import { TIER_LABEL } from "@/components/tier-badge";
import { TxLink, truncate } from "@/components/tx-link";
import { api, errorMessage } from "@/lib/api";

export interface MintSuccessInfo {
  tokenId: string;
  language: string;
  tier: Tier;
  score: number;
  wallet: string | null;
  txHash: string | null;
  handle: string;
}

/** Response of POST /verify/transfer-check (apps/api/src/routes/verify.ts). */
type TransferCheck =
  | { reverted: true; error: string; locked: boolean; owner: string; call: string; data: string }
  | { reverted: false; call: string };

const padId = (id: string) => id.padStart(4, "0");

function GoldSeal() {
  const reduce = useReducedMotion();
  return (
    <div className="relative size-[160px] sm:size-[200px]">
      {!reduce && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-tier-top"
          initial={{ scale: 0.6, opacity: 0.8 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut", delay: 0.5 }}
        />
      )}
      <motion.svg
        viewBox="0 0 64 64"
        aria-hidden
        className="size-full"
        initial={reduce ? false : { scale: 1.6, rotate: -14, opacity: 0 }}
        animate={reduce ? undefined : { scale: [1.6, 0.94, 1], rotate: [-14, 2, 0], opacity: [0, 1, 1] }}
        transition={{ duration: 0.9, times: [0, 0.6, 1], ease: [0.2, 0.8, 0.2, 1] }}
      >
        <circle cx="32" cy="32" r="30" fill="var(--tier-top)" />
        <circle cx="32" cy="32" r="25" fill="none" stroke="var(--tier-top-ink)" strokeWidth="1.2" strokeDasharray="2 3" />
        <path
          d="M24 17v30M24 35l15-18M30 29l11 18"
          stroke="var(--tier-top-ink)"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </motion.svg>
    </div>
  );
}

function TransferProof({ tokenId }: { tokenId: string }) {
  const [state, setState] = useState<{ status: "idle" | "busy" } | { status: "done"; r: TransferCheck } | { status: "error"; msg: string }>({
    status: "idle",
  });

  async function run() {
    setState({ status: "busy" });
    try {
      const r = await api<TransferCheck>("/verify/transfer-check", { method: "POST", json: { tokenId } });
      setState({ status: "done", r });
    } catch (e) {
      setState({ status: "error", msg: errorMessage(e) });
    }
  }

  // Shorten the addresses in `transferFrom(0x51ae…, 0xdead…, 61)` for display.
  const shortCall = (call: string) => call.replace(/0x[0-9a-fA-F]{40}/g, (a) => `${a.slice(0, 6)}…`);

  return (
    <section
      aria-labelledby="tt-h"
      className="mt-3 flex w-full flex-col gap-3.5 rounded-2xl border border-[#2A2638] bg-surface/80 p-6 text-left"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="tt-h" className="display m-0 text-xl font-bold">
            Prove it&apos;s soulbound
          </h2>
          <span className="text-sm text-ink-dim">Try sending it to another wallet. It will fail.</span>
        </div>
        <Button variant="outline" onClick={run} disabled={state.status === "busy"}>
          {state.status === "busy" && <Loader2 className="animate-spin" aria-hidden />}
          {state.status === "busy" ? "Simulating…" : state.status === "done" ? "Try again" : "Try to transfer"}
        </Button>
      </div>
      <div aria-live="polite">
        {state.status === "done" && state.r.reverted && (
          <div role="alert" className="flex flex-col gap-1.5 rounded-xl border border-error-border bg-error-bg px-4 py-3.5">
            <span className="break-words font-mono text-[13px] text-error">{shortCall(state.r.call)} → reverted</span>
            <span className="text-sm text-error-ink">This token is locked to you. Reputation can&apos;t be bought or sold.</span>
            <span className="font-mono text-xs text-ink-dim">
              {state.r.error} · locked = {String(state.r.locked)} · simulated with eth_call, nothing was sent
            </span>
          </div>
        )}
        {state.status === "done" && !state.r.reverted && (
          <div role="alert" className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3.5 text-sm text-warning-ink">
            The simulated transfer didn&apos;t revert. Please report this.
          </div>
        )}
        {state.status === "error" && (
          <div role="alert" className="rounded-xl border border-error-border bg-error-bg px-4 py-3.5 text-sm text-error-ink">
            Couldn&apos;t run the check: {state.msg}
          </div>
        )}
      </div>
    </section>
  );
}

/** Full-screen "SEALED · SOULBOUND" overlay shown after a successful mint. Radix Dialog gives focus trap + Esc. */
export function MintSuccess({ info, onClose }: { info: MintSuccessInfo | null; onClose: () => void }) {
  return (
    <Dialog.Root open={!!info} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ground-deep data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-0 z-50 overflow-y-auto bg-[radial-gradient(60%_60%_at_50%_35%,#2A1F4A,#07060B_70%)] focus:outline-none"
          aria-describedby="mint-success-desc"
        >
          {info && (
            <div className="flex min-h-full items-center justify-center px-4 py-12 sm:px-6">
              <Dialog.Close
                className="absolute right-4 top-4 grid size-10 place-items-center rounded-[10px] border border-border-strong text-ink hover:bg-surface-2"
                aria-label="Close"
              >
                <X className="size-4" aria-hidden />
              </Dialog.Close>
              <div className="flex w-full max-w-[760px] flex-col items-center gap-7 text-center">
                <GoldSeal />
                <div className="flex flex-col gap-2.5">
                  <span className="font-mono text-[13px] tracking-[0.08em] text-tier-top">SEALED · SOULBOUND #{padId(info.tokenId)}</span>
                  <Dialog.Title className="display m-0 text-[40px] font-extrabold leading-none sm:text-[56px]">
                    {info.language} · {TIER_LABEL[info.tier]}
                  </Dialog.Title>
                  <Dialog.Description id="mint-success-desc" className="m-0 text-[17px] text-ink-muted">
                    {info.score} / 100{info.wallet ? ` · minted to ${truncate(info.wallet)}` : ""} on Base Sepolia
                  </Dialog.Description>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button asChild size="lg">
                    <Link href={`/u/${encodeURIComponent(info.handle)}`}>See it on my profile</Link>
                  </Button>
                  {info.txHash && (
                    <Button asChild size="lg" variant="outline">
                      <TxLink hash={info.txHash} className="font-sans text-base" />
                    </Button>
                  )}
                  <Button asChild size="lg" variant="outline">
                    <Link href={`/feed?attach=${encodeURIComponent(`token:${info.tokenId}`)}`}>Post it</Link>
                  </Button>
                </div>
                <TransferProof tokenId={info.tokenId} />
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
