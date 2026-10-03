import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "warning" | "error" | "success";
const toneCls: Record<Tone, string> = {
  default: "border-border",
  warning: "border-warning-border",
  error: "border-error-border",
  success: "border-verified-border",
};

export function Card({ className, tone = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return <div className={cn("rounded-2xl border bg-surface text-ink", toneCls[tone], className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("display text-xl font-bold leading-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-ink-muted", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

/** Mono eyebrow label (12px, uppercase, accent). */
export function Eyebrow({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "dim" | "warning" | "error" | "success" }) {
  return (
    <span
      className={cn(
        "eyebrow",
        tone === "dim" && "text-ink-dim",
        tone === "warning" && "text-warning",
        tone === "error" && "text-error",
        tone === "success" && "text-verified",
        className,
      )}
      {...props}
    />
  );
}

/** Small state card used for the "other states" of each screen. */
export function StateCard({
  label,
  title,
  body,
  tone = "default",
  action,
  className,
  role,
}: {
  label: string;
  title: string;
  body?: React.ReactNode;
  tone?: Tone;
  action?: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const eyebrowTone = tone === "warning" ? "warning" : tone === "error" ? "error" : tone === "success" ? "success" : "dim";
  return (
    <Card tone={tone} role={role} className={cn("flex flex-col gap-2.5 p-5", className)}>
      <Eyebrow tone={eyebrowTone}>{label}</Eyebrow>
      <strong className="display text-lg font-bold">{title}</strong>
      {body ? <div className="text-sm text-ink-muted">{body}</div> : null}
      {action ? <div className="mt-1 self-start">{action}</div> : null}
    </Card>
  );
}
