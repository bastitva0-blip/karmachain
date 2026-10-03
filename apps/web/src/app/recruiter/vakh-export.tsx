"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError, errorMessage } from "@/lib/api";
import { recruiterHeaders } from "@/lib/recruiter-key";

interface VakhStatus {
  directoryUrl: string | null;
  recruiter: { connected: boolean; displayName: string | null; pipelineUrl: string | null };
}

interface PipelineItem {
  postId: string;
  candidate: string;
  role: string;
  stage: string;
  interviewUrl: string | null;
  reportUrl: string | null;
  status: string | null;
}

interface SyncResult {
  formId: string | null;
  items: PipelineItem[];
  interviewsCreated: number;
  reportsWritten: number;
}

interface ExportResult {
  url: string;
  created: number;
  linkedProofs: number;
}

/** Sends the current shortlist to the recruiter's own Vakh pipeline board. */
export function VakhExport({ jobSpecId, count }: { jobSpecId: string; count: number }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"connect" | "export" | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  const status = useQuery({
    queryKey: ["vakh-status"],
    queryFn: () => api<VakhStatus>("/vakh/status", { headers: recruiterHeaders() }),
    staleTime: 30_000,
  });

  async function connect() {
    setBusy("connect");
    try {
      const r = await api<{ url: string }>("/vakh/connect", {
        method: "POST",
        headers: recruiterHeaders(),
        json: { as: "recruiter", returnTo: `/recruiter?job=${jobSpecId}` },
      });
      window.location.assign(r.url);
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(null);
    }
  }

  async function send() {
    setBusy("export");
    try {
      const r = await api<ExportResult>(`/recruiter/jobs/${jobSpecId}/vakh`, { method: "POST", headers: recruiterHeaders() });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["vakh-status"] });
      void qc.invalidateQueries({ queryKey: ["vakh-pipeline"] });
      toast.success(r.created ? `Added ${r.created} candidate${r.created === 1 ? "" : "s"} to your Vakh pipeline` : "Your Vakh pipeline already has this shortlist");
    } catch (e) {
      if (e instanceof ApiError && e.code === "vakh_not_connected") {
        void qc.invalidateQueries({ queryKey: ["vakh-status"] });
        toast.error("Your Vakh connection expired. Connect again.");
      } else toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  // The board in Vakh is the source of truth; this reads it back (and acts on stage moves).
  const pipeline = useQuery({
    queryKey: ["vakh-pipeline"],
    queryFn: () => api<SyncResult>("/recruiter/vakh/sync", { method: "POST", headers: recruiterHeaders() }),
    enabled: (status.data?.recruiter.connected ?? false) && Boolean(status.data?.recruiter.pipelineUrl ?? result),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  async function syncNow() {
    const r = await pipeline.refetch();
    if (r.data && (r.data.interviewsCreated || r.data.reportsWritten)) {
      toast.success(`From Vakh: ${r.data.interviewsCreated} interview(s) created, ${r.data.reportsWritten} report(s) posted`);
    }
  }

  async function disconnect() {
    await api("/vakh/disconnect", { method: "POST", headers: recruiterHeaders(), json: { as: "recruiter" } }).catch(() => undefined);
    setResult(null);
    void qc.invalidateQueries({ queryKey: ["vakh-status"] });
  }

  const s = status.data;
  const connected = s?.recruiter.connected ?? false;
  const boardUrl = result?.url ?? s?.recruiter.pipelineUrl ?? null;

  return (
    <Card className="flex flex-col gap-3 p-5" aria-labelledby="vakh-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="vakh-h" className="m-0 text-[15px] font-semibold">
          Track this shortlist in Vakh
        </h3>
        {connected && (
          <span className="text-[13px] text-ink-dim">
            Connected{s?.recruiter.displayName ? ` as @${s.recruiter.displayName}` : ""} ·{" "}
            <button type="button" onClick={disconnect} className="underline underline-offset-2 hover:text-ink">
              disconnect
            </button>
          </span>
        )}
      </div>
      <p className="m-0 text-sm leading-[1.55] text-ink-muted">
        {connected
          ? `Adds these ${count} candidates to a Pipeline board in your Vakh account, each linked to their public proof posts. Your assistant can read the board over MCP.`
          : "Connect your Vakh account to keep a hiring board there. KarmaChain only writes to the board it creates for you."}
      </p>
      {status.isError ? (
        <p className="m-0 text-sm text-ink-dim">Vakh status didn&apos;t load. {errorMessage(status.error)}</p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {status.isLoading ? (
            <Button disabled variant="outline">
              <Loader2 className="animate-spin" aria-hidden /> Checking Vakh
            </Button>
          ) : connected ? (
            <Button onClick={send} disabled={busy !== null}>
              {busy === "export" && <Loader2 className="animate-spin" aria-hidden />} Send shortlist to Vakh
            </Button>
          ) : (
            <Button onClick={connect} disabled={busy !== null}>
              {busy === "connect" && <Loader2 className="animate-spin" aria-hidden />} Connect Vakh
            </Button>
          )}
          {boardUrl && (
            <Button asChild variant="outline">
              <a href={boardUrl} target="_blank" rel="noopener noreferrer">
                Open pipeline <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
        </div>
      )}
      {result && (
        <p className="m-0 text-[13px] text-ink-dim" role="status">
          {result.created} added · {result.linkedProofs} proof link{result.linkedProofs === 1 ? "" : "s"}
        </p>
      )}
      {connected && boardUrl && (
        <div className="flex flex-col gap-2 border-t border-border-soft pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="m-0 text-sm font-semibold">Your pipeline, read from Vakh</h4>
            <Button size="sm" variant="ghost" onClick={syncNow} disabled={pipeline.isFetching}>
              <RefreshCw className={pipeline.isFetching ? "animate-spin" : undefined} aria-hidden /> Sync
            </Button>
          </div>
          <p className="m-0 text-[13px] leading-[1.5] text-ink-dim">
            Move a card to <strong>Interviewing</strong> in Vakh and KarmaChain creates the AI interview and writes the link on the card. Reports come back the same way.
          </p>
          {pipeline.isError ? (
            <p className="m-0 text-[13px] text-ink-dim">Couldn&apos;t read the board. {errorMessage(pipeline.error)}</p>
          ) : pipeline.isLoading ? (
            <p className="m-0 text-[13px] text-ink-dim">Reading your board…</p>
          ) : !pipeline.data?.items.length ? (
            <p className="m-0 text-[13px] text-ink-dim">No cards yet. Send the shortlist first.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {pipeline.data.items.map((i) => (
                <li key={i.postId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
                  <span className="font-medium">{i.candidate}</span>
                  <span className="rounded-full border border-border px-2 py-px text-[12px] text-ink-muted">{i.stage}</span>
                  {i.reportUrl ? (
                    <a href={i.reportUrl} className="underline underline-offset-2">report</a>
                  ) : i.interviewUrl ? (
                    <a href={i.interviewUrl} className="underline underline-offset-2">interview link</a>
                  ) : null}
                  {i.status && <span className="basis-full text-ink-dim">{i.status}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
