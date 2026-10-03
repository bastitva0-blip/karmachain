import Link from "next/link";
import type { Metadata } from "next";
import { BASESCAN, deployments, isDeployed } from "@karma/shared";
import { Button } from "@/components/ui/button";
import { truncate } from "@/components/tx-link";

export const metadata: Metadata = { title: "Privacy", description: "What KarmaChain reads, stores and never does." };

const rows: { data: string; note?: string; where: string; del: string; ok: boolean }[] = [
  { data: "Public GitHub repos & PRs", note: "read-only, never write access", where: "Read during analysis, not copied", del: "Nothing stored", ok: true },
  {
    data: "Your code",
    where: "Up to 3 sample files per language sent to the AI, then discarded. Zip uploads stay in memory only.",
    del: "Never stored",
    ok: true,
  },
  { data: "Scores & evidence JSON", where: "Our database", del: "Yes — Delete my data", ok: true },
  { data: "Evidence hash & tier", where: "On-chain, inside your soulbound token", del: "Can't be erased · can be burned", ok: false },
  { data: "GitHub login token", where: "Encrypted, used only for analysis", del: "Deleted on logout", ok: true },
  { data: "Interview audio & transcript", where: "ElevenLabs + our database, with your consent", del: "Yes", ok: true },
  { data: "Client reviews", where: "EAS attestation (on-chain) signed by the client", del: "Revocable by the client", ok: false },
];

const rules = [
  ["Opt-in to be found", 'Recruiters only see you if you turn on "Let recruiters find me".'],
  ["Consent before recording", "No interview starts until you tick the recording box."],
  ["No automatic rejection", "Reports support decisions. A human always makes them."],
  ["No accent or personality scores", "Soft skills appear only as quoted evidence, never as a number."],
  ["AI can't decide alone", "The AI adds at most 10 of 100 points and can never trigger a transaction."],
  ["Demo data is labelled", "Every seeded profile carries a Demo badge. No fake users."],
];

export default function PrivacyPage() {
  const sbt = process.env.NEXT_PUBLIC_SBT_ADDRESS || deployments.sbt;
  return (
    <div className="container-kc flex max-w-[1000px] flex-col gap-10 py-14 md:py-20">
      <div className="flex flex-col gap-3">
        <span className="eyebrow text-xs">/privacy</span>
        <h1 className="display m-0 text-[clamp(34px,4.5vw,52px)] font-extrabold leading-[1.04]">What we read, store and never do</h1>
        <p className="m-0 text-[17px] leading-[1.6] text-ink-muted">Plain language, no legalese. If something here changes, this page changes first.</p>
      </div>

      <section aria-labelledby="t1" className="overflow-hidden rounded-2xl border border-border bg-surface">
        <h2 id="t1" className="display m-0 px-4 pb-2 pt-6 text-2xl font-bold md:px-6">
          Your data, line by line
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[15px]">
            <thead>
              <tr>
                {["DATA", "WHERE IT LIVES", "CAN YOU DELETE IT?"].map((h) => (
                  <th key={h} scope="col" className="border-b border-border px-4 py-3 text-left font-mono text-xs font-medium tracking-[0.06em] text-ink-dim md:px-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.data}>
                  <td className="border-b border-border-soft px-4 py-3.5 align-top leading-[1.5] md:px-6">
                    <strong>{r.data}</strong>
                    {r.note && <span className="block text-ink-dim">{r.note}</span>}
                  </td>
                  <td className="border-b border-border-soft px-4 py-3.5 align-top leading-[1.5] text-ink-muted md:px-6">{r.where}</td>
                  <td className={`border-b border-border-soft px-4 py-3.5 align-top font-semibold leading-[1.5] md:px-6 ${r.ok ? "text-verified" : "text-error"}`}>
                    {r.del}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="t2" className="flex flex-col gap-4">
        <h2 id="t2" className="display m-0 text-2xl font-bold">
          Fairness rules we hold ourselves to
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map(([t, b]) => (
            <div key={t} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
              <strong className="display text-lg">{t}</strong>
              <span className="leading-[1.5] text-ink-muted">{b}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <strong className="display text-xl">Want out?</strong>
          <span className="text-ink-muted">Delete everything we store from your dashboard in one click.</span>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard#privacy">Go to Delete my data</Link>
        </Button>
      </section>

      <p className="m-0 text-sm text-ink-dim">
        Testnet only (Base Sepolia).
        {isDeployed(sbt) && (
          <>
            {" "}
            Contracts:{" "}
            <a className="font-mono" href={`${BASESCAN}/address/${sbt}`} target="_blank" rel="noreferrer">
              {truncate(sbt)}
            </a>
          </>
        )}{" "}
        · Last updated 2 Oct 2026
      </p>
    </div>
  );
}
