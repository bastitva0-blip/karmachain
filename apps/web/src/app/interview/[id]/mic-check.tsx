"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type MicState = "unknown" | "ok" | "denied";

const BARS = 7;

/** Requests the mic, shows the device name and a live 7-bar input level. Stops the stream on unmount. */
export function MicCheck({ onState }: { onState: (s: MicState) => void }) {
  const [state, setState] = useState<MicState>("unknown");
  const [device, setDevice] = useState<string>("");
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.2));
  const cleanup = useRef<() => void>(() => {});

  useEffect(() => () => cleanup.current(), []);

  async function test() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      setDevice(track?.label || "Default microphone");
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setLevels(Array.from({ length: BARS }, (_, i) => (i / BARS < avg * 2.2 ? 0.3 + 0.7 * Math.min(1, avg * 2.5) * (1 - Math.abs(i - 3) / 5) : 0.2)));
        raf = requestAnimationFrame(tick);
      };
      tick();
      cleanup.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      setState("ok");
      onState("ok");
    } catch {
      setState("denied");
      onState("denied");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {state === "unknown" && (
        <Button variant="outline" onClick={test} className="self-start">
          Test microphone
        </Button>
      )}
      {state === "ok" && (
        <>
          <div className="flex items-center gap-3">
            <span aria-hidden className="size-2.5 rounded-full bg-verified" />
            <span>{device}</span>
          </div>
          <div aria-label="Input level" role="img" className="flex h-8 items-end gap-1">
            {levels.map((l, i) => (
              <span
                key={i}
                className="w-1.5 rounded-sm transition-[height] duration-75"
                style={{ height: `${Math.round(l * 100)}%`, background: l > 0.25 ? "var(--verified)" : "#2A2638" }}
              />
            ))}
          </div>
        </>
      )}
      {state === "denied" && (
        <div role="alert" className="flex flex-col gap-1 rounded-xl border border-error-border bg-error-bg p-3.5">
          <span className="eyebrow text-error">Mic blocked</span>
          <span className="text-sm text-error-ink">Allow mic access in your browser bar, or choose text below.</span>
        </div>
      )}
    </div>
  );
}
