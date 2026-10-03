"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, StateCard } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { truncate } from "@/components/tx-link";
import { api, ApiError, errorMessage } from "@/lib/api";
import { reviveTyped, type ServerTypedData } from "@/lib/eas";
import { fmtTime } from "@/lib/interview-types";
import { cn } from "@/lib/utils";
import { CHAIN } from "@/lib/wagmi";

const MAX_SECONDS = 60;

interface Draft {
  rating: number;
  skillTag: string;
  summary: string;
  rating_inferred?: boolean;
}

type Outcome = { kind: "success"; url: string; uid: string } | { kind: "cancelled" } | { kind: "self"; message: string } | null;

export function ReviewFlow({ handle }: { handle: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();

  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stopRecording();
  }, [seconds, recording]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void upload(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
      };
      rec.current = mr;
      mr.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      toast.message("Microphone unavailable, so the text box is open instead.");
      setMode("text");
    }
  }

  function stopRecording() {
    if (rec.current?.state === "recording") rec.current.stop();
    setRecording(false);
  }

  async function upload(blob: Blob) {
    setBusy("Transcribing…");
    try {
      const form = new FormData();
      form.set("audio", blob, "review.webm");
      const res = await fetch("/api/voice/scribe", { method: "POST", body: form, credentials: "include" });
      const j = (await res.json()) as { transcript?: string; error?: { message: string } };
      if (!res.ok) throw new Error(j.error?.message ?? "Transcription failed");
      setTranscript(j.transcript ?? "");
      await structure(j.transcript ?? "");
    } catch (e) {
      toast.error(errorMessage(e));
      setMode("text");
    } finally {
      setBusy(null);
    }
  }

  async function structure(text: string) {
    if (text.trim().length < 5) {
      toast.error("Say or type a little more.");
      return;
    }
    setBusy("Structuring your review…");
    try {
      const r = await api<Draft>("/reviews/structure", { method: "POST", json: { transcript: text } });
      setTranscript(text);
      setDraft({ rating: r.rating, skillTag: r.skillTag, summary: r.summary, rating_inferred: r.rating_inferred });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!draft || !address) return;
    setBusy("Waiting for your signature…");
    setOutcome(null);
    const payload = { handle, clientAddress: address, rating: draft.rating, skillTag: draft.skillTag, summary: draft.summary, transcript, confirmed: true as const };
    try {
      const { typedData } = await api<{ typedData: ServerTypedData }>("/reviews/prepare", { method: "POST", json: payload });
      const signature = await signTypedDataAsync(reviveTyped(typedData) as Parameters<typeof signTypedDataAsync>[0]);
      setBusy("Publishing attestation…");
      const r = await api<{ url: string; uid: string }>("/reviews/submit", {
        method: "POST",
        json: { ...payload, signature, deadline: String(typedData.message.deadline) },
      });
      setOutcome({ kind: "success", url: r.url, uid: r.uid });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : errorMessage(e);
      if (/User rejected|denied/i.test(msg)) setOutcome({ kind: "cancelled" });
      else if (/review yourself/i.test(msg)) setOutcome({ kind: "self", message: msg });
      else toast.error(msg);
    } finally {
      setBusy(null);
    }
  }

  if (outcome?.kind === "success") {
    return (
      <div className="container-kc py-16">
        <StateCard
          className="mx-auto max-w-md"
          tone="success"
          role="status"
          label="Success"
          title="Review attested"
          body={`It now shows on @${handle}'s profile, signed by your wallet.`}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <a href={outcome.url} target="_blank" rel="noreferrer" className="font-mono text-[13px]">
                EAS {truncate(outcome.uid)} ↗
              </a>
              <Button asChild variant="outline" size="sm">
                <Link href={`/u/${handle}`}>Back to profile</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const step = !isConnected ? 1 : !transcript && !draft ? 2 : draft ? 3 : 2;
  const pills = ["Wallet", "Record", "Edit", "Confirm & sign"];
  const wrongNet = isConnected && chainId !== CHAIN.id;

  return (
    <div className="container-kc flex flex-col gap-8 pb-24 pt-12">
      <div className="flex flex-col gap-2">
        <Eyebrow>Client review</Eyebrow>
        <h1 className="display m-0 text-[40px] font-extrabold leading-tight">Vouch for @{handle}</h1>
        <p className="m-0 text-ink-muted">Your review is signed by your wallet and stored as a permanent attestation. We pay the gas.</p>
      </div>

      <ol aria-label="Steps" className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm">
        {pills.map((p, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <li
              key={p}
              aria-current={current ? "step" : undefined}
              className={cn("rounded-full border px-3.5 py-2", current ? "border-karma bg-surface-2" : "border-border text-ink-dim")}
            >
              {done ? "✓" : n} {p}
            </li>
          );
        })}
      </ol>

      {outcome?.kind === "cancelled" && (
        <StateCard
          label="Signature cancelled"
          title="Nothing was published"
          action={
            <Button variant="outline" onClick={sign}>
              Sign again
            </Button>
          }
        />
      )}
      {outcome?.kind === "self" && (
        <StateCard tone="error" role="alert" label="Self-review blocked" title={`This wallet belongs to @${handle}`} body="Ask a client to leave the review." />
      )}

      {(!isConnected || wrongNet) && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex flex-col gap-1">
            <Eyebrow>Step 1 · wallet</Eyebrow>
            <span className="text-ink-muted">{wrongNet ? "Switch to Base Sepolia to sign." : "Connect the wallet you'll sign with."}</span>
          </div>
          {wrongNet ? (
            <Button onClick={() => switchChain({ chainId: CHAIN.id })}>Switch network</Button>
          ) : (
            <ConnectButton showBalance={false} chainStatus="icon" />
          )}
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="flex flex-col items-center gap-5 p-7 text-center">
          <Eyebrow className="self-start">Step 2 · {mode === "voice" ? "record" : "write"}</Eyebrow>
          {mode === "voice" ? (
            <>
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={!!busy}
                aria-label={recording ? "Stop recording" : "Start recording"}
                aria-pressed={recording}
                className={cn(
                  "grid size-[120px] place-items-center rounded-full bg-danger text-white disabled:opacity-60",
                  recording && "shadow-[0_0_0_12px_#E5484D22]",
                )}
              >
                {recording ? <span className="size-[34px] rounded-md bg-white" /> : <span className="size-10 rounded-full bg-white" />}
              </button>
              <span className="font-mono text-[22px]" aria-live="polite">
                {fmtTime(seconds)} <span className="text-sm text-ink-dim">/ {fmtTime(MAX_SECONDS)}</span>
              </span>
              <p className="m-0 max-w-[340px] leading-normal text-ink-muted">Say what you hired them for, how it went, and a rating out of 5.</p>
              <Button variant="outline" onClick={() => setMode("text")} disabled={recording}>
                Type instead
              </Button>
            </>
          ) : (
            <div className="flex w-full flex-col gap-3 text-left">
              <Label>
                What was it like working with @{handle}?
                <Textarea rows={5} maxLength={4000} value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Label>
              <div className="flex flex-wrap gap-2.5">
                <Button onClick={() => structure(typed)} disabled={!!busy || typed.trim().length < 5}>
                  Continue
                </Button>
                <Button variant="outline" onClick={() => setMode("voice")}>
                  Speak instead
                </Button>
              </div>
            </div>
          )}
          {busy && (
            <p className="m-0 flex items-center gap-2 text-sm text-ink-dim" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {busy}
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-[18px] p-7">
          <Eyebrow>Step 3 · check what we heard</Eyebrow>
          {!draft ? (
            <p className="m-0 text-ink-dim">Record or type your review and we&apos;ll structure it here for you to edit. Nothing is published until you sign.</p>
          ) : (
            <>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-1.5 text-[13px] text-ink-muted">
                  Rating {draft.rating_inferred && <span className="text-warning">(inferred, please confirm)</span>}
                </legend>
                <div className="flex" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={draft.rating === n}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      onClick={() => setDraft({ ...draft, rating: n, rating_inferred: false })}
                      className={cn("size-11 text-[28px]", n <= draft.rating ? "text-tier-top" : "text-border-strong")}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </fieldset>
              <Label>
                Skill
                <Input maxLength={40} value={draft.skillTag} onChange={(e) => setDraft({ ...draft, skillTag: e.target.value })} />
              </Label>
              <Label>
                Summary
                <Textarea rows={4} maxLength={280} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
                <span className="self-end text-ink-dim">{draft.summary.length} / 280</span>
              </Label>
              {transcript && (
                <details>
                  <summary className="cursor-pointer text-sm text-ink-dim">Show full transcript</summary>
                  <p className="text-sm leading-normal text-ink-muted">&ldquo;{transcript}&rdquo;</p>
                </details>
              )}
              <Button
                size="lg"
                onClick={sign}
                disabled={!isConnected || wrongNet || !!busy || !draft.skillTag.trim() || !draft.summary.trim()}
                title={isConnected ? undefined : "Connect a wallet first"}
              >
                {busy && <Loader2 className="animate-spin" aria-hidden />} Looks right, sign with wallet
              </Button>
              <p className="m-0 text-xs text-ink-dim">Signing publishes a permanent, public attestation from your wallet.</p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
