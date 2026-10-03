import { cn } from "@/lib/utils";

/**
 * "The Seal": a K pressed into a solid circle, like a wax seal.
 * Dark UI: lavender circle, ground-coloured K. Light: deep violet circle, ink K.
 * Dashed inner ring only at 120px and above.
 */
const THEMES = {
  dark: { fill: "#B9A6FF", stroke: "#0B0A10" },
  light: { fill: "#4B32C3", stroke: "#EDEAF5" },
} as const;

export const sealStroke = (size: number) => (size >= 40 ? 6.5 : size >= 24 ? 7 : 8);

export function LogoMark({
  size = 28,
  theme = "dark",
  className,
  title,
}: {
  size?: number;
  theme?: keyof typeof THEMES;
  className?: string;
  title?: string;
}) {
  const t = THEMES[theme];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="32" cy="32" r="30" fill={t.fill} />
      {size >= 120 && <circle cx="32" cy="32" r="25" fill="none" stroke={t.stroke} strokeWidth="1.5" strokeDasharray="2 3" />}
      <path
        d="M24 17v30M24 35l15-18M30 29l11 18"
        stroke={t.stroke}
        strokeWidth={sealStroke(size)}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({
  variant = "lockup",
  size = 28,
  theme = "dark",
  className,
}: {
  variant?: "mark" | "lockup";
  size?: number;
  theme?: keyof typeof THEMES;
  className?: string;
}) {
  if (variant === "mark") return <LogoMark size={size} theme={theme} className={className} title="KarmaChain" />;
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} theme={theme} />
      <span className={cn("display text-[19px] font-bold", theme === "dark" ? "text-ink" : "text-ground")}>KarmaChain</span>
    </span>
  );
}
