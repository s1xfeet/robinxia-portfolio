# Animation plans

Written by `improve-animations` at commit `f44644e` (2026-07-17), following the full-site audit and `review-animations` pass. Each plan is self-contained — any agent can execute it with zero conversation context. Run with `improve-animations execute <plan>` or hand the file to any executor.

Plans 006–008 added at commit `ec6386d` (2026-07-17) from the `find-animation-opportunities` sweep that followed the audit.

## Plans

| # | Plan | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| 001 | [Remove the `--wall-p` per-frame variable recalc storm](001-remove-wall-p-variable-storm.md) | HIGH | Performance | DONE |
| 002 | [Cursor dot: GPU-only grow + idle the rAF loop](002-cursor-gpu-grow-and-idle-loop.md) | HIGH | Performance | DONE |
| 003 | [Gate hover motion behind `(hover: hover) and (pointer: fine)`](003-gate-hover-motion-for-touch.md) | MEDIUM | Accessibility | DONE |
| 004 | [Lightbox: physical entrance, animated exit](004-lightbox-entrance-and-exit.md) | MEDIUM | Physicality | DONE |
| 005 | [Mobile nav: cut the entrance to menu tempo](005-mobile-nav-tempo.md) | MEDIUM | Duration/frequency | DONE |
| 006 | [Mobile nav: dissolve the exit instead of teleporting](006-mobile-nav-exit-dissolve.md) | MEDIUM | Physicality | DONE |
| 007 | [Contact copy button: masked label swap, stable width](007-contact-copy-masked-confirm.md) | LOW | Missed opportunity | DONE |
| 008 | [Press feedback: `:active` dip on every real button](008-press-feedback-active-states.md) | LOW | Physicality | DONE |

## Recommended execution order

Batch 1 (001–005): `005 → 002 → 004 → 001 → 003` — executed, see notes below.

Batch 2 (006–008): `006 → 008 → 007`, verifying between each.

- **006** first: highest leverage (every mobile visitor), two files, copies an idiom the codebase already ships for the lightbox.
- **008** next: small and broad; its `.btn` edit sits near the top of `base.css`, so running it before 007 keeps 007's utility-section insertion point trivial to find.
- **007** last: largest scope (markup + JS + CSS + a new utility), and its verification includes screen-reader checks worth doing unhurried.

## Dependencies

- 001 and 003 both edit `styles/sections/hero.css` (different regions; 001 was executed first as planned).
- 006, 007, and 008 all touch `styles/base.css` in different regions (mobile-nav block / utilities section / `.btn` + `.lightbox__close` + reduced-motion block). No functional overlap, but each plan run shifts line numbers for the next — **the code excerpts in each plan are authoritative, the line numbers are hints**. If an excerpt doesn't match, stop per the plan's drift rule.
- 007 and 008 both add rules adjacent to `.btn` behavior; 008 does not change `.contact-copy` and 007 does not change `.btn` — no conflict, either order works, the recommended order above is for convenience only.
- 008 extends the reduced-motion blocks that 003 created/normalized in `hero.css` — 003 being DONE is assumed.

## Execution notes (2026-07-17, plans 001–005 executed)

- **001 correction**: the plan's step 6 wrongly deleted the reduced-motion `.wall { transform: none; }` rule — with JS writing no inline transform under RM, the base rule's static `scale(1.055)` would have applied permanently. The rule was restored (with a comment) during the post-execution review. The RM `.hero-overlay { translate: none; }` deletion was correct (the base rule no longer declares `translate`).
- **001 follow-up**: a stale `--wall-p` prose comment in `styles/motion.css` (outside 001's boundaries) was reworded.
- Known accepted nuance from 001: while the wall is below full brightness (p < 1), a hovered tile's `opacity: 1` now composes with the wall's group opacity, so its pop is a hair softer than before until p = 1. Hover is only reachable at p ≥ 0.6 (wall ≥ 0.888), so the difference is imperceptible.

## Execution notes (2026-07-17, plans 006–008 executed)

- Executed in the recommended order 006 → 008 → 007 at ec6386d; every plan's "current" excerpts matched (no drift stops), and all diffs landed verbatim to their Targets.
- Verification caveat: the embedded browser pane only renders animation frames on demand, so live transition *feel* could not be watched there. Everything mechanically checkable was verified instead: 006's full close lifecycle (is-closing/inert/deferred-hidden, synchronous scroll unlock, Escape + focus return, reopen-race), 008's computed transition lists and an exact five-selector `:active` census (tiles excluded), and 007's cascade end-states (proven with transitions disabled inline), CSSTransition creation (right props/duration/curve), 157px width stability across all states, and the real-click class/status/reset cycle.
- Remaining human feel-checks on a real browser/device: the 006 dissolve tempo on a phone, 007 under VoiceOver (announcement of "Copied ✓") and at DevTools 10% speed, 008's dip on real hardware (especially hero-play's hover 1.1 → press 1.03 → release).
- Accepted nuance from 008: keyboard Enter on the hero play button doesn't dip (its later `:focus-visible` rule holds `scale(1.1)`); press feedback is a pointer affordance, so this is by design.

## Audit backlog (vetted, not yet planned)

Findings confirmed in the audit that didn't make the top-5 cut. Ask `improve-animations plan <item>` to spec any of them:

- **`js/motion/field.js:73-117`** — proximity field interleaves `getBoundingClientRect` reads and transform writes per row (up to 3 forced style recalcs/frame while the pointer is over the wall). Fix: read all rows' geometry first, then write all transforms. MEDIUM / Performance.
- **`js/sections/wall.js:243`** — marquee velocity hard-stops on `pointerenter` and hard-resumes on leave; drag release discards flick velocity. Fix: lerp each row's effective speed toward its target (~200ms), optionally decay flick velocity into the auto-scroll. LOW / Physicality.
- **`js/motion/type.js:32-57`** — scramble runs on proportional Archivo (only digits are tabular), so centered kickers wobble for 700ms. Fix: lock `el.style.width = el.offsetWidth + "px"` for the scramble, clear on lock-in. LOW / Polish.
- **`styles/tokens.css`** — `--duration-normal` is referenced with fallbacks in `styles/sections/hero.css:336` and `styles/sections/work.css:451` but never defined. Fix: add `--duration-normal: 300ms;`. LOW / Tokens.
- ~~**Press feedback** (from `find-animation-opportunities`)~~ — promoted to [plan 008](008-press-feedback-active-states.md). The wall-tile exclusion (a press there begins a drag-scrub) is carried into that plan's boundaries.
