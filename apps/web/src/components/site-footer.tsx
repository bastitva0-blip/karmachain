"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BASESCAN, deployments, isDeployed } from "@karma/shared";
import { isImmersive } from "@/lib/chrome";

export function SiteFooter() {
  const path = usePathname();
  if (isImmersive(path)) return null;
  const sbt = process.env.NEXT_PUBLIC_SBT_ADDRESS || deployments.sbt;
  return (
    <footer className="border-t border-border-soft">
      <div className="container-kc flex flex-wrap justify-between gap-4 py-8 text-sm text-ink-dim">
        <span>KarmaChain · built at CodeBlitz 2.0, Lucknow · Base Sepolia testnet</span>
        <div className="flex gap-6">
          <a href="https://github.com/bastitva0-blip/project-7" target="_blank" rel="noreferrer">
            GitHub
          </a>
          {isDeployed(sbt) && (
            <a href={`${BASESCAN}/address/${sbt}`} target="_blank" rel="noreferrer">
              Contracts on Basescan
            </a>
          )}
          <Link href="/privacy">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
