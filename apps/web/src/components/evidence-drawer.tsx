"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import { truncate } from "./tx-link";
import { api, errorMessage } from "@/lib/api";
import type { Components, ProfileSkill } from "@/lib/types";
import { verifyEvidenceHash } from "@/lib/verify";

const LABELS: [keyof Components, string, number][] = [
  ["complexity", "Complexity & scale", 25],
  ["hygiene", "Engineering hygiene", 25],
  ["authorship", "Authorship & activity", 20],
  ["external", "External validation", 20],
  ["substance", "Substance (AI, capped)", 10],
];

export function EvidenceDrawer({ skill, triggerClassName }: { skill: ProfileSkill; triggerClassName?: string }) {
  const [evidence, setEvidence] = useState<{ rubricVersion?: string } | null>(null);
  const [check, setCheck] = useState<"idle" | "ok" | "bad" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (evidence) return;
    try {
      const r = await api<{ evidence: { rubricVersion?: string } }>(`/evidence/${skill.evidenceHash}`);
      setEvidence(r.evidence);
      setCheck((await verifyEvidenceHash(r.evidence, skill.evidenceHash)) ? "ok" : "bad");
    } catch (e) {
      setErr(errorMessage(e));
      setCheck("error");
    }
  }

  return (
    <Sheet onOpenChange={(o) => o && void load()}>
      <SheetTrigger asChild>
        <Button variant="outline" className={triggerClassName}>
          View evidence
        </Button>
      </SheetTrigger>
      <SheetContent eyebrow="Evidence" title={`${skill.language} · ${skill.score}`}>
        {skill.components ? (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            {LABELS.map(([k, label, max]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="m-0 font-mono">
                  {Math.round(skill.components![k] ?? 0)}/{max}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-ink-muted">No score breakdown is stored for this token.</p>
        )}

        {skill.topRepos.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {skill.topRepos.map((r) => (
              <li key={r.fullName} className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.fullName.split("/")[1]}
                  {r.commitSha ? ` · ${r.commitSha.slice(0, 7)}` : ""} ↗
                </a>
                <span className="text-xs text-ink-dim">
                  ★ {r.stars} · {r.sourceFiles} files{r.hasTests ? " · tests" : ""}
                  {r.hasCi ? " · CI" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {skill.mergedExternalPrs > 0 && (
          <p className="text-sm text-ink-muted">
            Plus {skill.mergedExternalPrs} pull request{skill.mergedExternalPrs === 1 ? "" : "s"} merged into other people&apos;s
            projects.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs text-ink-dim">
            {evidence?.rubricVersion ?? "rubric"} · hash {truncate(skill.evidenceHash)}
          </span>
          <p className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
            {check === "ok" && <span className="text-verified">✓ keccak256 of the evidence JSON matches the on-chain hash</span>}
            {check === "bad" && <span className="text-error">Hash mismatch. Treat this evidence as untrusted.</span>}
            {check === "error" && <span className="text-error">{err}</span>}
            {check === "idle" && <span className="text-ink-dim">Rehashing in your browser…</span>}
            <Tooltip content="We canonicalise the evidence JSON (RFC 8785) and hash it with keccak256 right here in your browser. The soulbound token stores the same hash, so nobody can change the evidence after minting.">
              <button type="button" className="text-xs text-ink-dim underline decoration-dotted">
                how this works
              </button>
            </Tooltip>
          </p>
          {skill.onchain && !skill.onchain.hashMatches && (
            <p className="text-xs text-warning">The token holds a hash from a different analysis run.</p>
          )}
        </div>

        {evidence !== null && (
          <details className="text-xs">
            <summary className="cursor-pointer text-sm text-ink-muted">Raw evidence JSON</summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-ground p-3 font-mono">{JSON.stringify(evidence, null, 2)}</pre>
          </details>
        )}
      </SheetContent>
    </Sheet>
  );
}
