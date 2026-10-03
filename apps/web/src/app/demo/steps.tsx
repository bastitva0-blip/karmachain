"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Avatar } from "@/components/avatar";
import { TierBadge, TIER_LABEL } from "@/components/tier-badge";
import { cn } from "@/lib/utils";
import type { DemoData } from "./demo-data";

export const STEP_NAMES = ["Connect", "Proof", "Seal", "Profile", "Match", "Interview", "Report", "Proof feed"] as const;

const mk = "rounded-xl border border-border bg-surface";

/** Browser-window frame around each mock screen. */
function Frame({ url, children, deep }: { url: string; children: React.ReactNode; deep?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-[#2a2638] shadow-[0_40px_80px_-30px_#000]", deep ? "bg-ground-deep" : "bg-[#0e0c16]")}>
      <div className="flex h-10 items-center gap-2 border-b border-border bg-surface px-3.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-[#2a2638]" />
        <span className="size-2.5 rounded-full bg-[#2a2638]" />
        <span className="size-2.5 rounded-full bg-[#2a2638]" />
        <span className="ml-3 flex h-6 min-w-0 grow items-center truncate rounded-md bg-ground px-2.5 font-mono text-xs text-ink-dim">{url}</span>
      </div>
      <div className="relative flex min-h-[380px] flex-col gap-4 p-5 sm:p-7">{children}</div>
    </div>
  );
}

/** Dashed callout around the part of the mock that the step is about, with a numbered pin. */
function Highlight({ pin, children, className }: { pin: string; children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn("relative rounded-[14px] border-2 border-dashed border-karma p-2 pt-5", className)}
      initial={false}
      animate={reduce ? { boxShadow: "0 0 0 6px #B9A6FF1A" } : { boxShadow: ["0 0 0 6px #B9A6FF1A", "0 0 0 12px #B9A6FF10", "0 0 0 6px #B9A6FF1A"] }}
      transition={reduce ? { duration: 0 } : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
    >
      <span className="absolute -top-3.5 right-3 inline-flex max-w-[calc(100%-24px)] items-center gap-1.5 truncate rounded-full bg-karma px-2.5 py-[5px] text-xs font-semibold text-ground">
        {pin}
      </span>
      <div className="flex flex-col gap-3">{children}</div>
    </motion.div>
  );
}

function Copy({ label, title, points, href, linkText = "Open the real screen" }: { label: string; title: string; points: string[]; href?: string; linkText?: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      <span className="eyebrow">{label}</span>
      <h2 className="display m-0 text-[28px] font-extrabold leading-tight sm:text-[36px]">{title}</h2>
      <ul className="m-0 flex flex-col gap-1 pl-[18px] leading-relaxed text-ink-muted">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {href && (
        <Link href={href} className="text-sm text-karma hover:text-karma-hover">
          {linkText} <span aria-hidden>↗</span>
        </Link>
      )}
    </div>
  );
}

function Layout({ mock, copy }: { mock: React.ReactNode; copy: React.ReactNode }) {
  return <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">{mock}{copy}</div>;
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-[3px] text-[11px] font-semibold", className)}>{children}</span>;
}

/* ---------- 1 · Connect ---------- */
function Connect({ d }: { d: DemoData }) {
  return (
    <Layout
      mock={
        <Frame url="karmachain.app/dashboard">
          <Highlight pin="① One signature, no gas">
            <div className={cn(mk, "flex flex-wrap items-center justify-between gap-3 p-4")}>
              <div className="flex items-center gap-3">
                <span className="grid size-[26px] place-items-center rounded-full bg-verified text-sm text-ground" aria-hidden>
                  ✓
                </span>
                <span>
                  Signed in as <strong>@{d.handle}</strong>
                </span>
              </div>
              <span className="font-mono text-xs text-ink-dim">read:user only</span>
            </div>
            <div className={cn(mk, "flex flex-col gap-3 p-4")}>
              <strong>Link your wallet</strong>
              <div className="break-words rounded-[10px] bg-ground p-3.5 font-mono text-[13px] leading-normal text-[#c9c4d6]">
                KarmaChain: link GitHub @{d.handle} to {d.wallet}. Nonce 8f2a. Expires 10:42
              </div>
              <div className="flex items-center gap-2.5">
                <Tag className="bg-verified-bg text-verified">Base Sepolia</Tag>
                <span className="inline-flex h-9 items-center rounded-lg bg-karma px-3.5 text-sm font-semibold text-ground">Sign message</span>
              </div>
            </div>
          </Highlight>
        </Frame>
      }
      copy={
        <Copy
          label="Step 1 · Connect"
          title="GitHub in, wallet linked"
          points={[
            "Read-only GitHub — public data only.",
            "A signed message proves the wallet and GitHub belong to the same person.",
            "Nonces are single-use, so a replayed signature fails.",
          ]}
          href="/dashboard"
        />
      }
    />
  );
}

/* ---------- 2 · Proof ---------- */
function Proof({ d }: { d: DemoData }) {
  const c = d.components;
  const rows: [string, number, number][] = [
    ["Complexity", c.complexity, 25],
    ["Hygiene (tests, CI)", c.hygiene, 25],
    ["Authorship", c.authorship, 20],
    ["External validation", c.external, 20],
    ["AI substance (capped)", c.substance, 10],
  ];
  return (
    <Layout
      mock={
        <Frame url="karmachain.app/dashboard · analysing">
          <div className={cn(mk, "flex flex-col gap-3 p-4")}>
            <div className="flex justify-between gap-3">
              <strong>{d.live ? `Analysis complete · ${d.skills.length} skills` : "Analysing 27 repositories"}</strong>
              <span className="font-mono text-karma">100%</span>
            </div>
            <div className="h-1.5 rounded-full bg-track">
              <div className="h-full w-full rounded-full bg-karma" />
            </div>
            <span className="text-[13px] text-ink-dim">✓ {d.externalPrs} PRs merged into other people&apos;s repos found</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {d.skills.map((s) => (
              <div key={s.language} className={cn(mk, "flex min-w-0 flex-col gap-1.5 p-3.5")}>
                <strong className="display truncate text-base">{s.language}</strong>
                <span className="display text-[30px] font-extrabold">{s.score}</span>
                <TierBadge tier={s.tier} className="self-start" />
              </div>
            ))}
          </div>
          <Highlight pin="② AI can move the score by 10 at most">
            <dl className={cn(mk, "m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 p-3.5 text-[13px]")}>
              {rows.map(([k, v, max]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="m-0 font-mono">
                    {v}/{max}
                  </dd>
                </div>
              ))}
            </dl>
          </Highlight>
        </Frame>
      }
      copy={
        <Copy
          label="Step 2 · Proof"
          title="Scored per language, in under a minute"
          points={[
            "90 points from deterministic signals: tests, CI, authorship, stars, merged PRs.",
            "The AI rubric reads sample files as untrusted data — injection can't inflate it.",
            "Basic 0–39 · Medium 40–69 · Top 70–100.",
          ]}
          href={`/u/${d.handle}`}
          linkText="See the scored skills"
        />
      }
    />
  );
}

/* ---------- 3 · Seal ---------- */
function Seal({ d }: { d: DemoData }) {
  const t = d.top;
  const id = t.tokenId ?? "61";
  return (
    <Layout
      mock={
        <Frame url="karmachain.app/dashboard · minted">
          <div className="flex grow flex-wrap items-center justify-center gap-5">
            <div className={cn(mk, "flex w-[240px] max-w-full flex-col items-center gap-3 border-warning-border bg-[linear-gradient(180deg,#241D0E,#13111C)] p-5")}>
              <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden>
                <circle cx="32" cy="32" r="30" fill="#F5C66B" />
                <path d="M24 17v30M24 35l15-18M30 29l11 18" stroke="#2A1C00" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <strong className="display text-xl">
                {t.language} · {TIER_LABEL[t.tier]}
              </strong>
              <span className="font-mono text-xs text-ink-dim">
                SBT #{id.padStart(4, "0")} · {t.score}/100
              </span>
              {t.txUrl ? (
                <a href={t.txUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-karma">
                  tx {t.txLabel} <span aria-hidden>↗</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <span className="font-mono text-xs text-karma">tx {t.txLabel} ↗</span>
              )}
            </div>
            <Highlight pin="③ Try to transfer — it reverts" className="w-[290px] max-w-full">
              <div className={cn(mk, "flex flex-col gap-2.5 border-error-border p-4")}>
                <span className="font-mono text-xs text-error">transferFrom(…) reverted</span>
                <span className="text-sm leading-normal">Soulbound: this token can&apos;t be transferred or sold.</span>
                <span className="font-mono text-xs text-ink-dim">locked({id}) → true</span>
              </div>
            </Highlight>
          </div>
        </Frame>
      }
      copy={
        <Copy
          label="Step 3 · Seal"
          title="Minted as a soulbound token"
          points={["ERC-5192 on Base Sepolia. Our relayer pays the gas.", "Re-analysing upgrades the same token — no duplicates.", "Admins can revoke fraud with a public reason."]}
          href={t.evidenceHash ? `/evidence/${t.evidenceHash}` : `/u/${d.handle}`}
          linkText={t.evidenceHash ? "Verify this token yourself" : "Open the real screen"}
        />
      }
    />
  );
}

/* ---------- 4 · Profile ---------- */
function ProfileStep({ d }: { d: DemoData }) {
  const t = d.top;
  const stats: [string, string][] = [
    [String(d.sbts), "SBTs"],
    [String(d.externalPrs), "ext. PRs"],
    [String(d.reviews), "reviews"],
    [d.ageYears, "age"],
  ];
  return (
    <Layout
      mock={
        <Frame url={`karmachain.app/u/${d.handle}`}>
          <div className="flex items-center gap-3">
            <Avatar src={d.avatarUrl} name={d.name} size={44} />
            <div className="flex min-w-0 flex-col">
              <strong className="display truncate text-xl">@{d.handle}</strong>
              <span className="font-mono text-xs text-ink-dim">{d.wallet}</span>
            </div>
            <Tag className="ml-auto border border-border-strong text-ink-muted">Demo</Tag>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {stats.map(([v, k]) => (
              <div key={k} className={cn(mk, "p-2.5")}>
                <strong className="display">{v}</strong>
                <div className="text-[11px] text-ink-dim">{k}</div>
              </div>
            ))}
          </div>
          <Highlight pin="④ Anyone can re-hash the evidence">
            <div className={cn(mk, "flex flex-col gap-2 p-3.5")}>
              <div className="flex justify-between gap-3">
                <strong>
                  {t.language} · {t.score}
                </strong>
                <TierBadge tier={t.tier} />
              </div>
              <div className="break-words rounded-lg bg-ground p-2.5 font-mono text-xs leading-normal text-[#c9c4d6]">
                keccak256(evidence.json) = {t.hashLabel}
                <br />
                on-chain evidenceHash = {t.hashLabel}{" "}
                {t.hashMatches ? <span className="text-verified">✓ match</span> : <span className="text-error">✗ mismatch</span>}
              </div>
            </div>
          </Highlight>
          <div className={cn(mk, "p-3.5 text-sm")}>
            <span aria-label="5 out of 5 stars">★★★★★</span> &ldquo;{d.review.summary}&rdquo;{" "}
            <span className="font-mono text-[11px] text-ink-dim">EAS · {d.review.uidLabel}</span>
          </div>
        </Frame>
      }
      copy={
        <Copy
          label="Step 4 · Profile"
          title="A profile that checks itself"
          points={["Skills read straight from the chain; reviews from EAS.", "Every token links to evidence you can verify yourself.", "“Hear brief” reads a 20-second summary aloud."]}
          href={`/u/${d.handle}`}
        />
      }
    />
  );
}

/* ---------- 5 · Match ---------- */
function Match({ d }: { d: DemoData }) {
  const bubble = "rounded-[10px] px-3 py-2.5";
  return (
    <Layout
      mock={
        <Frame url="karmachain.app/recruiter">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className={cn(mk, "flex flex-col gap-2.5 p-3.5 text-[13px]")}>
              <div className={cn(bubble, "self-start bg-surface-2")}>What role and how senior?</div>
              <div className={cn(bubble, "self-end bg-karma text-ground")}>Frontend lead. React + TS, Top tier.</div>
              <div className={cn(bubble, "self-start bg-surface-2")}>Got it — tone for the interview?</div>
              <div className={cn(bubble, "self-end bg-karma text-ground")}>Friendly but deep.</div>
            </div>
            <div className="flex flex-col gap-2.5">
              <Highlight pin="⑤ Every reason cites evidence">
                <div className={cn(mk, "flex flex-col gap-2 p-3.5")}>
                  <div className="flex justify-between gap-2">
                    <strong className="truncate">#1 @{d.handle}</strong>
                    <span className="font-mono">0.93</span>
                  </div>
                  <TierBadge tier={d.top.tier} label={`${d.top.language} · ${TIER_LABEL[d.top.tier]}`} className="self-start" />
                  <span className="text-xs text-ink-muted">CI + 81% test files · {d.externalPrs} external merged PRs</span>
                  <span className="flex h-8 items-center justify-center rounded-lg bg-karma text-[13px] font-semibold text-ground">Interview</span>
                </div>
              </Highlight>
              <div className={cn(mk, "flex flex-col gap-1.5 p-3.5")}>
                <div className="flex justify-between">
                  <strong>#2 @arjun-dev</strong>
                  <span className="font-mono">0.88</span>
                </div>
                <span className="text-xs text-ink-muted">Top-tier TS repo with CI</span>
              </div>
            </div>
          </div>
        </Frame>
      }
      copy={
        <Copy
          label="Step 5 · Match"
          title="Describe the role. Get ranked proof."
          points={["Karma asks one question at a time and builds a job spec.", "Only candidates who opted in appear.", "Ranking: meaning + tier fit + external validation."]}
          href="/recruiter"
        />
      }
    />
  );
}

/* ---------- 6 · Interview ---------- */
function Interview() {
  return (
    <Layout
      mock={
        <Frame url="karmachain.app/interview/iv_42" deep>
          <div className="flex grow flex-col items-center justify-center gap-5">
            <span className="rounded-full border border-[#2a2638] px-3 py-1.5 font-mono text-[13px]">
              <span className="text-live" aria-hidden>
                ●
              </span>{" "}
              01:46 left
            </span>
            <div className="size-[120px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#E4DBFF,#B9A6FF_40%,#5B3FD6)] shadow-[0_0_60px_#7C5CFF88]" aria-hidden />
            <Highlight pin="⑥ Questions come from her evidence" className="w-full max-w-[460px]">
              <p className="display m-0 px-2 pb-1 text-center text-lg leading-snug sm:text-xl">
                &ldquo;Your sync PR resolved conflicts with CRDTs. Why not last-write-wins?&rdquo;
              </p>
            </Highlight>
          </div>
        </Frame>
      }
      copy={
        <Copy
          label="Step 6 · Interview"
          title="A 3-minute voice interview"
          points={["ElevenLabs agent, configured per role: tracks, difficulty, tone.", "Live captions for every word spoken.", "Quota out? It switches to text without losing the session."]}
          href="/recruiter"
          linkText="Start one from the recruiter screen"
        />
      }
    />
  );
}

/* ---------- 7 · Report ---------- */
function Report() {
  const score = (label: string, value: React.ReactNode, quote?: [string, string]) => (
    <div className={cn(mk, "flex flex-col gap-1.5 p-3")}>
      <div className="flex justify-between gap-2">
        <span className="text-[13px]">{label}</span>
        {value}
      </div>
      {quote && (
        <span className="rounded-md bg-ground p-2 text-xs">
          &ldquo;{quote[0]}&rdquo; <span className="font-mono text-ink-dim">{quote[1]}</span>
        </span>
      )}
    </div>
  );
  return (
    <Layout
      mock={
        <Frame url="karmachain.app/interview/iv_42/report">
          <Highlight pin="⑦ Every score is backed by a quote">
            <div className="grid grid-cols-2 gap-2.5">
              {score("Technical depth", <strong className="display">4/5</strong>, ["CRDTs let both edits survive…", "00:52"])}
              {score("Clarity", <strong className="display">5/5</strong>, ["Two parts: the data, then the UX.", "00:21"])}
            </div>
          </Highlight>
          <div className="grid grid-cols-2 gap-2.5">
            {score("Problem solving", <strong className="display">4/5</strong>)}
            {score("Role fit", <span className="text-xs text-ink-dim">Not enough evidence</span>)}
          </div>
          <div className="rounded-lg bg-warning-bg px-3 py-2.5 text-xs text-warning-ink">AI-assisted. A human makes the hiring decision.</div>
          <div className={cn(mk, "flex flex-wrap items-center justify-between gap-2 p-3")}>
            <span className="font-mono text-xs text-ink-dim">report hash 0x3fa1…e88c</span>
            <span className="inline-flex h-8 items-center rounded-lg bg-karma px-3 text-[13px] font-semibold text-ground">Anchor on-chain</span>
          </div>
        </Frame>
      }
      copy={
        <Copy
          label="Step 7 · Report"
          title="Evidence, not vibes"
          points={["Four scores, each with verbatim timestamped quotes.", "No accent, tone or personality scoring.", "The candidate can anchor the result hash on-chain."]}
          href="/recruiter"
          linkText="See interview reports"
        />
      }
    />
  );
}

/* ---------- 8 · Proof feed ---------- */
function Feed({ d }: { d: DemoData }) {
  return (
    <Layout
      mock={
        <Frame url="karmachain.app/feed">
          <div className={cn(mk, "flex items-center gap-2.5 p-3")}>
            <span className="grow text-sm text-ink-dim">Share what you shipped…</span>
            <Tag className="bg-surface-2 text-karma">+ Attach proof</Tag>
          </div>
          <Highlight pin="⑧ No proof, no boost">
            <div className={cn(mk, "flex flex-col gap-2.5 p-4")}>
              <strong className="text-sm">
                {d.name} <span className="font-normal text-ink-dim">· 2h</span>
              </strong>
              <span className="text-sm leading-normal">Got my offline-sync PR merged into a 4k★ repo. Three lessons on conflict resolution.</span>
              <div className="flex flex-wrap gap-1.5">
                <Tag className="bg-verified-bg text-verified">✓ Merged PR · verified</Tag>
                <TierBadge tier={d.top.tier} label={`${d.top.language} · ${TIER_LABEL[d.top.tier]}`} className="text-[11px]" />
              </div>
              <div className="flex flex-wrap gap-4 text-[13px] text-ink-muted">
                <span>✍ 12 signed endorsements</span>
                <span>3 from Top-tier devs</span>
              </div>
            </div>
          </Highlight>
        </Frame>
      }
      copy={
        <Copy
          label="Step 8 · Share"
          title="A feed with receipts"
          points={["Posts attach a token, PR, review or interview anchor.", "Endorsements are wallet signatures, weighted by the endorser’s tier.", "Ranked by evidence — not engagement bait."]}
          href="/feed"
        />
      }
    />
  );
}

export function DemoStep({ index, data }: { index: number; data: DemoData }) {
  switch (index) {
    case 0:
      return <Connect d={data} />;
    case 1:
      return <Proof d={data} />;
    case 2:
      return <Seal d={data} />;
    case 3:
      return <ProfileStep d={data} />;
    case 4:
      return <Match d={data} />;
    case 5:
      return <Interview />;
    case 6:
      return <Report />;
    default:
      return <Feed d={data} />;
  }
}
