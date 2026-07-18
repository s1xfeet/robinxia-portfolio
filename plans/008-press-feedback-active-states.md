# 008 — Press feedback: `:active` dip on every real button

- **Status**: DONE
- **Commit**: ec6386d
- **Severity**: LOW
- **Category**: Physicality (press feedback)
- **Estimated scope**: 2 files (`styles/base.css`, `styles/sections/hero.css`), ~30 lines

> Provenance: logged in the audit backlog (`plans/README.md`, "Press feedback") by `find-animation-opportunities`; verified at ec6386d that zero `:active` rules exist anywhere in `styles/` — hovers are rich, presses are dead.

## Problem

Every pressable element responds to hover but not to the press itself. Targets and their current transition lists:

```css
/* styles/base.css:129 — current: .btn (covers header Email me, Menu toggle,
   contact Copy address, LinkedIn/YTjobs, build CTA) */
.btn {
  /* … */
  transition:
    background-color var(--duration-fast) ease,
    border-color var(--duration-fast) ease,
    color var(--duration-fast) ease;
}
```

```css
/* styles/base.css:480 — current: .lightbox__close */
  transition: border-color var(--duration-fast) ease, color var(--duration-fast) ease;
```

```css
/* styles/sections/hero.css:529 — current: .hero-play. FRAGILE — the 700ms
   opacity delay is load-bearing (entrance pop-in after "watched." lands);
   any override must re-declare it verbatim */
  transition:
    transform 320ms var(--ease-out-expo),
    filter 320ms ease,
    opacity 600ms ease 700ms;
```

## Target

A subtle scale-down on press, 140ms in on `--ease-out-expo`, released back on each element's existing (slower) curve — fast in, eased out, the classic asymmetric press. The transform channel is **appended** to each existing transition list, never replacing it.

```css
/* target — styles/base.css, .btn rule: transition list grows one entry */
  transition:
    background-color var(--duration-fast) ease,
    border-color var(--duration-fast) ease,
    color var(--duration-fast) ease,
    transform 140ms var(--ease-out-expo);

/* target — new rule directly after .btn:hover (styles/base.css:149-153) */
.btn:active {
  transform: scale(0.97);
}
```

```css
/* target — styles/base.css, .lightbox__close: same append + rule after
   the existing .lightbox__close:hover/:focus-visible rule (line 483-487) */
  transition:
    border-color var(--duration-fast) ease,
    color var(--duration-fast) ease,
    transform 140ms var(--ease-out-expo);

.lightbox__close:active {
  transform: scale(0.97);
}
```

```css
/* target — styles/sections/hero.css, INSIDE the existing
   @media (hover: hover) and (pointer: fine) block (line 572), placed
   AFTER .hero-play:hover so :active wins while both apply.
   1.03, not 0.97: hover holds the button at scale(1.1), so the press is
   a relative dip from there. The full transition list is re-declared so
   the press lands in 140ms while filter and the delayed opacity entrance
   keep their exact current behavior; on release the base 320ms list
   takes back over — fast in, eased out. */
.hero-play:active {
  transform: scale(1.03);
  transition:
    transform 140ms var(--ease-out-expo),
    filter 320ms ease,
    opacity 600ms ease 700ms;
}
```

Reduced motion — presses hold still, color feedback remains:

```css
/* target — styles/base.css, add inside the existing
   @media (prefers-reduced-motion: reduce) block at line 489 */
  .btn:active,
  .lightbox__close:active {
    transform: none;
  }
```

```css
/* target — styles/sections/hero.css, extend the existing selector group
   at line 715-718 to: */
  .hero-play:hover,
  .hero-play:focus-visible,
  .hero-play:active {
    transform: none;
  }
```

## Repo conventions to follow

- `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)` from `styles/tokens.css:45`. Use the literal `140ms` duration — do NOT reference `--duration-normal` (it is undefined at ec6386d) and do NOT add a new token for one value.
- Transform-channel-appended-to-an-existing-list is how `.tile` composes its states (`styles/sections/hero.css:143-148`) — imitate that formatting (one property per line).
- `.hero-play`'s pulse/hover split is documented at `styles/sections/hero.css:538-545` — the idle pulse lives on the inner `svg`, the interactive response on the outer link. The `:active` rule rides the outer link only; never touch the `svg` animation.

## Steps

1. `styles/base.css` — append `transform 140ms var(--ease-out-expo)` to the `.btn` transition list (line 143-146), then add the `.btn:active` rule directly after `.btn:hover` (line 149-153).
2. `styles/base.css` — append the same transform entry to the `.lightbox__close` transition (line 480), then add `.lightbox__close:active` directly after the `.lightbox__close:hover, .lightbox__close:focus-visible` rule (line 483-487).
3. `styles/base.css` — add the `.btn:active, .lightbox__close:active { transform: none; }` rule inside the reduced-motion block at line 489.
4. `styles/sections/hero.css` — add the `.hero-play:active` rule (with its full re-declared transition list, verbatim from Target) inside the `@media (hover: hover) and (pointer: fine)` block, after `.hero-play:hover` (line 572-577).
5. `styles/sections/hero.css` — add `.hero-play:active` to the reduced-motion selector group at line 715-718.

## Boundaries

- Do NOT add `:active` to wall tiles (`.tile`) — a press there begins a drag-scrub, and pulsing every grab reads as noise. This exclusion is deliberate and documented in `plans/README.md`.
- Do NOT add `:active` to text links (`.client-link`, `.script-watch`, `.site-nav a`, `.reel-item`, `.mobile-nav__link`) — scale-press is a button idiom, and `.reel-item`'s transform channel is owned by its hover translate.
- Do NOT modify `:hover` or `:focus-visible` rules, the `.hero-play` base transition list, or the `hero-play-pulse` keyframes.
- Do NOT gate `.btn:active`/`.lightbox__close:active` behind `(hover: hover)` — press feedback on touch is the one hover-substitute touch gets. `.hero-play:active` alone stays inside the fine-pointer gate (on touch, tapping it fires the bloom + scroll immediately; a dip would never be seen, and from rest it would read as a grow).
- If the code at the cited lines doesn't match the excerpts (drift since ec6386d), STOP and report instead of improvising.

## Verification

- **Mechanical**: `python3 dev-server.py`; console clean. Grep check: `grep -rn ":active" styles/` returns exactly the five new rules (three in base.css including the RM one, two in hero.css including the RM group).
- **Feel check**:
  - Hold the mouse down on "Email me": the button dips to 97% in ~140ms; release it and it returns on the same curve without overshoot. The dip must be felt more than seen.
  - Same on the mobile Menu toggle, Copy address, LinkedIn/YTjobs, the build CTA, and the lightbox ✕ (open any wall video first).
  - On a touch device or DevTools touch emulation: tapping any `.btn` shows the dip during the tap.
  - Hero play button (fine pointer): hover grows it to 1.1 with the breathing glow; press dips it to 1.03 *fast* while the glow keeps pulsing; release eases back to 1.1 over 320ms. The 700ms entrance delay must still work: reload, and the button still pops in ~700ms after "watched." lands, with hover responding instantly.
  - Drag a wall row: no tile pulses on grab.
  - Emulate `prefers-reduced-motion: reduce`: presses hold still; hover/press color changes remain.
- **Done when**: every real button on the page acknowledges the press, the wall stays quiet under drag, and the hero entrance timing is byte-for-byte unchanged.
