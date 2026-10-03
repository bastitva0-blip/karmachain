# KarmaChain — Design handoff

Reference mockups live in `docs/design/screens/*.dc.html` (static HTML; open in a browser, ignore the `support.js`/`<x-dc>` wrapper — it's the design tool's runtime). Treat them as the visual source of truth for Phase 5+ UI. Rebuild with Next.js + Tailwind + shadcn/ui; do NOT copy the inline styles verbatim.

## Tokens (put in tailwind.config + CSS vars)

| Token | Hex | Use |
|---|---|---|
| ground | #0B0A10 | page background |
| surface | #13111C | cards |
| surface-2 | #1B1728 | selected / chat bubble (assistant) |
| border | #22202F | card border |
| border-strong | #3A3550 | inputs, secondary buttons |
| ink | #EDEAF5 | primary text |
| ink-muted | #B4AEC4 | body secondary |
| ink-dim | #8E88A0 | captions (min 4.5:1 on ground) |
| karma (accent) | #B9A6FF | primary button, links, focus ring; text on it = ground |
| karma-light-mode | #4B32C3 | accent on light backgrounds |
| tier-top | #F5C66B (text #2A1C00) | |
| tier-medium | #8FB8FF (text #04122B) | |
| tier-basic | #3A3550 (text #EDEAF5) | |
| verified | #5EE6A8 | success |
| warning | #F5C66B on #241D0E, border #5A4420 | demo banner, wrong network |
| error | #FF9D8A on #2A1717, border #4A2A2A | |
| danger-fill | #E5484D | end call, record |

Tier colours differ in lightness, not just hue — keep that.

## Type
- Display: **Bricolage Grotesque** 700/800, letter-spacing −0.02 to −0.035em
- Body: **IBM Plex Sans** 400/500/600
- Data (hashes, addresses, timers, eyebrow labels): **IBM Plex Mono** 400/500; eyebrows 12px uppercase, tracking .06em, accent colour
- Scale: 80/52/40/28/22/20/16/15/13/12

## Shape & spacing
- Radius: buttons/inputs 10px (large CTA 12px), cards 16px, hero cards 20px, pills 999px
- Button height 44px (CTA 52px). Touch targets ≥ 44px.
- Container max-width 1200px, 24px gutter. Section padding 112px desktop.
- Focus: 2px solid karma, offset 3px. No glows except the live-call orb.

## Logo — "The Seal"

A K pressed into a solid circle, like a wax seal: sealed, permanent, yours.

Dark UI (default):
```svg
<svg viewBox="0 0 64 64" aria-label="KarmaChain">
  <circle cx="32" cy="32" r="30" fill="#B9A6FF"/>
  <path d="M24 17v30M24 35l15-18M30 29l11 18" stroke="#0B0A10" stroke-width="6.5"
        stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
```

Light backgrounds: circle `#4B32C3`, K stroke `#EDEAF5`.

Hero / large (≥120px) only: add the dashed inner ring:
```svg
<circle cx="32" cy="32" r="25" fill="none" stroke="#0B0A10" stroke-width="1.5" stroke-dasharray="2 3"/>
```

Stroke width by size: 6.5 at 40px and up · 7 at 24–32px · 8 at 16px (favicon). Never show the dashed ring below 120px.

Wordmark: "KarmaChain" in Bricolage Grotesque 700, 10px gap after the mark (28px mark beside 19–20px text in the header).


## Screen → file map
| Route | File |
|---|---|
| `/` | Main.dc.html |
| `/dashboard` | Dashboard.dc.html |
| `/u/[handle]` | Profile.dc.html |
| `/recruiter` | Recruiter.dc.html |
| `/interview/[id]` pre-call / live / text | InterviewPre / InterviewLive / InterviewText |
| `/interview/[id]/report` | Report.dc.html |
| `/review/[handle]` | Review.dc.html |
| `/import` | Import.dc.html |
| `/demo` (guided 8-step walkthrough, interactive) | Demo.dc.html |
| `/feed` (proof-backed posts) | Feed.dc.html |
| `/evidence/[hash]` | Verify.dc.html |
| Mint success overlay | MintSuccess.dc.html |
| Ask Karma voice panel | AskKarma.dc.html |
| Mobile 390px refs | Mobile.dc.html |
| `/recruiter/interviews` | Interviews.dc.html |
| `/admin` (flags + revoke) | Admin.dc.html |
| `/privacy` | Privacy.dc.html |
| `not-found.tsx` / `error.tsx` | NotFound.dc.html |
| OG image for `/u/[handle]` (`opengraph-image.tsx`, 1200×630) | ShareCard.dc.html |
| Shared components + tokens | Components.dc.html, Logo.dc.html |

Each screen ends with an "OTHER STATES" strip — implement every one as a real state, not a separate page.

## Rules
- Shared components: TierBadge, ScoreRing (SVG, r=40, stroke 8, colour = tier), EvidenceDrawer (shadcn Sheet), TxLink/AddressLink (mono, truncated `0x1234…abcd ↗`), EmptyState (dashed border), Skeleton, ErrorBoundary, Toasts (sonner).
- `aria-live="polite"` on chat, captions, analysis progress. Real `<button>/<a>/<label>`.
- Respect `prefers-reduced-motion` (orb pulse, transitions).
- Copy in the mockups is final-ish; demo data (@arjun-dev etc.) comes from the seed script.

## Landing hero
- Background: original line-art Krishna–Arjun chariot scene (inline SVG in Main.dc.html) in karma purple, ~60% opacity; wheel spins, flag waves, halo pulses. All animations off under prefers-reduced-motion.
- Gita 2.47 quote uses Tiro Devanagari Sanskrit.
- Demo persona: Priya Sharma @priya-builds (seed data, labelled Demo).
