"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TranscriptTurn } from "@karma/shared";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { fmtTime, type InterviewView } from "@/lib/interview-types";

/** Fallback interview: same plan, NVIDIA LLM as interviewer, browser speechSynthesis for audio. */
export function TextInterview({ iv, notice, onDone }: { iv: InterviewView; notice: string | null; onDone: () => void }) {
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(false);
  const startAt = useRef(Date.now());
  const feed = useRef<HTMLDivElement>(null);
  const speakRef = useRef(speak);
  speakRef.current = speak;

  const say = (text: string, force = false) => {
    if ((!speakRef.current && !force) || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  async function agentTurn(history: TranscriptTurn[]) {
    setBusy(true);
    try {
      const r = await api<{ message: string; ended: boolean }>(`/interviews/${iv.id}/text-turn`, { method: "POST", json: { transcript: history } });
      const next = [...history, { role: "agent" as const, message: r.message, t: Math.round((Date.now() - startAt.current) / 1000) }];
      setTurns(next);
      say(r.message);
      if (r.ended) await complete(next);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function complete(history: TranscriptTurn[]) {
    if (finishing) return;
    setFinishing(true);
    try {
      await api(`/interviews/${iv.id}/text-complete`, { method: "POST", json: { transcript: history } });
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
      setFinishing(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void api(`/interviews/${iv.id}/started`, { method: "POST", json: {} }).catch(() => undefined);
    void agentTurn([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (elapsed >= iv.maxSeconds && turns.length > 1 && !finishing) void complete(turns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next = [...turns, { role: "user" as const, message: text, t: Math.round((Date.now() - startAt.current) / 1000) }];
    setTurns(next);
    await agentTurn(next);
  }

  const remaining = Math.max(0, iv.maxSeconds - elapsed);

  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-soft px-6 py-4 sm:px-8">
        <div className="flex flex-col gap-0.5">
          <span className="display text-lg font-bold">{iv.roleTitle} · text mode</span>
          <span className="text-[13px] text-ink-dim">Same questions as the voice interview</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} className="size-[18px] accent-[var(--karma)]" />
            Read questions aloud
          </label>
          <span role="timer" aria-label={`${fmtTime(remaining)} left`} className="rounded-full border border-[#2A2638] bg-surface px-3.5 py-2 font-mono">
            {fmtTime(remaining).padStart(5, "0")}
          </span>
          <Button onClick={() => complete(turns)} disabled={finishing || turns.length < 2}>
            {finishing && <Loader2 className="animate-spin" aria-hidden />} Finish
          </Button>
        </div>
      </header>

      {notice && (
        <div role="status" className="border-b border-warning-border bg-warning-bg px-6 py-3 text-center font-mono text-xs text-warning">
          {notice}
        </div>
      )}

      <div ref={feed} aria-live="polite" className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-4 overflow-y-auto px-6 py-8">
        {turns.map((t, i) =>
          t.role === "agent" ? (
            <div key={i} className="flex max-w-[75%] flex-col gap-2 self-start rounded-[14px_14px_14px_4px] bg-surface-2 px-4 py-3.5 leading-[1.55]">
              <span>
                <span className="sr-only">Karma: </span>
                {t.message}
              </span>
              <Button variant="outline" size="sm" className="h-8 self-start text-[13px]" onClick={() => say(t.message, true)} aria-label="Replay question audio">
                ▶ Replay
              </Button>
            </div>
          ) : (
            <div key={i} className="max-w-[75%] self-end rounded-[14px_14px_4px_14px] bg-karma px-4 py-3.5 leading-[1.55] text-ground">
              <span className="sr-only">You: </span>
              {t.message}
            </div>
          ),
        )}
        {busy && <Loader2 className="size-4 animate-spin text-ink-dim" aria-label="Karma is typing" />}
      </div>

      <form onSubmit={send} className="mx-auto flex w-full max-w-[860px] gap-2.5 px-6 pb-8">
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <textarea
          id="answer"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) void send(e);
          }}
          placeholder="Type your answer…"
          disabled={busy || finishing}
          className="h-[88px] flex-1 resize-none rounded-xl border border-border-strong bg-surface p-3.5 text-[15px] text-ink placeholder:text-ink-dim"
        />
        <Button type="submit" className="self-end" disabled={busy || finishing || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
