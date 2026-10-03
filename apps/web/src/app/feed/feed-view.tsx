"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, StateCard } from "@/components/ui/card";
import { useMe } from "@/hooks/use-me";
import { api, errorMessage } from "@/lib/api";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Composer, ComposerSkeleton, SignedOutComposer } from "./composer";
import { FeedSidebar } from "./feed-sidebar";
import { PostCard, PostSkeleton } from "./post-card";
import type { FeedPost, FeedScope, FeedSort } from "./types";

const SORTS: { id: FeedSort; label: string }[] = [
  { id: "proven", label: "Most proven" },
  { id: "latest", label: "Latest" },
  { id: "hiring", label: "Hiring" },
];

const SCOPES: { id: FeedScope; label: string; title: string; blurb: string }[] = [
  { id: "all", label: "Proof feed", title: "Proof feed", blurb: "" },
  { id: "following", label: "Following", title: "Following", blurb: "Posts from people whose work you've endorsed." },
  { id: "endorsed", label: "Endorsements", title: "Your endorsements", blurb: "Posts you've signed an endorsement for." },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function FeedNav({ scope, setScope, me, compact }: { scope: FeedScope; setScope: (s: FeedScope) => void; me: Me | null; compact?: boolean }) {
  const item = (active: boolean) =>
    cn(
      "flex items-center rounded-[10px] text-ink-muted no-underline hover:text-ink",
      compact ? "h-10 px-3 text-sm" : "h-11 px-3 text-[15px]",
      active && "bg-surface-2 font-semibold text-ink",
    );
  return (
    <nav aria-label="Feed" className={cn("flex gap-1", compact ? "flex-wrap" : "flex-col")}>
      {SCOPES.filter((s) => s.id === "all" || me).map((s) => (
        <button key={s.id} type="button" aria-current={scope === s.id ? "page" : undefined} className={item(scope === s.id)} onClick={() => setScope(s.id)}>
          {s.label}
        </button>
      ))}
      <Link href="/recruiter" className={item(false)}>
        Open roles
      </Link>
      {me && (
        <Link href={`/u/${me.githubHandle}`} className={item(false)}>
          My profile
        </Link>
      )}
    </nav>
  );
}

function SortTabs({ sort, setSort, panelId }: { sort: FeedSort; setSort: (s: FeedSort) => void; panelId: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: React.KeyboardEvent, i: number) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + SORTS.length) % SORTS.length;
    setSort(SORTS[next]!.id);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label="Sort" className="flex flex-wrap gap-2">
      {SORTS.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={`feed-tab-${s.id}`}
          role="tab"
          type="button"
          aria-selected={sort === s.id}
          aria-controls={panelId}
          tabIndex={sort === s.id ? 0 : -1}
          onClick={() => setSort(s.id)}
          onKeyDown={(e) => onKey(e, i)}
          className={cn(
            "inline-flex h-10 items-center rounded-[10px] border border-transparent px-3 text-sm font-medium text-ink-muted hover:border-border-strong hover:text-ink",
            sort === s.id && "bg-surface-2 text-ink",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function FeedView() {
  const { me, loading: meLoading } = useMe();
  const [sort, setSort] = useState<FeedSort>("proven");
  const [scope, setScopeState] = useState<FeedScope>("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);

  // Following / Endorsements need a viewer; drop back to the full feed on sign-out.
  const effectiveScope: FeedScope = me ? scope : "all";
  const apiSort = effectiveScope === "all" ? sort : effectiveScope;

  const feed = useQuery({
    queryKey: ["feed", "list", apiSort, q, me?.id ?? "anon"],
    queryFn: () => {
      const params = new URLSearchParams({ sort: apiSort });
      if (q) params.set("q", q);
      return api<{ items: FeedPost[] }>(`/feed?${params.toString()}`).then((r) => r.items);
    },
    enabled: !meLoading,
  });

  const setScope = (s: FeedScope) => {
    setScopeState(s);
    if (s === "all") setSort("proven");
  };

  const scopeInfo = SCOPES.find((s) => s.id === effectiveScope)!;
  const panelId = "feed-panel";

  return (
    <div className="container-kc max-w-[1280px] pb-24 pt-6">
      <h1 className="sr-only">Proof feed</h1>
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[240px_minmax(0,1fr)_300px]">
        <div className="sticky top-[92px] hidden flex-col gap-4 lg:flex">
          <FeedNav scope={effectiveScope} setScope={setScope} me={me} />
          <Card className="flex flex-col gap-2 p-4">
            <Eyebrow>HOW RANKING WORKS</Eyebrow>
            <p className="m-0 text-[13px] leading-normal text-ink-muted">
              Posts rise on verified proof and signed endorsements, weighted by the endorser&apos;s tier. No proof, no boost.
            </p>
          </Card>
        </div>

        <section className="flex min-w-0 flex-col gap-4" aria-label="Posts">
          <div className="lg:hidden">
            <FeedNav scope={effectiveScope} setScope={setScope} me={me} compact />
          </div>

          <label className="relative block">
            <span className="sr-only">Search people, skills, proofs</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-dim" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={80}
              placeholder="Search people, skills, proofs"
              className="h-[42px] w-full rounded-[10px] border border-border bg-surface pl-10 pr-3.5 text-[15px] text-ink placeholder:text-ink-dim focus-visible:outline-2 focus-visible:outline-karma"
            />
          </label>

          {meLoading ? (
            <ComposerSkeleton />
          ) : me ? (
            // Composer reads ?attach= via useSearchParams, so it needs its own Suspense boundary.
            <Suspense fallback={<ComposerSkeleton />}>
              <Composer me={me} />
            </Suspense>
          ) : (
            <SignedOutComposer />
          )}

          {effectiveScope === "all" ? (
            <SortTabs sort={sort} setSort={setSort} panelId={panelId} />
          ) : (
            <div className="flex flex-col gap-1">
              <h2 className="display m-0 text-xl font-bold">{scopeInfo.title}</h2>
              <p className="m-0 text-sm text-ink-dim">{scopeInfo.blurb}</p>
            </div>
          )}

          <div
            id={panelId}
            role={effectiveScope === "all" ? "tabpanel" : undefined}
            aria-labelledby={effectiveScope === "all" ? `feed-tab-${sort}` : undefined}
            aria-busy={feed.isFetching}
            className="flex flex-col gap-4"
          >
            {feed.isLoading || meLoading ? (
              <>
                <span className="sr-only" role="status">
                  Loading posts
                </span>
                <PostSkeleton />
                <PostSkeleton />
                <PostSkeleton />
              </>
            ) : feed.isError ? (
              <StateCard
                role="alert"
                tone="error"
                label="Feed unavailable"
                title="Couldn't load the feed"
                body={errorMessage(feed.error)}
                action={
                  <Button variant="outline" onClick={() => feed.refetch()}>
                    Retry
                  </Button>
                }
              />
            ) : (feed.data ?? []).length === 0 ? (
              <FeedEmpty q={q} scope={effectiveScope} sort={sort} onReset={() => { setSearch(""); setScope("all"); }} />
            ) : (
              (feed.data ?? []).map((p) => <PostCard key={p.rowId} post={p} me={me} />)
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-4 md:sticky md:top-[92px]" aria-label="Your proof and suggestions">
          <FeedSidebar me={me} />
        </aside>
      </div>
    </div>
  );
}

function FeedEmpty({ q, scope, sort, onReset }: { q: string; scope: FeedScope; sort: FeedSort; onReset: () => void }) {
  if (q) {
    return (
      <EmptyState
        title={`Nothing matches “${q}”`}
        description="Try a handle, a name, or a word from the post."
        action={
          <Button variant="outline" onClick={onReset}>
            Clear search
          </Button>
        }
      />
    );
  }
  if (scope === "following") {
    return (
      <StateCard
        label="Empty feed"
        title="Follow people by skill"
        body="Endorse posts from devs in your stack and their new proof shows up here."
        action={
          <Button variant="outline" onClick={onReset}>
            Browse Most proven
          </Button>
        }
      />
    );
  }
  if (scope === "endorsed") {
    return <EmptyState title="No endorsements yet" description="Sign an endorsement on a post with proof you trust." />;
  }
  if (sort === "hiring") {
    return <EmptyState title="No hiring posts yet" description="Posts tagged #hiring show up here." />;
  }
  return <EmptyState title="No posts yet" description="Ship something, attach the proof and be the first to post." />;
}
