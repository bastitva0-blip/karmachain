"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, MessageSquare, PenLine, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { useAccount, useAccountEffect, useSignMessage } from "wagmi";
import { Avatar } from "@/components/avatar";
import { TierBadge } from "@/components/tier-badge";
import { truncate } from "@/components/tx-link";
import { Button } from "@/components/ui/button";
import { Card, StateCard } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProofRow } from "./proof-row";
import { ago, endorseMessage, type FeedAuthor, type FeedPost } from "./types";

const act =
  "inline-flex h-10 items-center gap-2 rounded-[10px] border border-transparent px-3 text-sm font-medium text-ink-muted hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-transparent";

function DemoTag() {
  return <span className="inline-flex items-center rounded-full border border-border-strong px-2.5 py-[3px] text-xs font-medium text-ink-muted">Demo</span>;
}

function AuthorLine({ author, createdAt, size = 44 }: { author: FeedAuthor; createdAt: string; size?: number }) {
  const display = author.name ?? author.handle;
  return (
    <div className="flex items-center gap-3">
      <Avatar src={author.avatarUrl} name={display} size={size} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/u/${author.handle}`} className="font-semibold text-ink no-underline hover:text-karma">
            {display}
          </Link>
          {author.tier !== "none" && author.tierLabel && <TierBadge tier={author.tier} label={author.tierLabel} />}
          {author.isDemo && <DemoTag />}
        </div>
        <span className="text-[13px] text-ink-dim">
          @{author.handle} · <time dateTime={createdAt}>{ago(createdAt)}</time>
        </span>
      </div>
    </div>
  );
}

export function PostSkeleton() {
  return (
    <Card className="flex flex-col gap-3.5 p-[22px]" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex grow flex-col gap-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <Skeleton className="h-3.5" />
      <Skeleton className="h-3.5 w-4/5" />
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-10 w-2/3" />
    </Card>
  );
}

export function PostCard({ post, me }: { post: FeedPost; me: Me | null }) {
  const qc = useQueryClient();
  const threadId = useId();
  const [open, setOpen] = useState(false);
  const [needsWallet, setNeedsWallet] = useState(false);
  const pendingConnect = useRef(false);
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const own = me?.githubHandle === post.author.handle;
  const noProof = post.proofs.length === 0;

  const refreshFeed = () => qc.invalidateQueries({ queryKey: ["feed", "list"] });

  const endorse = useMutation({
    mutationFn: async (signer: string) => {
      if (!me) throw new Error("Sign in to endorse");
      const signature = await signMessageAsync({ message: endorseMessage(post.id, me.githubHandle) });
      return api<{ ok: true; weight: number }>(`/feed/${post.id}/endorse`, { method: "POST", json: { signature, address: signer } });
    },
    onSuccess: (r) => {
      toast.success(`Endorsed · weight ${r.weight}`);
      void refreshFeed();
      void qc.invalidateQueries({ queryKey: ["feed", "sidebar"] });
    },
    onError: (e) => {
      const msg = errorMessage(e);
      if (/link a wallet/i.test(msg)) setNeedsWallet(true);
      toast.error(/User rejected|denied/i.test(msg) ? "Signature cancelled" : msg);
    },
  });

  const repost = useMutation({
    mutationFn: () => api<{ ok: true }>(`/feed/${post.id}/repost`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Reposted");
      void refreshFeed();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function signWith(signer: string) {
    if (!me?.walletAddress) return;
    if (signer.toLowerCase() !== me.walletAddress.toLowerCase()) {
      toast.error(`Connected wallet ${truncate(signer)} isn't the one linked to @${me.githubHandle}. Switch to ${truncate(me.walletAddress)} to endorse.`);
      return;
    }
    endorse.mutate(signer);
  }

  // After the connect modal finishes, carry on with the endorsement the user asked for.
  useAccountEffect({
    onConnect({ address: connected }) {
      if (!pendingConnect.current) return;
      pendingConnect.current = false;
      signWith(connected);
    },
  });

  function onEndorse() {
    if (!me) {
      toast("Sign in to endorse", {
        action: { label: "Sign in", onClick: () => window.location.assign(new URL("/api/auth/github", window.location.origin).href) },
      });
      return;
    }
    if (!me.walletAddress) {
      setNeedsWallet(true);
      return;
    }
    if (!isConnected || !address) {
      pendingConnect.current = true;
      openConnectModal?.();
      return;
    }
    signWith(address);
  }

  const endorseLabel = own ? "Your post" : post.viewerEndorsed ? "Endorsed" : "Endorse";

  return (
    <Card className={cn("flex flex-col gap-3.5 p-[22px]", noProof && "border-dashed")}>
      <article className="flex flex-col gap-3.5" aria-labelledby={`${threadId}-a`}>
        {post.repostedBy && (
          <span className="flex items-center gap-1.5 text-[13px] text-ink-dim">
            <Repeat2 className="size-4" aria-hidden /> Reposted by @{post.repostedBy.handle}
          </span>
        )}
        <div id={`${threadId}-a`}>
          <AuthorLine author={post.author} createdAt={post.createdAt} />
        </div>
        <p className="m-0 whitespace-pre-wrap break-words text-base leading-relaxed">{post.text}</p>

        {noProof ? (
          <div className="rounded-[10px] bg-warning-bg px-3 py-2.5 text-[13px] text-warning-ink">No proof attached · shown lower in the feed</div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Attached proof">
            {post.proofs.map((p) => (
              <li key={`${p.type}:${p.ref}`}>
                <ProofRow proof={p} />
              </li>
            ))}
          </ul>
        )}

        {needsWallet && (
          <StateCard
            tone="warning"
            label="Endorse needs wallet"
            title="Sign to endorse"
            body="Endorsements are signatures, so they can't be botted. Link a wallet on your dashboard first."
            action={
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link href="/dashboard">Link wallet</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNeedsWallet(false)}>
                  Not now
                </Button>
              </div>
            }
          />
        )}

        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2.5">
          <button
            type="button"
            className={cn(act, post.viewerEndorsed && "text-karma")}
            onClick={onEndorse}
            disabled={own || post.viewerEndorsed || endorse.isPending}
            aria-label={`${endorseLabel}, ${post.endorsements} endorsements`}
          >
            {endorse.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PenLine className="size-4" aria-hidden />}
            {endorseLabel} <span className="font-mono">{post.endorsements}</span>
          </button>
          <button
            type="button"
            className={cn(act, open && "border-border-strong text-ink")}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={`${threadId}-thread`}
            aria-label={`Reply, ${post.replies} replies`}
          >
            <MessageSquare className="size-4" aria-hidden /> Reply <span className="font-mono">{post.replies}</span>
          </button>
          <button
            type="button"
            className={act}
            onClick={() => (me ? repost.mutate() : toast("Sign in to repost"))}
            disabled={repost.isPending || own}
            aria-label={`Repost, ${post.reposts} reposts`}
          >
            {repost.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Repeat2 className="size-4" aria-hidden />} Repost
            {post.reposts > 0 && <span className="font-mono">{post.reposts}</span>}
          </button>
          {post.topTierEndorsements > 0 && (
            <span className="ml-auto text-[13px] text-ink-dim">
              {post.topTierEndorsements} endorsement{post.topTierEndorsements === 1 ? "" : "s"} from Top-tier devs
            </span>
          )}
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={`${threadId}-thread`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <Thread postId={post.id} me={me} />
            </motion.div>
          )}
        </AnimatePresence>
      </article>
    </Card>
  );
}

function Thread({ postId, me }: { postId: string; me: Me | null }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const replies = useQuery({
    queryKey: ["feed", "replies", postId],
    queryFn: () => api<{ items: FeedPost[] }>(`/feed/${postId}/replies`).then((r) => r.items),
  });
  const reply = useMutation({
    mutationFn: () => api<{ id: string }>(`/feed/${postId}/reply`, { method: "POST", json: { text: text.trim() } }),
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["feed", "replies", postId] });
      void qc.invalidateQueries({ queryKey: ["feed", "list"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-3 border-l-2 border-border pl-4">
      {replies.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy aria-label="Loading replies">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      ) : replies.isError ? (
        <p role="alert" className="m-0 text-sm text-error">
          Couldn&apos;t load replies.{" "}
          <button type="button" className="underline" onClick={() => replies.refetch()}>
            Retry
          </button>
        </p>
      ) : (replies.data ?? []).length === 0 ? (
        <p className="m-0 text-sm text-ink-dim">No replies yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Replies">
          {(replies.data ?? []).map((r) => (
            <li key={r.rowId} className="flex flex-col gap-1.5">
              <AuthorLine author={r.author} createdAt={r.createdAt} size={32} />
              <p className="m-0 whitespace-pre-wrap break-words pl-11 text-[15px] leading-relaxed">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
      {me ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !reply.isPending) reply.mutate();
          }}
        >
          <label className="grow">
            <span className="sr-only">Reply</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Write a reply"
              className="h-10 w-full rounded-[10px] border border-border-strong bg-ground px-3 text-sm text-ink placeholder:text-ink-dim focus-visible:outline-2 focus-visible:outline-karma"
            />
          </label>
          <Button type="submit" size="sm" className="h-10" disabled={!text.trim() || reply.isPending}>
            {reply.isPending && <Loader2 className="animate-spin" aria-hidden />} Reply
          </Button>
        </form>
      ) : (
        <p className="m-0 text-sm text-ink-dim">
          <a href="/api/auth/github">Sign in</a> to reply.
        </p>
      )}
    </div>
  );
}
