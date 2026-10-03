import type { Tier } from "@karma/shared";
import { cn } from "@/lib/utils";

const styles: Record<Tier, string> = {
  top: "bg-tier-top text-tier-top-ink",
  medium: "bg-tier-medium text-tier-medium-ink",
  basic: "bg-tier-basic text-tier-basic-ink",
};
export const TIER_LABEL: Record<Tier, string> = { basic: "Basic", medium: "Medium", top: "Top" };

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-semibold";

/** Filled tier pill. `label` overrides the text (e.g. "TypeScript · Top"). */
export function TierBadge({ tier, label, className }: { tier: Tier; label?: string; className?: string }) {
  return (
    <span className={cn(pill, styles[tier], className)}>
      {label ?? (
        <>
          <span className="sr-only">Tier: </span>
          {TIER_LABEL[tier]}
        </>
      )}
    </span>
  );
}

export function SelfDeclaredBadge({ className }: { className?: string }) {
  return <span className={cn(pill, "border border-dashed border-warning text-warning", className)}>Self-declared</span>;
}

export function DemoBadge({ className }: { className?: string }) {
  return <span className={cn(pill, "border border-border-strong text-ink-muted", className)}>Demo profile</span>;
}

/** Neutral info pill (skill tags, "Fresh wallet", network). */
export function Pill({
  children,
  tone = "karma",
  className,
}: {
  children: React.ReactNode;
  tone?: "karma" | "warning" | "success";
  className?: string;
}) {
  return (
    <span
      className={cn(
        pill,
        tone === "karma" && "bg-surface-2 text-karma",
        tone === "warning" && "bg-warning-bg text-warning",
        tone === "success" && "bg-verified-bg text-verified",
        className,
      )}
    >
      {children}
    </span>
  );
}
