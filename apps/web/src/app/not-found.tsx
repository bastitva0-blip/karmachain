import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ChariotWheel } from "@/components/chariot-wheel";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <section className="container-kc flex flex-1 flex-col items-center justify-center gap-5 py-24 text-center">
      <ChariotWheel />
      <span className="font-mono text-sm tracking-[0.06em] text-karma">404</span>
      <h1 className="display m-0 text-[clamp(36px,5vw,56px)] font-extrabold leading-[1.02] tracking-[-0.03em]">This page left the chariot</h1>
      <p className="m-0 max-w-[460px] text-[17px] leading-[1.55] text-ink-muted">
        The link may be old, or the profile was deleted by its owner.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/">Back home</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/evidence">Verify a hash</Link>
        </Button>
      </div>
    </section>
  );
}
