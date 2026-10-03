"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Logo } from "@/components/brand/Logo";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DEMO_HANDLE, FALLBACK, fromProfile } from "./demo-data";
import { DemoStep, STEP_NAMES } from "./steps";

const COUNT = STEP_NAMES.length;

function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

export function DemoView() {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();

  // Live data is a bonus: any failure (API down, demo not seeded) leaves the mockup copy in place.
  const q = useQuery({
    queryKey: ["profile", DEMO_HANDLE],
    queryFn: () => api<Profile>(`/profile/${DEMO_HANDLE}`),
    retry: false,
    staleTime: 60_000,
  });
  const data = q.data && q.data.user.isDemo ? fromProfile(q.data) : FALLBACK;

  const prev = useCallback(() => setI((k) => Math.max(0, k - 1)), []);
  const next = useCallback(() => setI((k) => (k === COUNT - 1 ? 0 : k + 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isTypingTarget(e.target)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setI((k) => Math.min(COUNT - 1, k + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev]);

  const last = i === COUNT - 1;

  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      <header className="border-b border-border-soft">
        <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-ink no-underline" aria-label="KarmaChain home">
            <Logo />
            <span className="hidden rounded-full bg-surface-2 px-2.5 py-[3px] text-xs font-semibold text-karma sm:inline-flex">Guided demo</span>
          </Link>
          <span className="hidden text-sm text-ink-dim md:inline">Pre-filled with demo data · nothing is written on-chain</span>
          <Link href="/" className="text-sm text-ink-dim hover:text-ink">
            Exit demo
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1320px] grow items-start gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Demo steps" className="flex min-w-0 flex-col gap-1 lg:sticky lg:top-6">
          <span className="eyebrow px-3 pb-2.5">{COUNT} steps · ~3 min</span>
          <ol className="m-0 flex list-none gap-1 overflow-x-auto p-0 pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {STEP_NAMES.map((name, k) => (
              <li key={name} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setI(k)}
                  aria-current={k === i ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[10px] border border-transparent bg-transparent px-3 py-2.5 text-left text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-karma",
                    k === i && "border-karma bg-surface-2 text-ink",
                    k < i && "text-ink",
                  )}
                >
                  <span className="w-[22px] font-mono text-xs">{String(k + 1).padStart(2, "0")}</span>
                  <span className="whitespace-nowrap">{name}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <div
            role="progressbar"
            aria-label="Demo progress"
            aria-valuemin={1}
            aria-valuemax={COUNT}
            aria-valuenow={i + 1}
            aria-valuetext={`Step ${i + 1} of ${COUNT}: ${STEP_NAMES[i]}`}
            className="h-1 rounded-full bg-border-soft"
          >
            <div className="h-full rounded-full bg-karma transition-[width] duration-400 motion-reduce:transition-none" style={{ width: `${((i + 1) / COUNT) * 100}%` }} />
          </div>

          <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
            <span className="rounded-full border border-border-strong px-2 py-[2px] font-semibold text-ink-muted">Demo</span>
            <span>
              Persona: {data.name} · @{data.handle}
            </span>
            <span aria-hidden>·</span>
            <span>{q.isLoading ? "Loading live data…" : data.live ? "Live data from the demo profile" : "Sample data (live profile unavailable)"}</span>
          </p>

          <p className="sr-only" aria-live="polite">
            Step {i + 1} of {COUNT}: {STEP_NAMES[i]}
          </p>

          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={i}
              aria-label={`Step ${i + 1}: ${STEP_NAMES[i]}`}
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
              transition={reduce ? { duration: 0 } : { duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <DemoStep index={i} data={data} />
            </motion.section>
          </AnimatePresence>

          <div className="flex items-center justify-between gap-4 border-t border-border-soft pt-2">
            <button
              type="button"
              onClick={prev}
              disabled={i === 0}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-border-strong bg-transparent px-5 text-[15px] font-semibold text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-karma disabled:opacity-40"
            >
              ← Back
            </button>
            <span className="font-mono text-[13px] text-ink-dim">
              {i + 1} / {COUNT}
            </span>
            <button
              type="button"
              onClick={next}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-karma px-5 text-[15px] font-semibold text-ground hover:bg-karma-hover focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-karma"
            >
              {last ? "Start over" : "Next →"}
            </button>
          </div>
          <p className="m-0 hidden text-center text-xs text-ink-dim sm:block">Tip: use the ← → arrow keys to step through.</p>
        </div>
      </div>
    </div>
  );
}
