"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TierBadge } from "@/components/tier-badge";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import type { Me } from "@/lib/types";
import type { FeedSidebar as SidebarData } from "./types";

const TIER_LABEL = { basic: "Basic", medium: "Medium", top: "Top" } as const;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-5" role="region" aria-label={label}>
      <Eyebrow>{label.toUpperCase()}</Eyebrow>
      {children}
    </Card>
  );
}

function SidebarSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex flex-col gap-3 p-5" aria-hidden>
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </Card>
      ))}
    </>
  );
}

const trendLine = (t: SidebarData["trending"][number]) =>
  [
    t.top > 0 ? `${t.top} new Top token${t.top === 1 ? "" : "s"}` : `${t.tokens} new token${t.tokens === 1 ? "" : "s"}`,
    t.prs > 0 ? `${t.prs} merged PR${t.prs === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

export function FeedSidebar({ me }: { me: Me | null }) {
  const q = useQuery({
    queryKey: ["feed", "sidebar", me?.id ?? "anon"],
    queryFn: () => api<SidebarData>("/feed/sidebar"),
  });

  if (q.isLoading) return <SidebarSkeleton />;
  if (q.isError || !q.data) {
    return (
      <Card tone="error" role="alert" className="flex flex-col gap-2 p-5">
        <strong className="text-sm">Sidebar didn&apos;t load</strong>
        <span className="text-[13px] text-ink-dim">{errorMessage(q.error)}</span>
        <Button variant="outline" size="sm" className="self-start" onClick={() => q.refetch()}>
          Retry
        </Button>
      </Card>
    );
  }
  const { you, trending, roles } = q.data;

  return (
    <>
      <Section label="Your proof">
        {!me ? (
          <span className="text-[13px] text-ink-muted">
            <a href="/api/auth/github">Sign in</a> to see your verified skills here.
          </span>
        ) : you && you.skills.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {you.skills.map((s) => (
                <TierBadge key={`${s.language}-${s.tier}`} tier={s.tier} label={`${s.language} · ${TIER_LABEL[s.tier]}`} />
              ))}
            </div>
            <span className="text-[13px] text-ink-muted">
              {you.received} endorsement{you.received === 1 ? "" : "s"} received · {you.given} given
            </span>
          </>
        ) : (
          <>
            <span className="text-[13px] text-ink-muted">No verified skills yet. Your posts rank higher with proof attached.</span>
            <Button asChild size="sm" variant="outline" className="self-start">
              <Link href="/dashboard">Verify a skill</Link>
            </Button>
          </>
        )}
      </Section>

      <Section label="Trending verified skills">
        {trending.length === 0 ? (
          <span className="text-[13px] text-ink-dim">No verified tokens minted yet.</span>
        ) : (
          <ol className="m-0 flex flex-col gap-2 pl-[18px] text-sm">
            {trending.map((t) => (
              <li key={t.language}>
                {t.language} <span className="text-ink-dim">· {trendLine(t)}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {me && (
        <Section label="Roles matching you">
          {roles.length === 0 ? (
            <span className="text-[13px] text-ink-dim">No open roles match your verified skills yet.</span>
          ) : (
            roles.map((r, i) => <RoleItem key={r.jobSpecId} role={r} me={me} primary={i === 0} />)
          )}
        </Section>
      )}
    </>
  );
}

function RoleItem({ role, me, primary }: { role: SidebarData["roles"][number]; me: Me; primary: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/interviews", {
        method: "POST",
        json: { jobSpecId: role.jobSpecId, candidateHandle: me.githubHandle },
      });
      router.push(`/interview/${r.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <strong className="text-[15px]">{role.title}</strong>
        <span className="text-[13px] text-ink-dim">{role.need}</span>
      </div>
      <Button size="sm" variant={primary ? "default" : "outline"} className="h-10" onClick={start} disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />} Take the voice interview
      </Button>
    </div>
  );
}
