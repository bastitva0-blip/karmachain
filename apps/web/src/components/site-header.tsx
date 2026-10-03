"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { GithubIcon } from "./icons";
import { Avatar } from "./avatar";
import { Logo } from "./brand/Logo";
import { Button } from "./ui/button";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { isImmersive } from "@/lib/chrome";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const { me } = useMe();
  const qc = useQueryClient();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (isImmersive(path)) return null;

  const nav = me
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/feed", label: "Feed" },
        { href: `/u/${me.githubHandle}`, label: "My profile" },
        { href: "/recruiter", label: "Recruiters" },
        { href: "/import", label: "Import" },
      ]
    : [
        { href: "/#how", label: "How it works" },
        { href: "/feed", label: "Proof feed" },
        { href: "/recruiter", label: "Recruiters" },
        { href: "/demo", label: "Demo" },
      ];

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    qc.clear();
    qc.setQueryData(["me"], null);
    setOpen(false);
    router.push("/");
  }

  const isCurrent = (href: string) => href !== "/#how" && (path === href || path.startsWith(`${href}/`));

  return (
    <header className="sticky top-0 z-40 border-b border-border-soft bg-ground/90 backdrop-blur-md">
      <div className="container-kc flex h-[68px] items-center justify-between gap-6">
        <Link href="/" aria-label="KarmaChain home" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
          <Logo size={28} />
          {path.startsWith("/recruiter") && (
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-karma">Recruiter</span>
          )}
          {path.startsWith("/admin") && (
            <span className="rounded-full bg-error-bg px-2.5 py-0.5 text-xs font-semibold text-error">Admin</span>
          )}
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 text-[15px] md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isCurrent(n.href) ? "page" : undefined}
              className={cn(
                "no-underline",
                isCurrent(n.href) ? "font-semibold text-ink hover:text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {me ? (
            <>
              <span className="font-mono text-[13px] text-ink-dim">@{me.githubHandle}</span>
              <Avatar src={me.avatarUrl} name={me.githubHandle} size={36} />
              <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out">
                <LogOut />
              </Button>
            </>
          ) : (
            <Button asChild variant="outline">
              <a href="/api/auth/github">
                <GithubIcon className="size-[18px]" /> Sign in
              </a>
            </Button>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="container-kc flex flex-col border-t border-border-soft pb-3 md:hidden">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="border-b border-border py-3 text-ink no-underline hover:text-ink"
            >
              {n.label}
            </Link>
          ))}
          {me ? (
            <button type="button" onClick={logout} className="py-3 text-left text-ink">
              Sign out
            </button>
          ) : (
            <a href="/api/auth/github" className="py-3 text-ink no-underline">
              Sign in with GitHub
            </a>
          )}
        </nav>
      )}
    </header>
  );
}
