import Link from "next/link";
import { Tiro_Devanagari_Sanskrit } from "next/font/google";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/score-ring";
import { TierBadge } from "@/components/tier-badge";
import { Chariot } from "@/components/chariot";
import { HearBrief } from "@/components/voice/hear-brief";
import type { Tier } from "@karma/shared";
import "./landing.css";

const sanskrit = Tiro_Devanagari_Sanskrit({ weight: "400", subsets: ["devanagari"], display: "swap" });

const steps = [
  {
    n: "01 / Proof",
    title: "Analyse real work",
    body: "Repos and merged PRs scored per language. 90 points deterministic; AI adds at most 10, so prompt injection can't game it.",
  },
  {
    n: "02 / Profile",
    title: "Seal it on-chain",
    body: "Basic, Medium or Top minted as an ERC-5192 soulbound token. Client reviews arrive as signed EAS attestations.",
  },
  {
    n: "03 / Match",
    title: "Get found by proof",
    body: "Recruiters describe a role to Karma and get ranked, opted-in candidates — every reason cites evidence.",
  },
  {
    n: "04 / Interview",
    title: "Talk, don't type",
    body: "A short voice interview built from the role and your work, then a report quoting exactly what you said.",
  },
];

const voice = [
  { tag: "Agents", title: "Karma Interviewer", body: "Live interview driven by the job spec, your evidence and the recruiter's own style." },
  { tag: "Agents + tools", title: "Karma Verify", body: 'Ask "is this dev legit?" aloud. It answers only from on-chain data via a server tool.' },
  { tag: "Scribe", title: "Voice-signed reviews", body: "A client speaks a review, edits the transcript, and signs it as a permanent attestation." },
  { tag: "TTS", title: "Hear the brief", body: "A 20-second spoken summary of any profile, cached per evidence hash." },
];

const judging = [
  {
    pct: "25%",
    title: "Impact",
    body: "Students, freelancers and designers outside big-tech networks get a portable proof of skill. Recruiters skip résumé screening.",
  },
  {
    pct: "25%",
    title: "Technical",
    body: "ERC-5192 contract with Foundry tests, EAS delegated attestations, bounded LLM scoring, hash-verifiable evidence, signed-URL voice agents.",
  },
  {
    pct: "20%",
    title: "Innovation",
    body: "Proof-to-interview in one loop: the interviewer reads your on-chain evidence and mirrors the recruiter's style.",
  },
  { pct: "15%", title: "UX & polish", body: "WCAG AA, keyboard-complete, live captions, reduced motion, every error and empty state designed." },
  {
    pct: "15%",
    title: "Presentation",
    body: "A guided demo that walks every feature with pre-filled data, plus a text fallback if voice quota runs out.",
  },
];

const limits = [
  "It stops buying reputation, not farming it — we weight merged PRs, cap AI scoring and can revoke.",
  "Zip uploads and unverified portfolios are self-declared and never mint.",
  "Interview reports are AI-assisted. A human makes the hiring decision.",
  "No accent, tone or personality scoring. Testnet only. Demo profiles are labelled.",
];

export default function Home() {
  return (
    <>
      <section className="grid-bg relative overflow-hidden border-b border-border-soft">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 70% at 72% 55%, #3B2A7A55, transparent 70%)" }} />
        <Chariot className="pointer-events-none absolute -right-10 bottom-0 w-[min(1000px,90%)] opacity-60" />

        <div className="container-kc relative grid grid-cols-1 items-center gap-14 py-20 md:py-28 lg:grid-cols-2">
          <div className="flex flex-col gap-7">
            <p className="kc-rise m-0 flex items-center gap-2.5 font-mono text-[13px] tracking-[0.04em] text-karma">
              <span aria-hidden className="size-2 rounded-full bg-verified" />
              LIVE ON BASE SEPOLIA · VOICE BY ELEVENLABS
            </p>
            <h1 className="kc-rise kc-r2 display m-0 text-balance text-[clamp(46px,6.2vw,84px)] font-extrabold leading-[0.96] tracking-[-0.04em]">
              Do the work.
              <br />
              <span className="text-karma">Let it speak for you.</span>
            </h1>
            <p className="kc-rise kc-r3 m-0 max-w-[540px] text-pretty text-[19px] leading-[1.55] text-[#C9C4D6]">
              KarmaChain reads your real GitHub work, scores it with transparent signals, and seals it as a soulbound token.
              Recruiters find you by proof and interview you by voice — no résumé claims.
            </p>
            <div className="kc-rise kc-r4 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/dashboard">
                  Try it with GitHub <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/recruiter">I&apos;m hiring</Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="text-karma hover:text-karma">
                <Link href="/demo">
                  <Play className="fill-current" aria-hidden /> Demo
                </Link>
              </Button>
            </div>
            <figure className="m-0 mt-2 flex flex-col gap-1.5 border-l border-border-strong pl-4">
              <blockquote lang="sa" className={`${sanskrit.className} m-0 text-xl text-[#D6CBFF]`}>
                कर्मण्येवाधिकारस्ते मा फलेषु कदाचन
              </blockquote>
              <figcaption className="text-sm text-ink-dim">“Your right is to the work alone.” — Bhagavad Gita 2.47</figcaption>
            </figure>
          </div>

          <PriyaCard />
        </div>
      </section>

      <section aria-labelledby="why" className="container-kc grid grid-cols-1 items-start gap-12 pb-14 pt-20 md:pt-28 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <span className="eyebrow text-[13px]">WHY WE BUILT THIS</span>
          <h2 id="why" className="display m-0 text-[clamp(34px,4vw,54px)] font-extrabold leading-[1.02]">
            Hiring runs on claims. Proof is scattered.
          </h2>
          <p className="m-0 text-[17px] leading-[1.6] text-ink-muted">
            A résumé says &quot;built X&quot;. GitHub, freelance sites and portfolios each hold a piece of the truth — and none of it
            travels with you. We wanted reputation you earn once, own forever, and anyone can check in seconds.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="kc-lift flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-7">
            <span className="display text-[52px] font-extrabold text-karma">73%</span>
            <span className="leading-[1.45] text-ink-muted">of recruiting pros call skills-based hiring a priority</span>
          </div>
          <div className="kc-lift flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-7">
            <span className="display text-[52px] font-extrabold text-tier-top">13%</span>
            <span className="leading-[1.45] text-ink-muted">of recruiter searches actually use a skills filter</span>
          </div>
          <span className="col-span-2 text-xs text-ink-dim">Source: LinkedIn, Future of Recruiting 2024</span>
        </div>
      </section>

      <section id="how" aria-labelledby="hw" className="container-kc flex scroll-mt-20 flex-col gap-10 pb-20 pt-14 md:pb-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3.5">
            <span className="eyebrow text-[13px]">HOW IT WORKS</span>
            <h2 id="hw" className="display m-0 text-[clamp(32px,4vw,52px)] font-bold leading-[1.04]">
              Proof → Profile → Match → Interview
            </h2>
          </div>
          <Button asChild variant="outline">
            <Link href="/demo">Walk through the demo →</Link>
          </Button>
        </div>
        <ol className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="kc-lift flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-7">
              <span className="font-mono text-sm text-karma">{s.n}</span>
              <h3 className="display m-0 text-2xl font-bold">{s.title}</h3>
              <p className="m-0 leading-[1.55] text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="vo" className="border-y border-border-soft bg-[#0E0C16]">
        <div className="container-kc flex flex-col gap-10 py-20 md:py-28">
          <div className="flex max-w-[760px] flex-col gap-3.5">
            <span className="eyebrow text-[13px]">ELEVENLABS VOICE TRACK</span>
            <h2 id="vo" className="display m-0 text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.04]">
              Voice isn&apos;t a feature here. It&apos;s how trust moves.
            </h2>
            <p className="m-0 text-[17px] leading-[1.6] text-ink-muted">
              Four places where speaking beats typing — each with captions and a transcript, so nothing is voice-only.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {voice.map((v) => (
              <article key={v.title} className="kc-lift flex flex-col gap-3 rounded-2xl border border-border bg-surface p-[26px]">
                <span className="self-start rounded-full bg-surface-2 px-2.5 py-[3px] text-xs font-semibold text-karma">{v.tag}</span>
                <h3 className="display m-0 text-[22px] font-bold">{v.title}</h3>
                <p className="m-0 leading-[1.55] text-ink-muted">{v.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="jt" className="container-kc flex flex-col gap-10 py-20 md:py-28">
        <div className="flex flex-col gap-3.5">
          <span className="eyebrow text-[13px]">HOW IT MEETS THE BRIEF</span>
          <h2 id="jt" className="display m-0 text-[clamp(30px,3.6vw,46px)] font-bold">
            Built against every judging line
          </h2>
        </div>
        <div className="flex flex-col border-t border-border">
          {judging.map((j) => (
            <div key={j.title} className="grid items-baseline gap-x-8 gap-y-3 border-b border-border py-6 md:grid-cols-3">
              <div className="flex items-baseline gap-3.5">
                <span className="font-mono text-karma">{j.pct}</span>
                <strong className="display text-[22px]">{j.title}</strong>
              </div>
              <p className="m-0 leading-[1.55] text-ink-muted md:col-span-2">{j.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="fd" className="container-kc pb-20 md:pb-28">
        <div className="grid grid-cols-1 items-center gap-10 rounded-2xl border border-border bg-[linear-gradient(180deg,#15122A,#13111C)] p-6 md:p-10 lg:grid-cols-2">
          <div className="flex flex-col gap-3.5">
            <span className="eyebrow text-[13px]">NEW · PROOF FEED</span>
            <h2 id="fd" className="display m-0 text-[40px] font-extrabold leading-[1.05]">
              Posts that come with receipts
            </h2>
            <p className="m-0 leading-[1.6] text-ink-muted">
              Every post attaches proof — a token, a merged PR, a signed review. Endorsements are signatures, not likes. The feed ranks by
              evidence, not engagement.
            </p>
            <Button asChild className="self-start">
              <Link href="/feed">Open the feed</Link>
            </Button>
          </div>
          <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-ground p-5">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="grid size-9 place-items-center rounded-full bg-avatar text-xs font-bold text-[#D6CBFF]">
                PS
              </span>
              <div className="flex flex-col">
                <strong className="text-sm">Priya Sharma</strong>
                <span className="text-xs text-ink-dim">2h · Demo</span>
              </div>
            </div>
            <p className="m-0 leading-[1.5]">Got my offline-sync PR merged into a 4k★ repo. Three lessons on conflict resolution below.</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-verified-bg px-2.5 py-[3px] text-xs font-semibold text-verified">✓ Merged PR · verified</span>
              <TierBadge tier="top" label="TypeScript · Top" />
            </div>
            <span className="text-[13px] text-ink-dim">12 signed endorsements · 3 from Top-tier devs</span>
          </div>
        </div>
      </section>

      <section className="container-kc pb-20 md:pb-28">
        <div className="grid gap-10 rounded-[20px] border border-dashed border-border-strong p-6 md:grid-cols-2 md:p-10">
          <div className="flex flex-col gap-3">
            <span className="font-mono text-[13px] tracking-[0.06em] text-tier-top">HONEST LIMITS</span>
            <h2 className="display m-0 text-[32px] font-bold leading-[1.1]">What a soulbound token can and can&apos;t tell you</h2>
          </div>
          <ul className="m-0 flex list-disc flex-col gap-3 pl-5 leading-[1.55] text-[#C9C4D6]">
            {limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-border-soft text-center">
        <div className="mx-auto flex max-w-[820px] flex-col items-center gap-6 px-6 py-20 md:py-28">
          <svg width="72" height="72" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="30" fill="#B9A6FF" />
            <circle cx="32" cy="32" r="25" fill="none" stroke="#0B0A10" strokeWidth="1.5" strokeDasharray="2 3" />
            <path d="M24 17v30M24 35l15-18M30 29l11 18" stroke="#0B0A10" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <h2 className="display m-0 text-[clamp(36px,5vw,60px)] font-extrabold leading-none">
            Your work already happened.
            <br />
            Seal it.
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/dashboard">Try it with GitHub</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/demo">Watch the demo</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

const priyaSkills: { skill: string; score: number; tier: Tier }[] = [
  { skill: "TypeScript", score: 82, tier: "top" },
  { skill: "Python", score: 58, tier: "medium" },
  { skill: "UI design", score: 36, tier: "basic" },
];

/** Demo persona card (clearly labelled Demo). Links to the seeded demo profile. */
function PriyaCard() {
  return (
    <div aria-label="Demo profile: Priya Sharma" role="group" className="relative w-full max-w-[460px] justify-self-center lg:min-h-[620px]">
      <div aria-hidden className="absolute -right-[26px] left-[34px] top-7 hidden h-[560px] rotate-[5deg] rounded-2xl border border-[#2E2847] bg-[#17142A] sm:block" />
      <div aria-hidden className="absolute -right-3 left-4 top-3.5 hidden h-[580px] rotate-[2.4deg] rounded-2xl border border-[#2A2440] bg-[#15122A] sm:block" />
      <div className="kc-float relative flex flex-col gap-4 rounded-2xl border border-[#2E2A40] bg-surface p-6 shadow-[0_40px_80px_-30px_#000]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden className="display grid size-12 place-items-center rounded-full bg-[linear-gradient(135deg,#3A2A6A,#2A2340)] font-extrabold text-[#D6CBFF]">
              PS
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <strong>Priya Sharma</strong>
              <span className="truncate font-mono text-xs text-ink-dim">@priya-builds · 0x51ae…77b0</span>
            </div>
          </div>
          <span className="rounded-full border border-border-strong px-2.5 py-[3px] text-xs font-medium text-ink-muted">Demo</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {priyaSkills.map((s) => (
            <div key={s.skill} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-ground p-3">
              <ScoreRing score={s.score} tier={s.tier} size={54} />
              <span className="text-center text-[13px] font-semibold">{s.skill}</span>
              <TierBadge tier={s.tier} className="text-[11px]" />
            </div>
          ))}
        </div>
        <dl className="m-0 grid grid-cols-4 gap-1.5 text-center">
          {[
            ["3", "SBTs"],
            ["18", "ext. PRs"],
            ["4", "reviews"],
            ["5.2y", "on GitHub"],
          ].map(([v, l]) => (
            <div key={l} className="flex flex-col-reverse gap-0.5">
              <dt className="text-[11px] text-ink-dim">{l}</dt>
              <dd className="display m-0 text-xl font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-2 rounded-xl bg-ground p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-tier-top" aria-label="5 stars">
              ★★★★★
            </span>
            <span className="font-mono text-[11px] text-ink-dim">EAS · voice-signed</span>
          </div>
          <p className="m-0 text-sm leading-[1.5]">&quot;Priya shipped our offline-first app in a month. Calm, clear, fast.&quot;</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-ground p-3.5">
          <span aria-hidden className="size-9 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#E4DBFF,#B9A6FF_45%,#5B3FD6)]" />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Voice interview · Frontend lead</span>
            <span className="text-xs text-ink-dim">Clarity 5/5 · Depth 4/5 · anchored on-chain</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Link href="/u/priya-builds" className="font-mono text-xs">
            evidence 0x9e4b…02fa · verify ↗
          </Link>
          <div className="flex items-center gap-2">
            <HearBrief handle="priya-builds" compact />
            <Button asChild size="sm">
              <Link href="/u/priya-builds">Open profile</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
