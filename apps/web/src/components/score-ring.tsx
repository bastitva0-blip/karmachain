import type { Tier } from "@karma/shared";

const color: Record<Tier | "accent", string> = {
  top: "var(--tier-top)",
  medium: "var(--tier-medium)",
  basic: "var(--tier-basic-ring)",
  accent: "var(--karma)",
};

const C = 2 * Math.PI * 40;

/** SVG ring, r=40, stroke 8 (viewBox 92), coloured by tier. */
export function ScoreRing({
  score,
  tier,
  size = 84,
  showMax = false,
  accent = false,
}: {
  score: number;
  tier: Tier;
  size?: number;
  showMax?: boolean;
  accent?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 92 92" role="img" aria-label={`Score ${score} out of 100`}>
        <circle cx="46" cy="46" r="40" stroke="var(--track)" strokeWidth="8" fill="none" />
        <circle
          cx="46"
          cy="46"
          r="40"
          stroke={color[accent ? "accent" : tier]}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 46 46)"
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display font-extrabold leading-none" style={{ fontSize: Math.round(size * 0.31) }}>
          {score}
        </span>
        {showMax && <span className="mt-0.5 text-[11px] text-ink-dim">/ 100</span>}
      </span>
    </div>
  );
}
