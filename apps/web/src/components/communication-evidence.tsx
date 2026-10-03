"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/interview-types";

interface Item {
  source: string;
  quote: string;
  t: number | null;
  observation: string;
  url: string | null;
}

/** Soft skills shown only as quoted evidence, with a bias note. Never a score or ranking. */
export function CommunicationEvidence({ handle }: { handle: string }) {
  const q = useQuery({
    queryKey: ["comm", handle],
    queryFn: () => api<{ cards: Item[]; note: string }>(`/profile/${encodeURIComponent(handle)}/communication`),
  });
  const cards = q.data?.cards ?? [];
  return (
    <Card className="flex flex-col gap-[18px] p-7" aria-labelledby="ce-h">
      <h2 id="ce-h" className="display m-0 text-2xl font-bold">
        Communication evidence
      </h2>
      {cards.length === 0 ? (
        <p className="m-0 text-sm text-ink-muted">
          No public quotes yet. They appear when the developer anchors an interview result or a client signs a review.
        </p>
      ) : (
        cards.slice(0, 4).map((c, i) => (
          <blockquote key={i} className="m-0 flex flex-col gap-2 rounded-xl bg-ground p-4">
            <p className="m-0 leading-[1.55]">&ldquo;{c.quote}&rdquo;</p>
            <span className="font-mono text-xs text-ink-dim">
              {c.source}
              {c.t !== null && ` · ${fmtTime(c.t)}`}
              {c.observation && ` · ${c.observation}`}
              {c.url && (
                <>
                  {" · "}
                  <a href={c.url} target="_blank" rel="noreferrer">
                    attestation ↗
                  </a>
                </>
              )}
            </span>
          </blockquote>
        ))
      )}
      <p className="m-0 text-[13px] leading-normal text-ink-dim">Quotes only, never a score. AI speech analysis can be biased.</p>
    </Card>
  );
}
