"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError, errorMessage } from "@/lib/api";
import { recruiterHeaders } from "@/lib/recruiter-key";

interface VakhStatus {
  directoryUrl: string | null;
  recruiter: { connected: boolean; displayName: string | null; pipelineUrl: string | null };
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
    </Card>
  );
}
