"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section role="alert" className="container-kc flex flex-1 flex-col items-center justify-center gap-5 py-24 text-center">
      <svg width="120" height="120" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r="30" fill="none" stroke="#FF9D8A" strokeWidth="3" strokeDasharray="6 5" />
        <path d="M32 18v18M32 44v2" stroke="#FF9D8A" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="font-mono text-sm tracking-[0.06em] text-error">500 · SOMETHING BROKE</span>
      <h1 className="display m-0 text-[clamp(32px,4.5vw,48px)] font-extrabold leading-[1.04]">That&apos;s on us</h1>
      <p className="m-0 max-w-[460px] text-[17px] leading-[1.55] text-ink-muted">
        Nothing on-chain was affected. Try again — if it keeps happening, share this code with us.
      </p>
      {error.digest && <code className="rounded-md bg-surface-2 px-2.5 py-1 font-mono text-sm text-ink-muted">req_{error.digest}</code>}
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </section>
  );
}
