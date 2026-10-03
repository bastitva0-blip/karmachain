import { cn } from "@/lib/utils";

/** Dashed-border empty state: title, one line on what to do next, optional action. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border-strong p-6 text-center", className)}>
      <strong className="display text-lg font-bold">{title}</strong>
      {description ? <p className="m-0 text-sm text-ink-dim">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
