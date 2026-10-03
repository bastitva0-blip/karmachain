"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, StateCard } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { recruiterHeaders } from "@/lib/recruiter-key";
import { cn } from "@/lib/utils";

type Status = "created" | "live" | "processing" | "done" | "failed";

interface InterviewRow {
  id: string;
  candidate: { handle: string; name: string | null; avatarUrl: string | null; isDemo: boolean };
  role: string;
  status: Status;
  mode: "voice" | "text";
  overall: number | null;
  anchored: boolean;
  canReprocess: boolean;
  error: string | null;
  createdAt: string;
}

type Filter = "all" | "live" | "processing" | "done" | "failed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "processing", label: "Processing" },
  { id: "done", label: "Done" },
  { id: "failed", label: "Failed" },
];

const ALL_ROLES = "__all__";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86_400_000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

function shortError(e: string | null): string {
  if (!e) return "Failed";
  const t = e.replace(/\.$/, "");
  return `Failed · ${t.length > 40 ? `${t.slice(0, 40)}…` : t}`;
}

function StatusTag({ iv }: { iv: InterviewRow }) {
  const base = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold";
  switch (iv.status) {
    case "live":
      return (
        <span className={cn(base, "bg-error-bg text-error")}>
          <span aria-hidden>●</span> Live now
        </span>
      );
    case "processing":
      return <span className={cn(base, "bg-surface-2 text-karma")}>Writing report…</span>;
    case "done":
      return (
        <span className={cn(base, "bg-verified-bg text-verified")}>
          <span aria-hidden>✓</span> Done{iv.anchored ? " · anchored" : ""}
        </span>
      );
    case "failed":
      return (
        <span className={cn(base, "bg-error-bg text-error")} title={iv.error ?? undefined}>
          {shortError(iv.error)}
        </span>
      );
    default:
      return <span className={cn(base, "bg-warning-bg text-warning")}>Invited · not started</span>;
  }
}

function Overall({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-dim" aria-label="No score">—</span>;
  return (
    <span>
      <strong className="display text-lg font-extrabold">{v.toFixed(1)}</strong>
      <span className="text-ink-dim">/5</span>
    </span>
  );
}

function RowAction({ iv, retrying, onRetry }: { iv: InterviewRow; retrying: boolean; onRetry: (id: string) => void }) {
  const who = `@${iv.candidate.handle}`;
  if (iv.status === "live") {
    return (
      <Button asChild variant="outline" size="sm">
        {/* TODO(lead): no recruiter live-caption view exists yet; the report page polls while live. */}
        <Link href={`/interview/${iv.id}/report`} aria-label={`Watch captions for ${who}`}>
          Watch captions
        </Link>
      </Button>
    );
  }
  if (iv.status === "processing") {
    return (
      <Button variant="outline" size="sm" disabled>
        Report soon
      </Button>
    );
  }
  if (iv.status === "done") {
    return (
      <Button asChild size="sm">
        <Link href={`/interview/${iv.id}/report`} aria-label={`Open report for ${who}`}>
          Open report
        </Link>
      </Button>
    );
  }
  if (iv.status === "failed") {
    return iv.canReprocess ? (
      <Button variant="outline" size="sm" disabled={retrying} onClick={() => onRetry(iv.id)} aria-label={`Retry report for ${who}`}>
        {retrying && <Loader2 className="animate-spin" aria-hidden />} Retry report
      </Button>
    ) : (
      <Button asChild variant="outline" size="sm">
        <Link href={`/interview/${iv.id}/report`} aria-label={`View failed interview for ${who}`}>
          View details
        </Link>
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={`Copy interview link for ${who}`}
      onClick={async () => {
        const url = `${window.location.origin}/interview/${iv.id}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Interview link copied");
        } catch {
          toast.error(`Couldn't copy. The link is ${url}`);
        }
      }}
    >
      Copy link
    </Button>
  );
}

function Candidate({ iv, size = 36 }: { iv: InterviewRow; size?: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar src={iv.candidate.avatarUrl} name={iv.candidate.handle} size={size} />
      <div className="flex min-w-0 flex-col">
        <strong className="truncate">@{iv.candidate.handle}</strong>
        {iv.candidate.isDemo && <span className="text-xs text-ink-dim">Demo</span>}
      </div>
    </div>
  );
}

export function InterviewsView() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [role, setRole] = useState(ALL_ROLES);
  const [retrying, setRetrying] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["recruiter-interviews"],
    queryFn: () => api<{ items: InterviewRow[] }>("/recruiter/interviews", { headers: recruiterHeaders() }).then((r) => r.items),
    refetchInterval: (qq) => (qq.state.data?.some((i) => i.status === "live" || i.status === "processing") ? 5000 : false),
  });

  const items = useMemo(() => q.data ?? [], [q.data]);
  const roles = useMemo(() => Array.from(new Set(items.map((i) => i.role))).sort(), [items]);
  const stats = useMemo(
    () => ({
      total: items.length,
      live: items.filter((i) => i.status === "live").length,
      processing: items.filter((i) => i.status === "processing").length,
      done: items.filter((i) => i.status === "done").length,
    }),
    [items],
  );
  const shown = items.filter((i) => (filter === "all" || i.status === filter) && (role === ALL_ROLES || i.role === role));

  async function retry(id: string) {
    setRetrying(id);
    try {
      await api(`/interviews/${id}/reprocess`, { method: "POST", headers: recruiterHeaders() });
      toast.success("Report is being rewritten");
      await qc.invalidateQueries({ queryKey: ["recruiter-interviews"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRetrying(null);
    }
  }

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>/recruiter/interviews</Eyebrow>
        <h1 className="display m-0 text-[clamp(30px,4vw,40px)] font-extrabold leading-tight">Interviews</h1>
      </div>
      <Button asChild>
        <Link href="/recruiter">+ New interview</Link>
      </Button>
    </div>
  );

  let body: React.ReactNode;
  if (q.isLoading) {
    body = (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading interviews">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-2xl" />
          ))}
        </div>
        <Card className="flex flex-col gap-3 p-5">
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5 w-[70%]" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5 w-[55%]" />
        </Card>
      </div>
    );
  } else if (q.error) {
    body = (
      <StateCard
        tone="error"
        role="alert"
        label="Couldn't load"
        title="Interviews didn't load"
        body={errorMessage(q.error)}
        action={
          <Button variant="outline" onClick={() => q.refetch()}>
            Retry
          </Button>
        }
      />
    );
  } else if (items.length === 0) {
    body = (
      <StateCard
        label="Empty"
        title="No interviews yet"
        body="Find a candidate and press Interview. Interviews you start in this browser show up here."
        action={
          <Button asChild>
            <Link href="/recruiter">Find candidates</Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { n: stats.total, label: "Total", cls: "" },
            { n: stats.live, label: "Live now", cls: "text-live" },
            { n: stats.processing, label: "Writing report", cls: "text-karma" },
            { n: stats.done, label: "Reports ready", cls: "text-verified" },
          ].map((s) => (
            <Card key={s.label} className="p-[18px]">
              <div className={cn("display text-[30px] font-extrabold leading-tight", s.cls)}>{s.n}</div>
              <div className="text-sm text-ink-muted">{s.label}</div>
            </Card>
          ))}
        </div>

        <div role="group" aria-label="Filter" className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3.5 text-sm",
                filter === f.id ? "border-karma bg-surface-2 text-ink" : "border-border-strong text-ink-muted hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="grow" />
          <label className="w-full sm:w-auto">
            <span className="sr-only">Role</span>
            <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 normal-case sm:w-auto">
              <option value={ALL_ROLES}>All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {shown.length === 0 ? (
          <StateCard
            label="No results"
            title="Nothing matches these filters"
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setFilter("all");
                  setRole(ALL_ROLES);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden overflow-hidden md:block">
              <table className="w-full border-collapse text-[15px]">
                <caption className="sr-only">Your interviews</caption>
                <thead>
                  <tr className="border-b border-border text-left font-mono text-xs tracking-[0.06em] text-ink-dim">
                    <th scope="col" className="px-4 py-3 font-medium">CANDIDATE</th>
                    <th scope="col" className="px-4 py-3 font-medium">ROLE</th>
                    <th scope="col" className="px-4 py-3 font-medium">STATUS</th>
                    <th scope="col" className="px-4 py-3 font-medium">OVERALL</th>
                    <th scope="col" className="px-4 py-3 font-medium">DATE</th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((iv) => (
                    <tr key={iv.id} className="border-b border-border-soft last:border-b-0">
                      <td className="p-4 align-middle">
                        <Candidate iv={iv} />
                      </td>
                      <td className="p-4 align-middle">{iv.role}</td>
                      <td className="p-4 align-middle">
                        <StatusTag iv={iv} />
                      </td>
                      <td className="p-4 align-middle">
                        <Overall v={iv.overall} />
                      </td>
                      <td className="p-4 align-middle font-mono text-[13px] text-ink-dim">
                        <time dateTime={iv.createdAt}>{fmtDate(iv.createdAt)}</time>
                      </td>
                      <td className="p-4 text-right align-middle">
                        <RowAction iv={iv} retrying={retrying === iv.id} onRetry={retry} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Mobile cards */}
            <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden" aria-label="Your interviews">
              {shown.map((iv) => (
                <li key={iv.id}>
                  <Card className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Candidate iv={iv} />
                      <Overall v={iv.overall} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                      <span>{iv.role}</span>
                      <time dateTime={iv.createdAt} className="font-mono text-[13px] text-ink-dim">
                        {fmtDate(iv.createdAt)}
                      </time>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <StatusTag iv={iv} />
                      <RowAction iv={iv} retrying={retrying === iv.id} onRetry={retry} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="m-0 text-[13px] text-ink-dim">Scores are AI-assisted decision support. There is no automatic rejection. A human decides.</p>
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-6 pb-24 pt-10">
      {header}
      {body}
    </div>
  );
}
