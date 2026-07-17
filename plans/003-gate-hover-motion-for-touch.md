# 003 — Gate hover motion behind `(hover: hover) and (pointer: fine)`

- **Status**: DONE
- **Commit**: f44644e
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 3 files (`styles/sections/hero.css`, `styles/sections/work.css`, `styles/sections/testimonial.css`), ~120 lines of mechanical selector splitting

## Problem

None of the site's hover **motion** is gated for touch. On touch devices with wide viewports (iPads — the wall and all hover states are fully enabled above 700px), a tap fires a sticky `:hover` that never releases until the next tap elsewhere. Worst case is the work wall: tapping a tile leaves it lifted at `scale(1.05)` while the **entire row stays dimmed** at `opacity: 0.3`:

```css
/* styles/sections/hero.css:249-258 — current */
.tile[href]:hover,
.tile[href]:focus-visible {
  border-color: var(--color-rec);
  opacity: 1;
  transform: translateY(-6px) scale(1.05);
  ...
}

/* styles/sections/hero.css:290-294 — current */
.wall-row:hover .tile:not(:hover),
.wall-row:focus-within .tile:not(:focus-visible):not(:hover) {
  opacity: 0.3;
  filter: saturate(0.6) brightness(0.8);
}
```

The JS motion layer already gates on `pointer: fine` (`js/motion/cursor.js:8`, `js/motion/field.js:28`) — the CSS hover layer is the gap.

## Target

Every hover rule that moves, scales, dims, or reveals something is wrapped in `@media (hover: hover) and (pointer: fine)`. Every `:focus-visible` (and `.is-active`) twin keeps working ungated on all devices — keyboard users keep everything. Color-only hovers (nav links, `.btn`, footer links, `.script-watch`, `.contact-email`) stay ungated; sticky color on touch is harmless and conventional.

**The split pattern** (apply it to every rule listed in Steps):

```css
/* before */
.thing:hover,
.thing:focus-visible { ...motion... }

/* after */
@media (hover: hover) and (pointer: fine) {
  .thing:hover { ...motion... }
}
.thing:focus-visible { ...motion... }
```

Keep each rule's declarations byte-identical — only the selector grouping changes. Where several hover rules are adjacent, use ONE media block wrapping all the `:hover` halves to avoid churn.

## Repo conventions to follow

- This codebase already splits media-gated motion blocks with explanatory comments — see `@supports (animation-timeline: view())` nesting in `styles/atmosphere.css:206-214`. Add one comment per new media block: `/* hover motion is fine-pointer only: a tap must not leave a sticky lifted/dimmed state */`.
- Reduced-motion neutralizers that reference hover selectors (`styles/sections/hero.css:620-641`, `styles/sections/work.css:573-584`) stay exactly where they are — they compose correctly with the new gate.

## Steps

1. **`styles/sections/hero.css`** — split these rules (hover half into one shared media block per contiguous region, focus-visible half kept ungated):
   - `hero.css:249-258` `.tile[href]:hover, .tile[href]:focus-visible`
   - `hero.css:263-266` `.tile--tall[href]:hover, .tile--tall[href]:focus-visible`
   - `hero.css:272-275` and `hero.css:277-280` (row-1 transform overrides)
   - `hero.css:290-294` — gate only the `.wall-row:hover .tile:not(:hover)` selector; the `.wall-row:focus-within ...` selector stays ungated
   - `hero.css:299-306` `.tile[href]:hover::before, .tile[href]:focus-visible::before`
   - `hero.css:308-314` `...::after` twin
   - `hero.css:360-363` `.tile[href]:hover .tile__scrim, ...`
   - `hero.css:379-383` `.tile[href]:hover .tile__video, ...`
   - `hero.css:516-520` `.hero-play:hover, .hero-play:focus-visible`
   - Leave ungated: `hero.css:61-64` (`.wall-row:hover` z-index — functional stacking), `hero.css:90-94` (marquee `animation-play-state` pause — functional), `hero.css:522-525` (`:focus-visible` outline).

2. **`styles/sections/work.css`** — same split for:
   - `work.css:30-33` `.client-link:hover::after, .client-link:focus-visible::after` (underline sweep)
   - `work.css:61-65` `.client-link[data-tooltip]:hover::before, ...:focus-visible::before` (tooltip)
   - `work.css:331-336` `.reel-item:hover, .reel-item:focus-visible, .reel-item.is-active` → gate only the `:hover` selector; `:focus-visible` and `.is-active` stay ungated (on touch, tapping a take adds `.is-active` via `js/sections/work.js`, so the highlight still works)
   - `work.css:338-342`, `work.css:344-348`, `work.css:350-354`, `work.css:356-361` — same three-way split (gate `:hover` halves only)
   - `work.css:475-483` `.nk-card-media:hover img / .nk-card-play` pairs

3. **`styles/sections/testimonial.css`** — same split for:
   - `testimonial.css:219-225` `.testimonial-screen:hover .testimonial-frame, ...:focus-visible ...`
   - `testimonial.css:227-232` `.testimonial-screen:hover .testimonial-play, ...`

## Boundaries

- Do NOT gate color-only hovers in `styles/base.css`, `styles/sections/writing.css`, `styles/sections/contact.css`.
- Do NOT alter any declaration inside the rules — selector regrouping only.
- Do NOT touch the reduced-motion blocks.
- Do NOT gate any `:focus-visible`, `:focus-within`, or `.is-active` selector.
- If a cited rule doesn't match (drift since f44644e), STOP and report.

## Verification

- **Mechanical**: site loads with no CSS parse errors (DevTools console + inspect one gated rule to confirm it applies on desktop).
- **Feel check, desktop (fine pointer)**: tile hover lift/spotlight, reel-item slide, client-link underline + tooltip, NK card zoom, testimonial lift, hero-play grow — all behave exactly as before.
- **Feel check, touch**: DevTools device emulation (iPad, 1024px — important: viewport must be >700px). Tap a wall tile: the lightbox opens; after closing, **no tile is stuck lifted and no row is stuck dimmed**. Tap a reel take: the clip pins and `.is-active` highlights, with no stuck translateX from `:hover`. Tap a client name: navigates without a stuck tooltip.
- **Keyboard**: Tab through tiles, takes, cards, and the play button — every focus-visible state (lift, reticle, underline, ring) still fires.
- **Done when**: no hover-motion rule applies under emulated touch, and desktop + keyboard behavior is unchanged.
