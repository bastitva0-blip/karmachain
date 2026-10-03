"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";

interface AdminVakh {
  studio: { connected: boolean; displayName: string | null };
  directoryUrl: string | null;
  published: number;
  pending: number;
}

/** Studio Vakh account: connect it, create the public directory form, and backfill minted proofs. */
export function VakhPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"connect" | "setup" | "backfill" | "disconnect" | null>(null);
  const q = useQuery({ queryKey: ["admin-vakh"], queryFn: () => api<AdminVakh>("/admin/vakh") });

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("vakh");
    if (!outcome) return;
    window.history.replaceState(null, "", "/admin");
    if (outcome === "connected") toast.success("Studio Vakh account connected");
  }, []);

  async function run(kind: NonNullable<typeof busy>) {
    setBusy(kind);
    try {
      if (kind === "connect") {
        const r = await api<{ url: string }>("/vakh/connect", { method: "POST", json: { as: "studio", returnTo: "/admin" } });
        window.location.assign(r.url);
        return;
      }
      if (kind === "disconnect") {
        await api("/vakh/disconnect", { method: "POST", json: { as: "studio" } });
        toast.success("Studio account disconnected");
      } else if (kind === "setup") {
        await api("/admin/vakh/setup", { method: "POST" });
        toast.success("Directory form is ready");
      } else {
        const r = await api<{ published: number; skipped: number }>("/admin/vakh/backfill", { method: "POST" });
        toast.success(`Published ${r.published}${r.skipped ? `, skipped ${r.skipped}` : ""}`);
      }
      await qc.invalidateQueries({ queryKey: ["admin-vakh"] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
    setBusy(null);
  }

  const d = q.data;
  const spin = (k: typeof busy) => busy === k && <Loader2 className="animate-spin" aria-hidden />;

  return (
    <Card className="flex flex-col gap-2.5 p-5" aria-labelledby="vk-h">
      <Eyebrow id="vk-h">Vakh directory</Eyebrow>
      {q.isLoading ? (
        <span className="text-sm text-ink-dim">Checking Vakh…</span>
      ) : q.isError ? (
        <span className="text-sm text-warning">Couldn&apos;t load: {errorMessage(q.error)}</span>
      ) : (
        <>
          <p className="m-0 text-sm text-ink-muted">
            {d!.studio.connected
              ? `Publishing as ${d!.studio.displayName ? `@${d!.studio.displayName}` : "the studio account"}. New mints by opted-in developers are posted automatically; revocations archive the post.`
              : "Connect the KarmaChain studio Vakh account to publish minted proofs to a public directory."}
          </p>
          {d!.studio.connected && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                Published <strong className="font-mono">{d!.published}</strong>
              </span>
              <span>
                Waiting <strong className="font-mono">{d!.pending}</strong>
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!d!.studio.connected ? (
              <Button size="sm" onClick={() => run("connect")} disabled={busy !== null}>
                {spin("connect")} Connect studio account
              </Button>
            ) : (
              <>
                {!d!.directoryUrl && (
                  <Button size="sm" onClick={() => run("setup")} disabled={busy !== null}>
                    {spin("setup")} Create directory form
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => run("backfill")} disabled={busy !== null || (!!d!.directoryUrl && d!.pending === 0)}>
                  {spin("backfill")} Publish waiting proofs
                </Button>
                {d!.directoryUrl && (
                  <Button asChild size="sm" variant="outline">
                    <a href={d!.directoryUrl} target="_blank" rel="noopener noreferrer">
                      Open directory <ExternalLink aria-hidden />
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => run("disconnect")} disabled={busy !== null}>
                  {spin("disconnect")} Disconnect
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
