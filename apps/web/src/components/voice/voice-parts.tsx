"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/* ---------- shared types ---------- */

export interface Line {
  who: "Karma" | "You";
  text: string;
  /** ms since the panel opened */
  at: number;
}

/** Compact view of the trust tool result (TrustData from apps/api/src/voice/tools.ts). */
export interface TrustSummary {
  found: boolean;
  handle?: string;
  skills?: number;
  attestations?: number;
  isDemo?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  /** "voice" = ElevenLabs server tool; "typed" = our public /voice/verify-text endpoint */
  source: "voice" | "typed";
  startedAt: number;
  ms?: number;
  status: "pending" | "ok" | "error";
  args?: Record<string, string>;
  /** Undefined when the agent did not forward the tool result to the browser. */
  result?: TrustSummary;
}

/** Narrow an unknown tool result (JSON string or object) into a TrustSummary. Never throws. */
export function parseTrust(raw: unknown): TrustSummary | undefined {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.found !== "boolean") return undefined;
  const att = o.attestations as Record<string, unknown> | undefined;
  const attCount =
    att && typeof att === "object"
      ? (typeof att.client_reviews === "number" ? att.client_reviews : 0) +
        (typeof att.interview_results === "number" ? att.interview_results : 0)
      : undefined;
  return {
    found: o.found,
    handle: typeof o.handle === "string" ? o.handle : undefined,
    skills: Array.isArray(o.skills) ? o.skills.length : undefined,
    attestations: attCount,
    isDemo: typeof o.demo_profile === "boolean" ? o.demo_profile : undefined,
  };
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------- bars ---------- */

const DELAYS = [0, 0.1, 0.2, 0.3, 0.15, 0.25, 0.05];

/** Seven animated bars. `level` picks the motion: still, slow (checking) or full (talking). */
export function VoiceBars({ level }: { level: "still" | "slow" | "active" }) {
  const reduce = useReducedMotion();
  const animate = !reduce && level !== "still";
  return (
    <div aria-hidden className="flex h-20 items-center justify-center gap-1.5">
      {DELAYS.map((d, i) => (
        <motion.span
          key={i}
          className={cn("h-10 w-1.5 origin-center rounded-[3px]", level === "still" ? "bg-border-strong" : "bg-karma")}
          initial={false}
          animate={animate ? { scaleY: [0.3, 1, 0.3] } : { scaleY: level === "still" ? 0.3 : 0.6 }}
          transition={
            animate
              ? { duration: level === "slow" ? 1.8 : 1, ease: "easeInOut", repeat: Infinity, delay: d }
              : { duration: 0.2 }
          }
        />
      ))}
    </div>
  );
}

/* ---------- tool trace ---------- */

function argsText(args: Record<string, string>): string {
  return `{ ${Object.entries(args)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ")} }`;
}

function resultLines(c: ToolCall): string[] {
  if (c.status === "pending") return ["← checking…"];
  if (c.status === "error") return ["← error · no data returned"];
  const r = c.result;
  if (!r) return ["← returned · result kept server-side"];
  if (!r.found) return ["← found: false"];
  const second = [
    r.attestations !== undefined ? `attestations: ${r.attestations}` : null,
    r.isDemo !== undefined ? `is_demo: ${r.isDemo}` : null,
  ].filter(Boolean);
  return [
    `← found: true${r.skills !== undefined ? ` · skills: ${r.skills}` : ""}`,
    ...(second.length ? [`  ${second.join(" · ")}`] : []),
  ];
}

export function ToolTrace({ calls }: { calls: ToolCall[] }) {
  const latest = calls.slice(-3);
  return (
    <section aria-labelledby="ak-trace" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-[22px]">
      <h2 id="ak-trace" className="eyebrow m-0 font-normal">
        What Karma checked
      </h2>
      {latest.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-dim">
          Nothing yet. Every lookup Karma makes shows up here, so you can see where an answer came from.
        </p>
      ) : (
        latest.map((c) => (
          <div key={c.id} className="flex flex-col gap-2">
            <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] bg-ground p-3.5 font-mono text-[13px] leading-relaxed text-[#C9C4D6]">
              {[`→ ${c.name}`, ...(c.args ? [`  ${argsText(c.args)}`] : []), ...resultLines(c)].join("\n")}
            </pre>
            <span className="text-[13px] text-ink-dim">
              {c.source === "voice" ? "Server tool · secret-authenticated" : "Typed question · public endpoint"}
              {c.ms !== undefined ? ` · ${c.ms} ms` : ""}
            </span>
          </div>
        ))
      )}
    </section>
  );
}

/* ---------- transcript ---------- */

export function Transcript({ lines }: { lines: Line[] }) {
  return (
    <section aria-labelledby="ak-transcript" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-[22px]">
      <h2 id="ak-transcript" className="eyebrow m-0 font-normal">
        Transcript
      </h2>
      {lines.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-dim">The full conversation appears here, with timestamps.</p>
      ) : (
        <ol className="m-0 flex max-h-72 list-none flex-col gap-2.5 overflow-y-auto p-0 text-sm leading-normal">
          {lines.map((l, i) => (
            <li key={i}>
              <span className="font-mono text-ink-dim">{mmss(l.at)}</span>{" "}
              <strong className={l.who === "You" ? "text-tier-medium" : "text-ink"}>{l.who}</strong> {l.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------- not found ---------- */

export function NotFoundNote() {
  return (
    <section
      role="status"
      className="flex flex-col gap-1.5 rounded-2xl border border-warning-border bg-warning-bg p-[18px]"
    >
      <span className="font-mono text-xs uppercase tracking-[0.06em] text-warning">Not found</span>
      <span className="text-sm text-warning-ink">
        &ldquo;I couldn&rsquo;t find that profile.&rdquo; Karma never guesses. Check the spelling, or paste the
        github.com link.
      </span>
    </section>
  );
}
