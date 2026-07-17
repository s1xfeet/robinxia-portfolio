# Animation plans

Written by `improve-animations` at commit `f44644e` (2026-07-17), following the full-site audit and `review-animations` pass. Each plan is self-contained — any agent can execute it with zero conversation context. Run with `improve-animations execute <plan>` or hand the file to any executor.

## Plans

| # | Plan | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| 001 | [Remove the `--wall-p` per-frame variable recalc storm](001-remove-wall-p-variable-storm.md) | HIGH | Performance | DONE |
| 002 | [Cursor dot: GPU-only grow + idle the rAF loop](002-cursor-gpu-grow-and-idle-loop.md) | HIGH | Performance | DONE |
| 003 | [Gate hover motion behind `(hover: hover) and (pointer: fine)`](003-gate-hover-motion-for-touch.md) | MEDIUM | Accessibility | DONE |
| 004 | [Lightbox: physical entrance, animated exit](004-lightbox-entrance-and-exit.md) | MEDIUM | Physicality | DONE |
| 005 | [Mobile nav: cut the entrance to menu tempo](005-mobile-nav-tempo.md) | MEDIUM | Duration/frequency | DONE |

## Recommended execution order

`005 → 002 → 004 → 001 → 003`, verifying between each.

- **005** first: one-file, zero-risk, instant payoff on phones.
- **002** next: self-contained module (`js/motion/cursor.js` + one CSS block).
- **004**: self-contained (`js/lightbox.js` + one CSS region).
- **001** is the highest-impact change but touches the hero's scroll spine — do it when there's time to feel-check the whole runway (desktop + ≤700px + reduced motion).
- **003** last: mechanically large (many selector splits across three files); rebases painfully if 001 rewrites neighbouring `hero.css` regions first — hence after 001.

## Dependencies

- 001 and 003 both edit `styles/sections/hero.css` (different regions, but execute 001 before 003 to avoid line-number drift against 003's citations).
- No other overlaps; 002/004/005 are independent and parallel-safe.

## Execution notes (2026-07-17, all five plans executed)

- **001 correction**: the plan's step 6 wrongly deleted the reduced-motion `.wall { transform: none; }` rule — with JS writing no inline transform under RM, the base rule's static `scale(1.055)` would have applied permanently. The rule was restored (with a comment) during the post-execution review. The RM `.hero-overlay { translate: none; }` deletion was correct (the base rule no longer declares `translate`).
- **001 follow-up**: a stale `--wall-p` prose comment in `styles/motion.css` (outside 001's boundaries) was reworded.
- Known accepted nuance from 001: while the wall is below full brightness (p < 1), a hovered tile's `opacity: 1` now composes with the wall's group opacity, so its pop is a hair softer than before until p = 1. Hover is only reachable at p ≥ 0.6 (wall ≥ 0.888), so the difference is imperceptible.

## Audit backlog (vetted, not yet planned)

Findings confirmed in the audit that didn't make the top-5 cut. Ask `improve-animations plan <item>` to spec any of them:

- **`js/motion/field.js:73-117`** — proximity field interleaves `getBoundingClientRect` reads and transform writes per row (up to 3 forced style recalcs/frame while the pointer is over the wall). Fix: read all rows' geometry first, then write all transforms. MEDIUM / Performance.
- **`js/sections/wall.js:243`** — marquee velocity hard-stops on `pointerenter` and hard-resumes on leave; drag release discards flick velocity. Fix: lerp each row's effective speed toward its target (~200ms), optionally decay flick velocity into the auto-scroll. LOW / Physicality.
- **`js/motion/type.js:32-57`** — scramble runs on proportional Archivo (only digits are tabular), so centered kickers wobble for 700ms. Fix: lock `el.style.width = el.offsetWidth + "px"` for the scramble, clear on lock-in. LOW / Polish.
- **`styles/tokens.css`** — `--duration-normal` is referenced with fallbacks in `styles/sections/hero.css:336` and `styles/sections/work.css:451` but never defined. Fix: add `--duration-normal: 300ms;`. LOW / Tokens.
- **Press feedback** (from `find-animation-opportunities`): `.btn`, `.lightbox__close`, `.contact-copy`, `.menu-toggle`, `.hero-play` have no `:active` state. Recipe: `:active { transform: scale(0.97); }` with `transition: transform 140ms var(--ease-out-expo)` composed into each element's existing transition list. Deliberately NOT applied to wall tiles — a press there begins a drag-scrub, and pulsing every grab would read as noise. LOW / Feedback.
