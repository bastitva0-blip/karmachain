import { initials } from "@/lib/chrome";
import { cn } from "@/lib/utils";

/** GitHub avatar when we have one, else initials on the brand avatar colour. */
export function Avatar({
  src,
  name,
  size = 36,
  tone = "karma",
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  tone?: "karma" | "blue";
  className?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "display grid shrink-0 place-items-center rounded-full font-bold",
        tone === "karma" ? "bg-avatar text-karma" : "bg-[#1E2A3D] text-tier-medium",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.34)) }}
    >
      {initials(name)}
    </span>
  );
}
