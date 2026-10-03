"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { GithubIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, StateCard } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PROOF_NOUN, ProofRow } from "./proof-row";
import type { FeedProof, ProofType } from "./types";

const MAX_TEXT = 1000;
const MAX_PROOFS = 4;
const TYPES: ProofType[] = ["token", "pr", "review", "interview"];
const NONE_YET: Record<ProofType, string> = {
  token: "No minted skill tokens yet",
  pr: "No verified merged PRs yet",
  review: "No client reviews yet",
  interview: "No anchored interviews yet",
};

const isNotOursError = (msg: string) => /isn't yours|linked to your account/i.test(msg);

/** Parse `<type>:<ref>` and find that proof. Tokens also match by token id (the "SBT #0012" in detail). */
export function matchAttachParam(param: string | null, proofs: FeedProof[]): FeedProof | null {
  if (!param) return null;
  const i = param.indexOf(":");
  if (i < 1) return null;
  const type = param.slice(0, i);
  const ref = param.slice(i + 1);
  if (!ref || !(TYPES as string[]).includes(type)) return null;
  return (
    proofs.find((p) => {
      if (p.type !== type) return false;
      if (p.ref === ref) return true;
      const id = p.type === "token" ? /SBT #0*(\d+)/.exec(p.detail)?.[1] : undefined;
      return id !== undefined && /^\d+$/.test(ref) && Number(id) === Number(ref);
    }) ?? null
  );
}

export function SignedOutComposer() {
  return (
    <StateCard
      label="Signed out"
      title="Sign in to post your proof"
      body="Posts carry verified tokens, merged PRs, reviews and interviews. Anyone can read the feed."
      action={
        <Button asChild>
          <a href="/api/auth/github">
            <GithubIcon className="size-[18px]" /> Continue with GitHub
          </a>
        </Button>
      }
    />
  );
}

export function ComposerSkeleton() {
  return (
    <Card className="flex flex-col gap-3.5 p-5" aria-busy aria-label="Loading composer">
      <div className="flex gap-3">
        <Skeleton className="size-11 rounded-full" />
        <Skeleton className="h-[84px] grow rounded-xl" />
      </div>
      <Skeleton className="ml-auto h-11 w-36" />
    </Card>
  );
}

export function Composer({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<FeedProof[]>([]);
  const [picking, setPicking] = useState<ProofType | null>(null);
  const [notOurs, setNotOurs] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachParam = useSearchParams().get("attach");

  const mine = useQuery({
    queryKey: ["feed", "my-proofs"],
    queryFn: () => api<{ proofs: FeedProof[] }>("/feed/my-proofs").then((r) => r.proofs),
  });

  // `/feed?attach=<type>:<ref>` (e.g. from the mint success screen) pre-selects that proof once
  // /feed/my-proofs loads. Done during render (not in an effect) per React's "adjusting state" pattern.
  const [prefilled, setPrefilled] = useState(false);
  const [focusComposer, setFocusComposer] = useState(false);
  if (!prefilled && mine.data) {
    setPrefilled(true);
    const match = matchAttachParam(attachParam, mine.data);
    if (match) {
      setAttached([match]);
      setFocusComposer(true);
    }
  }
  useEffect(() => {
    if (focusComposer) textareaRef.current?.focus();
  }, [focusComposer]);

  const post = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/feed", { method: "POST", json: { text: text.trim(), proofs: attached.map(({ type, ref }) => ({ type, ref })) } }),
    onSuccess: () => {
      setText("");
      setAttached([]);
      setPicking(null);
      setNotOurs(false);
      toast.success(attached.length ? "Posted with proof" : "Posted");
      void qc.invalidateQueries({ queryKey: ["feed", "list"] });
    },
    onError: (e) => {
      const msg = errorMessage(e);
      if (isNotOursError(msg)) setNotOurs(true);
      else toast.error(msg);
    },
  });

  const isAttached = (p: FeedProof) => attached.some((a) => a.type === p.type && a.ref === p.ref);
  const options = picking ? (mine.data ?? []).filter((p) => p.type === picking && !isAttached(p)) : [];
  const full = attached.length >= MAX_PROOFS;
  const canPost = text.trim().length > 0 && text.length <= MAX_TEXT && !post.isPending;

  function attach(p: FeedProof) {
    setAttached((a) => [...a, p]);
    setNotOurs(false);
    setPicking(null);
  }

  return (
    <Card className="flex flex-col gap-3.5 p-5" role="region" aria-label="New post">
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canPost) post.mutate();
        }}
      >
        <div className="flex gap-3">
          <Avatar src={me.avatarUrl} name={me.name ?? me.githubHandle} size={44} />
          <label className="flex grow flex-col gap-1">
            <span className="sr-only">Post text</span>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_TEXT}
              placeholder="What did you ship? Attach the proof."
              className="h-[84px] w-full resize-y rounded-xl border border-border-strong bg-ground p-3 text-[15px] leading-normal text-ink placeholder:text-ink-dim focus-visible:outline-2 focus-visible:outline-karma"
              aria-describedby="composer-hint"
            />
            <span id="composer-hint" className="flex justify-between gap-2 text-xs text-ink-dim">
              <span>
                Add <span className="font-mono">#hiring</span> to list it under Hiring.
              </span>
              <span className={cn("font-mono", text.length > MAX_TEXT - 50 && "text-warning")}>
                {text.length}/{MAX_TEXT}
              </span>
            </span>
          </label>
        </div>

        {attached.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Attached proofs">
            {attached.map((p) => (
              <li key={`${p.type}:${p.ref}`}>
                <ProofRow proof={p} attached onRemove={() => setAttached((a) => a.filter((x) => x !== p))} />
              </li>
            ))}
          </ul>
        )}

        {notOurs && (
          <StateCard
            role="alert"
            tone="error"
            label="Proof not ours"
            title="That PR isn't yours"
            body="Only proofs linked to your GitHub can be attached."
          />
        )}

        {picking && (
          <div className="flex flex-col gap-2 rounded-xl border border-border-strong bg-ground p-3" role="group" aria-label={`Attach a ${PROOF_NOUN[picking]}`}>
            <div className="flex items-center justify-between">
              <span className="eyebrow">ATTACH {PROOF_NOUN[picking].toUpperCase()}</span>
              <Button variant="ghost" size="sm" onClick={() => setPicking(null)}>
                Cancel
              </Button>
            </div>
            {options.length === 0 ? (
              <p className="m-0 text-sm text-ink-dim">Everything of this kind is already attached.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {options.map((p) => (
                  <li key={`${p.type}:${p.ref}`}>
                    <button
                      type="button"
                      onClick={() => attach(p)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-[10px] border border-border px-3 py-2.5 text-left hover:border-karma hover:bg-surface-2"
                    >
                      <strong className="text-sm">{p.label}</strong>
                      <span className="font-mono text-xs text-ink-dim">{p.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Attach proof">
            {mine.isLoading ? (
              <Skeleton className="h-10 w-64" />
            ) : mine.isError ? (
              <span className="text-[13px] text-error" role="alert">
                Couldn&apos;t load your proofs.{" "}
                <button type="button" className="underline" onClick={() => mine.refetch()}>
                  Retry
                </button>
              </span>
            ) : (
              TYPES.map((t) => {
                const count = (mine.data ?? []).filter((p) => p.type === t).length;
                const disabled = count === 0 || full;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={disabled}
                    aria-expanded={picking === t}
                    title={count === 0 ? NONE_YET[t] : full ? `Up to ${MAX_PROOFS} proofs per post` : undefined}
                    onClick={() => setPicking((cur) => (cur === t ? null : t))}
                    className={cn(
                      "inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border-strong px-3 text-sm font-medium text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45",
                      picking === t && "bg-surface-2 text-ink",
                    )}
                  >
                    <Plus className="size-3.5" aria-hidden /> {PROOF_NOUN[t]}
                  </button>
                );
              })
            )}
          </div>
          <Button type="submit" disabled={!canPost}>
            {post.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {attached.length ? "Post with proof" : "Post"}
          </Button>
        </div>
        {!mine.isLoading && !mine.isError && (mine.data ?? []).length === 0 && (
          <p className="m-0 text-[13px] text-ink-dim">
            No verified proof to attach yet. <a href="/dashboard">Verify a skill</a> and posts with proof rank higher.
          </p>
        )}
      </form>
    </Card>
  );
}
