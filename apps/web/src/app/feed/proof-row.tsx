import { ArrowUpRight, BadgeCheck, Check, Mic, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedProof, ProofType } from "./types";

const ICON: Record<ProofType, { icon: React.ReactNode; cls: string }> = {
  token: { icon: <BadgeCheck className="size-[18px]" aria-hidden />, cls: "bg-verified-bg text-verified" },
  pr: { icon: <Check className="size-[18px]" strokeWidth={3} aria-hidden />, cls: "bg-verified-bg text-verified" },
  review: { icon: <Star className="size-[18px]" aria-hidden />, cls: "bg-surface-2 text-tier-top" },
  interview: { icon: <Mic className="size-[18px]" aria-hidden />, cls: "bg-surface-2 text-karma" },
};

export const PROOF_NOUN: Record<ProofType, string> = { token: "Token", pr: "Merged PR", review: "Review", interview: "Interview" };

/** One attached proof: icon, label, detail and a link out to where it can be checked. */
export function ProofRow({ proof, onRemove, attached }: { proof: FeedProof; onRemove?: () => void; attached?: boolean }) {
  const { icon, cls } = ICON[proof.type];
  const linkText = proof.type === "review" || proof.type === "interview" ? "EAS" : "View";
  return (
    <div className={cn("flex items-center gap-3.5 rounded-xl border bg-ground p-3.5", attached ? "border-verified-border" : "border-border")}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", cls)}>{icon}</span>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <strong className="truncate text-sm">{proof.label}</strong>
        <span className="truncate font-mono text-xs text-ink-dim">{proof.detail}</span>
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove attached proof: ${proof.label}`}
          className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-transparent text-ink-muted hover:border-border-strong hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : proof.url ? (
        <a href={proof.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-0.5 text-[13px]">
          {linkText} <ArrowUpRight className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in new tab)</span>
        </a>
      ) : null}
    </div>
  );
}
