# 005 — Mobile nav: cut the entrance to menu tempo

- **Status**: DONE
- **Commit**: f44644e
- **Severity**: MEDIUM
- **Category**: Easing & duration (frequency-appropriate)
- **Estimated scope**: 1 file (`styles/base.css`), ~10 lines

## Problem

The mobile nav links borrow the scroll-reveal tempo (`--duration-reveal` = 780ms) plus delays up to 380ms, so the last link doesn't settle until ~1.16s after every open — on a menu a phone visitor opens many times per session. Menus are tens-of-times-frequency UI; the budget is 150–500ms, and the reveal pacing that feels cinematic on scroll feels sluggish on a tap:

```css
/* styles/base.css:319 — current (inside .mobile-nav__link) */
animation: mobile-nav-in var(--duration-reveal) var(--ease-cine) forwards;
```

```css
/* styles/base.css:341-346 — current */
.mobile-nav__item:nth-child(1) .mobile-nav__link { animation-delay: 80ms; }
.mobile-nav__item:nth-child(2) .mobile-nav__link { animation-delay: 140ms; }
.mobile-nav__item:nth-child(3) .mobile-nav__link { animation-delay: 200ms; }
.mobile-nav__item:nth-child(4) .mobile-nav__link { animation-delay: 260ms; }
.mobile-nav__item:nth-child(5) .mobile-nav__link { animation-delay: 320ms; }
.mobile-nav__item:nth-child(6) .mobile-nav__link { animation-delay: 380ms; }
```

The close path (instant `hidden`) is already correct — exits snap.

## Target

360ms per link, 40ms stagger steps starting at 0ms — the last link settles at ~560ms. Same variant (rise + fade), same `var(--ease-cine)` curve so it still reads as the site's motion voice, just at interaction tempo.

## Repo conventions to follow

- Duration tokens live in `styles/tokens.css`. Since 360ms is a new value used once, a literal is fine (matches existing one-off literals like the 620ms bloom in `styles/motion.css:70`); do NOT redefine `--duration-reveal`, which the scroll reveals still use.

## Steps

1. **`styles/base.css:319`** — change the animation line to:

   ```css
   animation: mobile-nav-in 360ms var(--ease-cine) forwards;
   ```

2. **`styles/base.css:341-346`** — retime the stagger:

   ```css
   .mobile-nav__item:nth-child(1) .mobile-nav__link { animation-delay: 0ms; }
   .mobile-nav__item:nth-child(2) .mobile-nav__link { animation-delay: 40ms; }
   .mobile-nav__item:nth-child(3) .mobile-nav__link { animation-delay: 80ms; }
   .mobile-nav__item:nth-child(4) .mobile-nav__link { animation-delay: 120ms; }
   .mobile-nav__item:nth-child(5) .mobile-nav__link { animation-delay: 160ms; }
   .mobile-nav__item:nth-child(6) .mobile-nav__link { animation-delay: 200ms; }
   ```

3. **`styles/base.css:340`** — update the comment above the stagger block (it currently claims the delays mirror the scroll-reveal steps): `/* Menu tempo: 40ms steps — a tap-opened surface must finish inside ~600ms, unlike the slower scroll reveals. */`

## Boundaries

- Do NOT touch the `mobile-nav-in` keyframes, the reduced-motion block (`styles/base.css:359-365`), or `js/mobile-nav.js`.
- Do NOT change `--duration-reveal` or any scroll-reveal timing.
- If the lines don't match (drift since f44644e), STOP and report.

## Verification

- **Mechanical**: none needed beyond a clean load.
- **Feel check**: at ≤700px width, open the menu repeatedly. All six links must be settled well before you can move your thumb to one (~0.6s). Open/close rapidly — close stays instant. The stagger should read as one quick cascade, not six separate arrivals.
- **Reduced motion**: links appear instantly (existing block, unchanged).
- **Done when**: last link settles ≤600ms after tap and the menu feels snappy on a real phone.
