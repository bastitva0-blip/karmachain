# Logo update — replaces the "Linked K" logo

The logo has changed from **Linked K** to **The Seal**. Everything else in `DESIGN.md` stays the same.

## What to change
1. In `docs/design/DESIGN.md`, replace the whole "Logo — Linked K" section with the section below.
2. Anywhere the Linked K SVG is used in code (header, mobile nav, favicon, OG image), swap in the Seal.
3. Ignore the Linked K SVG in the `screens/*.dc.html` headers. The Seal replaces it.

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

## Suggested implementation
- `apps/web/src/components/brand/Logo.tsx` with `variant: 'mark' | 'lockup'`, `size`, and `theme: 'dark' | 'light'`; pick the stroke width from `size`.
- `apps/web/src/app/icon.svg`: the 16px version (stroke 8).
