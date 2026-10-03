"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSignTypedData } from "wagmi";
import { CRITERIA, type Criterion, type InterviewReport } from "@karma/shared";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, StateCard } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { truncate } from "@/components/tx-link";
import { useMe } from "@/hooks/use-me";
import { api, errorMessage } from "@/lib/api";
import { reviveTyped, type ServerTypedData } from "@/lib/eas";
import { fmtTime, type InterviewView } from "@/lib/interview-types";
import { cn } from "@/lib/utils";

const LABEL: Record<Criterion, string> = {
  technical_depth: "Technical depth",
  problem_solving: "Problem solving",
  communication_clarity: "Communication clarity",
  role_fit: "Role fit",
};

const EAS_VIEW = "https://base-sepolia.easscan.org/attestation/view/";

export function ReportView({ id }: { id: string }) {
  const [highlight, setHighlight] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ["interview", id],
    queryFn: () => api<InterviewView>(`/interviews/${id}`),
    refetchInterval: (qq) => (qq.state.data?.status === "processing" || qq.state.data?.status === "live" ? 2500 : false),
  });

  if (q.isLoading) {
    return (
      <div className="container-kc flex flex-col gap-4 py-12" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="container-kc py-16">
        <StateCard className="mx-auto max-w-md" label="Not found" title="This report doesn't exist" body={q.error ? errorMessage(q.error) : undefined} />
      </div>
    );
  }
  const iv = q.data;

  if (iv.status === "failed") {
    return (
      <div className="container-kc py-16">
        <StateCard
          className="mx-auto max-w-md"
          tone="error"
          role="alert"
          label="Failed"
          title="The transcript didn't arrive in time"
          body={iv.error ?? undefined}
          action={
            <Button
              variant="outline"
              onClick={async () => {
                await api(`/interviews/${id}/reprocess`, { method: "POST" }).catch((e) => toast.error(errorMessage(e)));
                void q.refetch();
              }}
            >
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!iv.report) {
    return (
      <div className="container-kc py-16">
        <Card className="mx-auto flex max-w-md items-center gap-4 p-6" aria-live="polite">
          <span aria-hidden className="size-7 shrink-0 animate-spin rounded-full border-[3px] border-karma border-t-transparent" />
          <div className="flex flex-col gap-1">
            <strong className="display text-lg font-bold">Writing your report</strong>
            <span className="text-sm text-ink-muted">Fetching transcript · usually under a minute</span>
          </div>
        </Card>
      </div>
    );
  }

  const r = iv.report;
  const transcript = iv.transcript ?? [];
  const duration = transcript.length ? transcript[transcript.length - 1]!.t : 0;
  const date = new Date(iv.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  function jumpTo(t: number) {
    setHighlight(t);
    document.getElementById(`turn-${t}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="container-kc flex flex-col gap-8 pb-24 pt-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <Eyebrow>
            Interview report · {date} · {Math.floor(duration / 60)} min {duration % 60} s · {r.mode}
          </Eyebrow>
          <h1 className="display m-0 text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">
            @{iv.candidateHandle} for {iv.roleTitle}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(summaryText(iv, r));
              toast.success("Summary copied");
            }}
          >
            Copy summary
          </Button>
          <AnchorButton iv={iv} />
        </div>
      </div>

      <div role="note" className="rounded-xl border border-warning-border bg-warning-bg px-[18px] py-3.5 text-sm text-warning-ink">
        {r.disclaimer} Scores are backed only by the quotes shown.
        {r.droppedQuotes > 0 && ` ${r.droppedQuotes} quote${r.droppedQuotes === 1 ? "" : "s"} that didn't match the transcript were removed.`}
      </div>

      <section aria-labelledby="sc-h" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <h2 id="sc-h" className="sr-only">
          Scores
        </h2>
        {CRITERIA.map((c) => {
          const s = r.scores[c];
          return (
            <Card key={c} className="flex flex-col gap-3 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="m-0 text-[15px] font-semibold">{LABEL[c]}</h3>
                {s.score !== null && (
                  <span className="display text-[28px] font-extrabold">
                    {s.score}
                    <span className="text-[15px] text-ink-dim">/5</span>
                  </span>
                )}
              </div>
              {s.score === null && <span className="display text-[22px] font-bold text-ink-dim">Not enough evidence</span>}
              <div className="h-1.5 rounded-full bg-track" aria-hidden>
                {s.score !== null && <div className="h-full rounded-full bg-karma" style={{ width: `${(s.score / 5) * 100}%` }} />}
              </div>
              {s.quotes.map((qq, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => jumpTo(qq.t)}
                  className="block w-full rounded-[10px] border border-border bg-ground px-3.5 py-3 text-left text-[15px] leading-normal text-ink hover:border-karma"
                >
                  &ldquo;{qq.text}&rdquo; <span className="font-mono text-xs text-ink-dim">{fmtTime(qq.t).padStart(5, "0")}</span>
                </button>
              ))}
              {s.note && (s.score === null || s.quotes.length === 0) && <p className="m-0 text-sm text-ink-dim">{s.note}</p>}
            </Card>
          );
        })}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <ListCard title="Strengths" items={r.strengths} className="text-verified" />
        <ListCard title="Concerns" items={r.concerns} className="text-concern" />
        <ListCard title="Follow-ups" items={r.follow_up_questions} />
      </div>

      <Card className="flex flex-col gap-2.5 p-6">
        <h2 className="display m-0 text-xl font-bold">Summary</h2>
        <p className="m-0 leading-relaxed text-ink-muted">{r.summary}</p>
        {r.overall !== null && <p className="m-0 font-mono text-sm text-ink-dim">overall {r.overall}/5 · average of scored criteria</p>}
      </Card>

      <Card className="flex flex-col gap-4 p-6" aria-labelledby="tx-h">
        <h2 id="tx-h" className="display m-0 text-xl font-bold">
          Full transcript
        </h2>
        <ol className="m-0 flex list-none flex-col gap-3 p-0 leading-[1.55]">
          {transcript.map((t, i) => (
            <li
              key={i}
              id={`turn-${t.t}`}
              className={cn(
                "grid grid-cols-[52px_72px_1fr] gap-3 sm:grid-cols-[64px_80px_1fr]",
                highlight === t.t && t.role === "user" && "-m-2 rounded-lg bg-avatar p-2",
              )}
            >
              <span className="font-mono text-[13px] text-ink-dim">{fmtTime(t.t).padStart(5, "0")}</span>
              <strong className={t.role === "agent" ? "text-karma" : "text-tier-medium"}>{t.role === "agent" ? "Karma" : `@${iv.candidateHandle}`.slice(0, 10)}</strong>
              <span>{t.message}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {iv.reportHash && <span className="font-mono text-[13px] text-ink-dim">report hash {truncate(iv.reportHash)}</span>}
        {iv.attestationUid ? (
          <a href={`${EAS_VIEW}${iv.attestationUid}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-verified">
            Anchored · EAS ↗
          </a>
        ) : (
          <span className="font-mono text-[13px] text-ink-dim">Not anchored (the candidate can sign it on-chain)</span>
        )}
      </div>
    </div>
  );
}

function ListCard({ title, items, className }: { title: string; items: string[]; className?: string }) {
  return (
    <Card className="flex flex-col gap-2.5 p-6">
      <h2 className={cn("display m-0 text-xl font-bold", className)}>{title}</h2>
      {items.length ? (
        <ul className="m-0 list-disc pl-[18px] leading-relaxed text-ink-muted">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-ink-dim">None noted.</p>
      )}
    </Card>
  );
}

function summaryText(iv: InterviewView, r: InterviewReport) {
  return [
    `Interview: ${iv.roleTitle} with @${iv.candidateHandle}`,
    ...CRITERIA.map((c) => `${LABEL[c]}: ${r.scores[c].score ?? "not enough evidence"}${r.scores[c].score !== null ? "/5" : ""}`),
    `Overall: ${r.overall ?? "n/a"}`,
    `Strengths: ${r.strengths.join("; ") || "none noted"}`,
    `Concerns: ${r.concerns.join("; ") || "none noted"}`,
    `Summary: ${r.summary}`,
    r.disclaimer,
  ].join("\n");
}

/** Candidate-only: sign an EAS InterviewResult attestation (hash only); relayer pays gas. */
function AnchorButton({ iv }: { iv: InterviewView }) {
  const { me } = useMe();
  const qc = useQueryClient();
  const { signTypedDataAsync } = useSignTypedData();
  const [busy, setBusy] = useState(false);

  if (iv.attestationUid) {
    return (
      <Button asChild variant="outline">
        <a href={`${EAS_VIEW}${iv.attestationUid}`} target="_blank" rel="noreferrer">
          Anchored on EAS ↗
        </a>
      </Button>
    );
  }
  const isCandidate = !!me && me.githubHandle.toLowerCase() === iv.candidateHandle.toLowerCase();

  async function anchor() {
    setBusy(true);
    try {
      const { typedData } = await api<{ typedData: ServerTypedData }>(`/interviews/${iv.id}/anchor/prepare`, { method: "POST" });
      const signature = await signTypedDataAsync(reviveTyped(typedData) as Parameters<typeof signTypedDataAsync>[0]);
      const r = await api<{ uid: string; txHash: string }>(`/interviews/${iv.id}/anchor`, {
        method: "POST",
        json: { signature, deadline: String(typedData.message.deadline) },
      });
      toast.success(`Result anchored on-chain · tx ${truncate(r.txHash)}`);
      void qc.invalidateQueries({ queryKey: ["interview", iv.id] });
    } catch (e) {
      toast.error(/User rejected|denied/i.test(errorMessage(e)) ? "Signature cancelled. Nothing was published." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={anchor} disabled={busy || !isCandidate} title={isCandidate ? undefined : "Only the candidate can anchor this result"}>
      {busy && <Loader2 className="animate-spin" aria-hidden />} Anchor result on-chain
    </Button>
  );
}
