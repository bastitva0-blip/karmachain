"use client";

import { useRef, useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";

/** 20-second spoken profile summary. ElevenLabs TTS (cached server-side), browser voice as fallback. */
export function HearBrief({ handle, compact = false }: { handle: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [caption, setCaption] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function stop() {
    audioRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
  }

  async function play() {
    if (state === "playing") return stop();
    setState("loading");
    try {
      const { text, audio } = await api<{ text: string; audio: boolean }>(`/voice/brief/${encodeURIComponent(handle)}?format=text`);
      setCaption(text);
      if (audio) {
        const el = new Audio(`/api/voice/brief/${encodeURIComponent(handle)}?format=audio`);
        audioRef.current = el;
        el.onended = () => setState("idle");
        try {
          await el.play();
          setState("playing");
          return;
        } catch {
          // fall through to browser speech
        }
      }
      const u = new SpeechSynthesisUtterance(text);
      u.onend = () => setState("idle");
      window.speechSynthesis.speak(u);
      setState("playing");
    } catch (e) {
      toast.error(errorMessage(e));
      setState("idle");
    }
  }

  return (
    <div className={compact ? "relative" : "flex flex-col items-end gap-2"}>
      <Button
        variant="outline"
        size={compact ? "icon" : "default"}
        className={compact ? "size-10" : undefined}
        onClick={play}
        aria-pressed={state === "playing"}
        aria-label={compact ? (state === "playing" ? "Stop brief" : "Hear brief") : undefined}
      >
        {state === "loading" ? <Loader2 className="animate-spin" aria-hidden /> : state === "playing" ? <Square aria-hidden /> : <Volume2 aria-hidden />}
        {!compact && (state === "playing" ? "Stop brief" : "Hear brief")}
      </Button>
      {caption && state === "playing" && (
        <p
          aria-live="polite"
          className={
            compact
              ? "absolute bottom-12 right-0 z-10 m-0 w-72 rounded-xl border border-border bg-surface p-3 text-sm text-ink-muted shadow-xl"
              : "m-0 max-w-sm rounded-xl border border-border bg-surface p-3 text-sm text-ink-muted"
          }
        >
          {caption}
        </p>
      )}
    </div>
  );
}
