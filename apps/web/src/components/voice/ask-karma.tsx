"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Dialog } from "radix-ui";
import { Loader2, Mic, PhoneOff, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  NotFoundNote,
  ToolTrace,
  Transcript,
  VoiceBars,
  parseTrust,
  type Line,
  type ToolCall,
} from "./voice-parts";

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

/**
 * Floating "Ask Karma": a pill that opens a modal voice panel. Voice runs on an ElevenLabs agent
 * (signed URL from our API; its server tool reads on-chain data). A typed question works without
 * voice and hits the same trust lookup. Captions, a tool trace and a timestamped transcript for
 * every answer.
 */
export function AskKarma({ defaultHandle }: { defaultHandle?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full bg-karma pl-4 pr-[22px] text-[15px] font-semibold text-ground shadow-[0_12px_32px_-8px_#7C5CFF99] hover:bg-karma-hover sm:bottom-8 sm:right-8"
      >
        <MicIcon className="size-[22px]" /> Ask Karma
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ground-deep/80 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="ak-desc"
          className="fixed inset-0 z-50 overflow-y-auto outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          {/* Provider lives inside the content, so closing the dialog tears the session down. */}
          <ConversationProvider>
            <Panel defaultHandle={defaultHandle} onClose={() => setOpen(false)} />
          </ConversationProvider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Phase = "idle" | "connecting" | "ready" | "listening" | "checking" | "answering" | "error";

const STATUS: Record<Phase, string> = {
  idle: "Hold to ask",
  connecting: "Connecting…",
  ready: "Karma is listening for you",
  listening: "Listening",
  checking: "Karma is checking",
  answering: "Karma is answering",
  error: "Voice unavailable",
};

const NOT_FOUND_RE = /couldn['’]?t find|could not find|no (?:such )?profile/i;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

function Panel({ defaultHandle, onClose }: { defaultHandle?: string; onClose: () => void }) {
  // Panel-open time for transcript timestamps; set lazily on the first line (no Date.now in render).
  const t0 = useRef<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState(defaultHandle ? `Is ${defaultHandle} legit?` : "");
  const [typedBusy, setTypedBusy] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  /** Mic is open only while the button (or Space) is held. */
  const [holding, setHolding] = useState(false);

  const add = useCallback((who: Line["who"], msg: string) => {
    const now = Date.now();
    t0.current ??= now;
    const at = now - t0.current;
    setLines((x) => [...x, { who, text: msg, at }]);
    if (who === "You") setNotFound(false);
    else if (NOT_FOUND_RE.test(msg)) setNotFound(true);
  }, []);

  const conv = useConversation({
    micMuted: !holding,
    onMessage: ({ role, message }) => {
      if (message) add(role === "agent" ? "Karma" : "You", message);
    },
    // Real tool events from the SDK (Callbacks.onAgentToolRequest / onAgentToolResponse).
    // The request carries only the tool name, not its arguments; the arguments shown are
    // read back from the result (its `handle`) when the agent forwards the full payload.
    onAgentToolRequest: (r) => {
      if (r.tool_type === "system") return;
      setCalls((x) => [
        ...x,
        { id: r.tool_call_id, name: r.tool_name, source: "voice", startedAt: Date.now(), status: "pending" },
      ]);
    },
    onAgentToolResponse: (r) => {
      if (r.tool_type === "system") return;
      const result = "full_tool_result" in r ? parseTrust(r.full_tool_result) : undefined;
      if (result && !result.found) setNotFound(true);
      setCalls((x) =>
        x.map((c) =>
          c.id !== r.tool_call_id
            ? c
            : {
                ...c,
                ms: c.ms ?? Date.now() - c.startedAt,
                status: r.is_error ? "error" : "ok",
                result: result ?? c.result,
                args: result?.handle ? { handle: result.handle } : c.args,
              },
        ),
      );
    },
    onDisconnect: (d) => {
      setHolding(false);
      if (d.reason === "error") setVoiceError(d.message || "The voice connection dropped.");
    },
    onError: (message) => {
      setHolding(false);
      setVoiceError(message || "Voice ran into a problem.");
    },
  });

  const { status, isSpeaking, endSession, startSession } = conv;
  const connected = status === "connected";

  const startVoice = useCallback(async () => {
    setVoiceError(null);
    setFetching(true);
    try {
      const s = await api<{ fallback: boolean; reason?: string; signedUrl?: string }>("/voice/verify-session");
      if (s.fallback || !s.signedUrl) {
        setVoiceError(
          s.reason === "quota" ? "Voice quota is used up for now." : "Voice is offline right now.",
        );
        setHolding(false);
        return;
      }
      startSession({ signedUrl: s.signedUrl });
    } catch (e) {
      setHolding(false);
      setVoiceError(errorMessage(e));
    } finally {
      setFetching(false);
    }
  }, [startSession]);

  const beginHold = useCallback(() => {
    if (voiceError) {
      document.getElementById("ak-input")?.focus();
      return;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setHolding(true);
    if (status === "disconnected" && !fetching) void startVoice();
  }, [voiceError, status, fetching, startVoice]);

  const endHold = useCallback(() => setHolding(false), []);

  useEffect(() => {
    t0.current = Date.now();
  }, []);

  // Releasing focus from the window (alt-tab while holding) closes the mic.
  useEffect(() => {
    window.addEventListener("blur", endHold);
    return () => window.removeEventListener("blur", endHold);
  }, [endHold]);

  // Closing the panel ends the session and any spoken typed answer.
  useEffect(
    () => () => {
      try {
        endSession();
      } catch {
        /* not connected */
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [endSession],
  );

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || typedBusy) return;
    setText("");
    // Live session: send the text into the same conversation (the agent's tool trace still fires).
    if (connected) {
      add("You", q);
      conv.sendUserMessage(q);
      return;
    }
    add("You", q);
    setTypedBusy(true);
    const id = `typed-${Date.now()}`;
    const startedAt = Date.now();
    setCalls((x) => [
      ...x,
      { id, name: "get_developer_trust", source: "typed", startedAt, status: "pending", args: { question: q } },
    ]);
    try {
      const r = await api<{ found: boolean; spoken_summary: string }>("/voice/verify-text", {
        method: "POST",
        json: { question: q },
      });
      const result = parseTrust(r);
      setCalls((x) =>
        x.map((c) =>
          c.id === id
            ? { ...c, status: "ok", ms: Date.now() - startedAt, result, args: result?.handle ? { handle: result.handle } : c.args }
            : c,
        ),
      );
      add("Karma", r.spoken_summary);
      if (result && !result.found) setNotFound(true);
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(r.spoken_summary);
        u.onend = () => setTtsSpeaking(false);
        u.onerror = () => setTtsSpeaking(false);
        setTtsSpeaking(true);
        window.speechSynthesis.speak(u);
      }
    } catch (err) {
      setCalls((x) => x.map((c) => (c.id === id ? { ...c, status: "error", ms: Date.now() - startedAt } : c)));
      add("Karma", `Sorry, that lookup failed: ${errorMessage(err)}`);
    } finally {
      setTypedBusy(false);
    }
  }

  const pending = calls.some((c) => c.status === "pending");
  const phase: Phase = typedBusy || pending
    ? "checking"
    : (connected && isSpeaking) || ttsSpeaking
      ? "answering"
      : voiceError
        ? "error"
        : fetching || status === "connecting"
          ? "connecting"
          : connected
            ? holding
              ? "listening"
              : "ready"
            : "idle";

  const lastYou = [...lines].reverse().find((l) => l.who === "You");
  const lastKarma = [...lines].reverse().find((l) => l.who === "Karma");
  const example = defaultHandle ? `Is ${defaultHandle} legit?` : "Is github.com/octocat legit?";

  const holdLabel = voiceError
    ? "Voice unavailable · type below"
    : holding
      ? "Listening… release to send"
      : "Hold to talk · or press Space";

  return (
    <div
      onKeyDown={(e) => {
        if (e.key !== " " || isTypingTarget(e.target)) return;
        e.preventDefault();
        if (!e.repeat) beginHold();
      }}
      onKeyUp={(e) => {
        if (e.key !== " " || isTypingTarget(e.target)) return;
        e.preventDefault();
        endHold();
      }}
      onPointerDown={(e) => {
        // Pointer on the backdrop gap (not a card) closes, like an overlay click.
        if (e.target === e.currentTarget) onClose();
      }}
      className="mx-auto grid min-h-full max-w-[1040px] grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] items-start gap-6 px-4 py-12 sm:px-6"
      >
        {/* ---- main voice card ---- */}
        <div className="flex flex-col gap-6 rounded-[20px] border border-border bg-surface p-6 shadow-[0_40px_80px_-30px_#000] sm:p-8">
          <div className="flex items-center justify-between">
            <Dialog.Title className="display m-0 text-[26px] font-bold">Ask Karma</Dialog.Title>
            <Dialog.Close
              aria-label="Close Ask Karma"
              className="grid size-10 place-items-center rounded-[10px] border border-border-strong text-ink hover:bg-surface-2"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <VoiceBars
            level={
              phase === "answering" || phase === "listening"
                ? "active"
                : phase === "checking" || phase === "connecting"
                  ? "slow"
                  : "still"
            }
          />
          <span
            role="status"
            className={cn(
              "text-center font-mono text-[13px] uppercase tracking-[0.08em]",
              phase === "error" ? "text-error" : phase === "listening" ? "text-live" : "text-karma",
            )}
          >
            {phase === "connecting" && <Loader2 aria-hidden className="mr-1.5 inline size-3.5 animate-spin" />}
            {STATUS[phase]}
          </span>

          <div aria-live="polite" className="flex flex-col gap-3.5">
            {lastYou && <p className="m-0 text-ink-dim">You: &ldquo;{lastYou.text}&rdquo;</p>}
            {lastKarma ? (
              <p className="display m-0 text-lg font-medium leading-[1.4] sm:text-[22px]">&ldquo;{lastKarma.text}&rdquo;</p>
            ) : (
              !lastYou && (
                <p className="m-0 text-ink-muted">
                  Hold the button and ask, e.g. &ldquo;{example}&rdquo;. Karma looks it up and tells you what&rsquo;s
                  verified.
                </p>
              )
            )}
          </div>

          {voiceError && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-error-border bg-error-bg p-4 text-sm text-error-ink sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{voiceError} Type your question below. Same on-chain answer.</span>
              <Button variant="destructive" size="sm" onClick={() => setVoiceError(null)}>
                <RotateCcw aria-hidden /> Retry voice
              </Button>
            </div>
          )}

          <button
            type="button"
            aria-pressed={holding}
            aria-disabled={!!voiceError}
            aria-describedby="ak-hold-hint"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              beginHold();
            }}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onLostPointerCapture={endHold}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => {
              // Keyboard / assistive tech activation (no pointer): toggle instead of hold.
              if (e.detail !== 0) return;
              if (holding) endHold();
              else beginHold();
            }}
            className={cn(
              "flex h-16 touch-none select-none items-center justify-center gap-2.5 rounded-full text-base font-semibold transition-colors",
              voiceError
                ? "cursor-not-allowed bg-surface-2 text-ink-dim"
                : holding
                  ? "bg-live text-ground"
                  : "bg-karma text-ground hover:bg-karma-hover",
            )}
          >
            <MicIcon className="size-[22px]" />
            {holdLabel}
          </button>
          <span id="ak-hold-hint" className="sr-only">
            Press and hold to speak, release to send. With the keyboard, hold Space, or press Enter to start and again
            to stop.
          </span>

          <form onSubmit={ask} className="flex gap-2">
            <label htmlFor="ak-input" className="sr-only">
              Type a question for Karma
            </label>
            <Input
              id="ak-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Or type a GitHub handle or question"
              maxLength={300}
              autoComplete="off"
            />
            <Button type="submit" size="icon" disabled={typedBusy || !text.trim()} aria-label="Ask">
              {typedBusy ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </form>

          {(connected || status === "connecting") && (
            <Button variant="ghost" size="sm" onClick={() => endSession()} className="self-center text-ink-muted">
              <PhoneOff aria-hidden /> End voice session
            </Button>
          )}

          <p id="ak-desc" className="m-0 text-center text-[13px] text-ink-dim">
            Answers come only from on-chain data. Tokens show verified work, not character.
          </p>
        </div>

        {/* ---- side column ---- */}
        <div className="flex flex-col gap-4">
          {notFound && <NotFoundNote />}
          <ToolTrace calls={calls} />
          <Transcript lines={lines} />
          {phase === "idle" && lines.length === 0 && (
            <p className="m-0 flex items-center gap-2 text-[13px] text-ink-dim">
              <Mic aria-hidden className="size-3.5" /> Your browser asks for the microphone the first time you hold.
            </p>
          )}
        </div>
    </div>
  );
}
