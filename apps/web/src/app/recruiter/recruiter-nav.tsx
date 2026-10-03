"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/recruiter", label: "Find candidates" },
  { href: "/recruiter/interviews", label: "Interviews" },
] as const;

/** Recruiter sub-navigation, shown under the site header on every /recruiter page. */
export function RecruiterNav() {
  const path = usePathname().replace(/\/$/, "") || "/";
  return (
    <div className="border-b border-border-soft">
      <nav aria-label="Recruiter" className="mx-auto flex w-full max-w-[1360px] gap-6 overflow-x-auto px-6 text-[15px]">
        {LINKS.map((l) => {
          const current = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-12 shrink-0 items-center border-b-2 no-underline",
                current ? "border-karma font-semibold text-ink hover:text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
