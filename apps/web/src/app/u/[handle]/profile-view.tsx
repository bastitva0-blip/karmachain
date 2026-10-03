"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { BASESCAN, deployments, isDeployed } from "@karma/shared";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Card, StateCard } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { ScoreRing } from "@/components/score-ring";
import { Pill, SelfDeclaredBadge, TierBadge, TIER_LABEL } from "@/components/tier-badge";
import { AddressLink, ExternalLink, truncate } from "@/components/tx-link";
import { CommunicationEvidence } from "@/components/communication-evidence";
import { HearBrief } from "@/components/voice/hear-brief";
import { AskKarma } from "@/components/voice/ask-karma";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Attestation, Profile, ProfileSkill } from "@/lib/types";

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

function accountAge(days: number | null): string {
  if (days === null) return "—";
  return days >= 365 ? `${(days / 365).toFixed(1)} yr` : `${days} d`;
}

export function ProfileView({ handle }: { handle: string }) {
  const q = useQuery({
    queryKey: ["profile", handle],
    queryFn: () =>
      api<Profile>(`/profile/${encodeURIComponent(handle)}`).then((p) => ({
        ...p,
        sinceYear: p.trustSignals.accountAgeDays !== null ? new Date(Date.now() - p.trustSignals.accountAgeDays * 864e5).getFullYear() : null,
      })),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1,
  });
  // Public Vakh directory posts for this developer's proofs (optional, never blocks the page).
  const vakh = useQuery({
    queryKey: ["vakh-proofs", handle],
    queryFn: () => api<{ items: { skill: string; url: string }[] }>(`/vakh/proofs/${encodeURIComponent(handle)}`).then((r) => new Map(r.items.map((i) => [i.skill, i.url]))),
    retry: false,
  });

  if (q.isLoading || (!q.data && !q.error)) {
    return (
      <div className="container-kc flex flex-col gap-10 pb-28 pt-12" aria-busy>
        <div className="flex items-center gap-5">
          <Skeleton className="size-[88px] rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </div>
    );
  }

  if (q.error) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="container-kc py-20">
        <StateCard
          className="mx-auto max-w-md"
          tone={notFound ? "default" : "error"}
          label={notFound ? "Not found" : "Couldn't load"}
          title={notFound ? `No profile for @${handle}` : "This profile didn't load"}
          body={notFound ? "Check the handle or invite them." : errorMessage(q.error)}
          action={
            notFound ? (
              <Button asChild variant="outline">
                <Link href="/dashboard">Create your own</Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => q.refetch()}>
                Retry
              </Button>
            )
          }
        />
      </div>
    );
  }

  const p = q.data;
  if (!p) return null;
  const t = p.trustSignals;
  const reviews = p.attestations.filter((a) => a.schema === "ClientReview" && !a.revoked);
  const sinceYear = p.sinceYear;
  // Only a real outage counts: a not-yet-deployed contract is not "unreachable".
  const chainDown = isDeployed(process.env.NEXT_PUBLIC_SBT_ADDRESS || deployments.sbt) && !t.chainAvailable && !!p.user.walletAddress;

  return (
    <>
      {p.user.isDemo && (
        <div role="status" className="border-b border-warning-border bg-warning-bg text-sm text-warning">
          <div className="container-kc flex items-center gap-2.5 py-3">
            <strong>Demo profile.</strong>
            <span className="text-warning-ink">Seeded for the hackathon, not a real person.</span>
          </div>
        </div>
      )}

      <div className="container-kc flex flex-col gap-10 pb-32 pt-12">
        <section className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Avatar src={p.user.avatarUrl} name={p.user.githubHandle} size={88} />
            <div className="flex flex-col gap-1.5">
              <h1 className="display m-0 text-[40px] font-extrabold leading-tight">@{p.user.githubHandle}</h1>
              <div className="flex flex-wrap items-center gap-3.5 text-sm">
                {p.user.walletAddress && <AddressLink address={p.user.walletAddress} className="text-sm" />}
                {sinceYear && <span className="text-ink-dim">GitHub since {sinceYear}</span>}
                {p.user.githubUrl && <ExternalLink href={p.user.githubUrl}>GitHub</ExternalLink>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <HearBrief handle={p.user.githubHandle} />
            <Button asChild>
              <Link href={`/review/${p.user.githubHandle}`}>Leave a review</Link>
            </Button>
          </div>
        </section>

        {chainDown && (
          <StateCard
            tone="warning"
            label="Chain unreachable"
            title="Showing stored data"
            body="Base Sepolia didn't respond, so on-chain token status may be missing."
            action={
              <Button variant="outline" onClick={() => q.refetch()}>
                Retry
              </Button>
            }
          />
        )}

        <section aria-label="Trust stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={t.chainAvailable ? t.onchainSkills : "—"} label="Soulbound skills" />
          <Stat value={t.externalMergedPrs} label="PRs merged into others' repos" />
          <Stat value={p.attestationsAvailable ? t.reviewCount : "—"} label="Client attestations" />
          <Stat value={accountAge(t.accountAgeDays)} label="Account age" />
        </section>

        <section aria-labelledby="sk-h" className="flex flex-col gap-4">
          <h2 id="sk-h" className="display m-0 text-[28px] font-bold">
            Verified skills
          </h2>
          {p.skills.length === 0 ? (
            <StateCard label="Empty skills" title="No skills minted yet" body="This developer hasn't run an analysis." />
          ) : (
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
              {p.skills.map((s, i) => (
                <motion.li key={s.skill} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <SkillCard s={s} vakhUrl={vakh.data?.get(s.skill) ?? null} />
                </motion.li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card className="flex flex-col gap-[18px] p-7" aria-labelledby="at-h">
            <h2 id="at-h" className="display m-0 text-2xl font-bold">
              Client attestations
            </h2>
            {!p.attestationsAvailable ? (
              <p className="m-0 text-sm text-ink-muted">The attestation service is unreachable right now.</p>
            ) : reviews.length === 0 ? (
              <EmptyState
                title="No client reviews yet"
                description={<Link href={`/review/${p.user.githubHandle}`}>Worked with them? Leave one</Link>}
              />
            ) : (
              reviews.map((a, i) => <ReviewItem key={a.uid} a={a} last={i === reviews.length - 1} />)
            )}
          </Card>
          <CommunicationEvidence handle={p.user.githubHandle} />
        </div>

        <section aria-labelledby="tl-h" className="flex flex-col gap-[18px]">
          <h2 id="tl-h" className="display m-0 text-2xl font-bold">
            Trust timeline
          </h2>
          <Timeline p={p} />
        </section>
      </div>

      <AskKarma defaultHandle={p.user.githubHandle} />
    </>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <Card className="flex flex-col gap-1.5 p-5">
      <span className="display text-[34px] font-extrabold leading-none">{value}</span>
      <span className="text-sm text-ink-muted">{label}</span>
    </Card>
  );
}

function SkillCard({ s, vakhUrl }: { s: ProfileSkill; vakhUrl: string | null }) {
  const sbt = process.env.NEXT_PUBLIC_SBT_ADDRESS || deployments.sbt;
  const basescan = s.onchain?.txUrl ?? (s.onchain ? `${BASESCAN}/token/${sbt}?a=${s.onchain.tokenId}` : null);
  return (
    <Card className="flex h-full flex-col gap-[18px] p-6">
      <div className="flex items-center gap-5">
        <ScoreRing score={s.score} tier={s.tier} size={84} />
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="display m-0 truncate text-[22px] font-bold">{s.language}</h3>
          <div className="flex flex-wrap gap-2">
            <TierBadge tier={s.tier} />
            {!s.verified && <SelfDeclaredBadge />}
          </div>
          <span className="font-mono text-xs text-ink-dim">
            {s.onchain ? `SBT #${s.onchain.tokenId.padStart(4, "0")}` : "Not minted yet"}
          </span>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2.5">
        <ErrorBoundary label="Evidence unavailable">
          <EvidenceDrawer skill={s} triggerClassName="grow" />
        </ErrorBoundary>
        {basescan && (
          <Button asChild variant="outline" className="grow">
            <a href={basescan} target="_blank" rel="noreferrer">
              Basescan ↗
            </a>
          </Button>
        )}
        {vakhUrl && (
          <Button asChild variant="outline" className="grow">
            <a href={vakhUrl} target="_blank" rel="noopener noreferrer" title="This proof in the public Vakh directory">
              Vakh ↗
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}

function ReviewItem({ a, last }: { a: Attestation; last: boolean }) {
  const rating = typeof a.data.rating === "number" ? a.data.rating : 0;
  return (
    <article className={last ? "flex flex-col gap-2.5" : "flex flex-col gap-2.5 border-b border-border pb-[18px]"}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-tier-top" aria-label={`${rating} out of 5 stars`}>
          {"★".repeat(rating)}
          {"☆".repeat(Math.max(0, 5 - rating))}
        </span>
        {typeof a.data.skillTag === "string" && a.data.skillTag && <Pill>{a.data.skillTag}</Pill>}
      </div>
      {typeof a.data.summary === "string" && <p className="m-0 leading-[1.55]">&ldquo;{a.data.summary}&rdquo;</p>}
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="font-mono text-ink-dim">from {truncate(a.attester)}</span>
        {a.freshAttester && <Pill tone="warning">Fresh wallet</Pill>}
        <ExternalLink href={a.url} className="text-[13px]">
          EAS
        </ExternalLink>
      </div>
    </article>
  );
}

function Timeline({ p }: { p: Profile }) {
  const events: { at: number; label: string }[] = [];
  for (const s of p.skills) if (s.onchain) events.push({ at: s.onchain.updatedAt * 1000, label: `Minted ${s.language} · ${TIER_LABEL[s.onchain.tier]}` });
  for (const a of p.attestations) {
    if (a.revoked) continue;
    const tag = typeof a.data.skillTag === "string" ? ` · ${a.data.skillTag}` : "";
    events.push({ at: a.time * 1000, label: a.schema === "ClientReview" ? `Client review attested${tag}` : "Interview result anchored" });
  }
  events.sort((x, y) => y.at - x.at);
  if (events.length === 0) return <p className="m-0 text-sm text-ink-dim">Nothing on-chain yet.</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-5 border-l-2 border-[#2A2638] p-0 pl-5">
      {events.map((e, i) => (
        <li key={i} className="flex flex-col gap-1">
          <time className="font-mono text-xs text-ink-dim" dateTime={new Date(e.at).toISOString()}>
            {fmtDate(e.at)}
          </time>
          <span>{e.label}</span>
        </li>
      ))}
    </ol>
  );
}
