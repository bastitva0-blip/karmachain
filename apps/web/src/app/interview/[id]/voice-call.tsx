"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { api } from "@/lib/api";
import { fmtTime, type InterviewView, type SessionInfo } from "@/lib/interview-types";
import { cn } from "@/lib/utils";

interface Caption {
  who: "Karma" | "You";
  text: string;
}

export function VoiceCall({
  iv,
  session,
  onFallback,
  onDone,
}: {
  iv: InterviewView;
  session: SessionInfo;
  onFallback: (notice: string) => void;
  onDone: () => void;
}) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const convId = useRef<string | null>(null);
  const started = useRef(false);
  const endedRef = useRef(false);

  const finish = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEnding(true);
    if (convId.current) {
      await api(`/interviews/${iv.id}/ended`, { method: "POST", json: { conversationId: convId.current } }).catch(() => undefined);
      onDone();
    } else {
      onFallback("The voice line closed before it connected. Continuing in text, nothing lost.");
    }
  }, [iv.id, onDone, onFallback]);

  const conv = useConversation({
    onConnect: ({ conversationId }: { conversationId: string }) => {
      convId.current = conversationId;
      void api(`/interviews/${iv.id}/started`, { method: "POST", json: { conversationId } }).catch(() => undefined);
    },
    onMessage: ({ source, message }: { source: "user" | "ai"; message: string }) => {
      if (message) setCaptions((c) => [...c, { who: source === "ai" ? "Karma" : "You", text: message }]);
    },
    onDisconnect: () => void finish(),
    onError: (e: unknown) => {
      const msg = String((e as { message?: string })?.message ?? e);
      if (/quota|credit|limit|401|unauthor/i.test(msg)) {
        endedRef.current = true;
        onFallback("Voice quota reached. Switching to text, nothing lost.");
      }
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    conv.startSession({ signedUrl: session.signedUrl!, dynamicVariables: session.dynamicVariables });
  }, [conv, session]);

  useEffect(() => {
    if (conv.status !== "connected") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [conv.status]);

  // Hard stop at the cap even if the agent keeps talking.
  useEffect(() => {
    if (elapsed >= iv.maxSeconds && !endedRef.current) conv.endSession();
  }, [elapsed, iv.maxSeconds, conv]);

  const remaining = Math.max(0, iv.maxSeconds - elapsed);
  const speaking = conv.isSpeaking;
  const connecting = conv.status !== "connected" && !ending;
  const lastKarma = [...captions].reverse().find((c) => c.who === "Karma");
  const lastYou = [...captions].reverse().find((c) => c.who === "You");
  const status = ending ? "ENDING…" : connecting ? "CONNECTING…" : speaking ? "KARMA IS SPEAKING" : "LISTENING";
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <div className="flex min-h-dvh flex-col bg-ground-deep">
      <header className="flex items-center justify-between gap-4 border-b border-border-soft px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-0.5">
          <span className="display text-lg font-bold">{iv.roleTitle}</span>
          <span className="text-[13px] text-ink-dim">with Karma · recording</span>
        </div>
        <div
          role="timer"
          aria-label={`${mm} minutes ${ss} seconds left`}
          className="flex items-center gap-2.5 rounded-full border border-[#2A2638] bg-surface px-4 py-2"
        >
          <span aria-hidden className="size-2 rounded-full bg-live" />
          <span className={cn("font-mono text-base", remaining < 30 && "text-warning")}>{fmtTime(remaining).padStart(5, "0")}</span>
          <span className="hidden text-[13px] text-ink-dim sm:inline">left · hard stop</span>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-12 px-6 py-12">
        <div aria-hidden className="relative grid size-[280px] place-items-center">
          <div className="absolute inset-0 rounded-full border border-karma/20" />
          <div className="absolute inset-7 rounded-full border border-karma/35" />
          <div
            className={cn("size-44 rounded-full", speaking && "kc-orb", connecting && "opacity-60")}
            style={{
              background: "radial-gradient(circle at 35% 30%, #E4DBFF, #B9A6FF 40%, #5B3FD6 100%)",
              boxShadow: "0 0 80px #7C5CFF88",
            }}
          />
        </div>
        <span className="font-mono text-[13px] tracking-[0.08em] text-karma" aria-live="polite">
          {status}
        </span>

        <div aria-live="polite" className="flex w-full max-w-[760px] flex-col gap-3.5 text-center">
          {lastYou && <p className="m-0 text-[17px] leading-normal text-ink-dim">You: &ldquo;{lastYou.text}&rdquo;</p>}
          <p className="display m-0 text-[clamp(20px,3vw,28px)] font-medium leading-[1.35]">
            {lastKarma ? `“${lastKarma.text}”` : connecting ? "Setting up a secure voice line…" : "Karma will start in a moment."}
          </p>
        </div>

        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => conv.setMuted(!conv.isMuted)}
            aria-pressed={conv.isMuted}
            aria-label={conv.isMuted ? "Unmute microphone" : "Mute microphone"}
            className="grid size-16 place-items-center rounded-full border border-border-strong bg-surface text-ink hover:bg-surface-2"
          >
            {conv.isMuted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </button>
          <button
            type="button"
            onClick={() => conv.endSession()}
            disabled={ending}
            aria-label="End interview"
            className="flex h-16 items-center gap-2.5 rounded-full bg-danger px-7 font-semibold text-white hover:bg-[#cf3b40] disabled:opacity-60"
          >
            <PhoneOff className="size-[22px]" aria-hidden /> End
          </button>
        </div>
      </div>

      <details className="border-t border-border-soft px-6 py-4 text-sm sm:px-8">
        <summary className="cursor-pointer text-ink-dim">Full captions ({captions.length})</summary>
        <ol className="mt-3 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
          {captions.map((c, i) => (
            <li key={i}>
              <strong className={c.who === "Karma" ? "text-karma" : "text-tier-medium"}>{c.who}:</strong> {c.text}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
