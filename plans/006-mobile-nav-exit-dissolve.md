# 006 — Mobile nav: dissolve the exit instead of teleporting

- **Status**: DONE
- **Commit**: ec6386d
- **Severity**: MEDIUM
- **Category**: Physicality (exit symmetry / preventing a jarring change)
- **Estimated scope**: 2 files (`js/mobile-nav.js`, `styles/base.css`), ~20 lines

## Problem

The mobile nav overlay enters with a choreographed 360ms staggered rise, but exits by instantly setting the `hidden` attribute — a hard cut. After plan 004 gave the lightbox an animated exit, this is the only overlay on the site that still teleports away. Every mobile visitor who opens the menu hits it on Close, Escape, or a link tap.

```js
// js/mobile-nav.js:49 — current
function close({ returnFocus = false } = {}) {
  if (!isOpen) return;
  isOpen = false;
  overlay.setAttribute("hidden", "");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "Menu";
  document.documentElement.style.removeProperty("overflow");
  document.removeEventListener("keydown", onKey);
  if (returnFocus) toggle.focus();
}
```

```css
/* styles/base.css:287 — current: hidden means display: none, no bridge */
.mobile-nav[hidden] {
  display: none;
}
```

The entrance choreography this exit must answer (for reference, do not change it):

```css
/* styles/base.css:319 — entrance, per link */
animation: mobile-nav-in 360ms var(--ease-cine) forwards;
```

## Target

A 150ms opacity dissolve on close, with `hidden` deferred 180ms so the fade can play — the exact numbers and structure the lightbox already uses. No reverse stagger: exits are simpler and faster than entrances (360ms in / 150ms out). Control state (`aria-expanded`, toggle label, scroll unlock, focus return) stays instant — only the pixels linger.

```css
/* target — styles/base.css, .mobile-nav rule gains one line */
.mobile-nav {
  /* …existing declarations unchanged… */
  transition: opacity 150ms ease;
}

/* target — new rule, place directly after the .mobile-nav[hidden] rule */
.mobile-nav.is-closing {
  opacity: 0;
  pointer-events: none;
}
```

```js
// target — js/mobile-nav.js
let hideTimer = 0;

function open() {
  isOpen = true;
  clearTimeout(hideTimer);               // reopen during a fade must win
  overlay.classList.remove("is-closing");
  overlay.removeAttribute("inert");
  overlay.removeAttribute("hidden");
  toggle.setAttribute("aria-expanded", "true");
  toggle.textContent = "Close";
  document.documentElement.style.overflow = "hidden";
  document.addEventListener("keydown", onKey);
}

function close({ returnFocus = false } = {}) {
  if (!isOpen) return;
  isOpen = false;
  // Exit dissolve, mirroring the lightbox (150ms CSS fade, 180ms removal).
  // `hidden` is deferred so the fade can play; inert blocks focus/AT/hits
  // immediately. Everything else stays instant — state must lead pixels.
  overlay.classList.add("is-closing");
  overlay.setAttribute("inert", "");
  hideTimer = window.setTimeout(() => {
    overlay.setAttribute("hidden", "");
    overlay.classList.remove("is-closing");
  }, 180);
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "Menu";
  document.documentElement.style.removeProperty("overflow");
  document.removeEventListener("keydown", onKey);
  if (returnFocus) toggle.focus();
}
```

Reduced motion — instant close, matching the entrance kill that already exists:

```css
/* target — add inside the existing reduced-motion block at styles/base.css:357 */
.mobile-nav.is-closing {
  transition: none;
}
```

## Repo conventions to follow

- The exit idiom to copy verbatim is the lightbox: `styles/base.css:417` (`transition: opacity 150ms ease;` on the base rule), `styles/base.css:421` (`.lightbox.is-closing { opacity: 0; pointer-events: none; }`), and `js/lightbox.js:68-69` (`el.classList.add("is-closing"); window.setTimeout(() => el.remove(), 180);`). Same 150ms/180ms pair here.
- `inert` via attribute is an existing repo idiom — `#wall` uses `setAttribute("inert", "")` / `removeAttribute("inert")` (`js/sections/wall.js:544-548`). Use the attribute form, not the property.
- Reduced-motion rules for this component live in the existing block at `styles/base.css:357-363` (it already neutralizes `.mobile-nav__link`). Add the new rule inside that block.

## Steps

1. `styles/base.css` — add `transition: opacity 150ms ease;` as the last declaration of the `.mobile-nav` rule (the rule starting at line 272).
2. `styles/base.css` — directly after the `.mobile-nav[hidden]` rule (line 287-289), add the `.mobile-nav.is-closing` rule exactly as in Target.
3. `styles/base.css` — inside the `@media (prefers-reduced-motion: reduce)` block at line 357, add the `.mobile-nav.is-closing { transition: none; }` rule after the existing `.mobile-nav__link` rule.
4. `js/mobile-nav.js` — add `let hideTimer = 0;` beside the existing `let isOpen = false;` (line 11).
5. `js/mobile-nav.js` — update `open()` (line 40) and `close()` (line 49) to match Target exactly: `open()` gains the `clearTimeout(hideTimer)`, `is-closing` removal, and `removeAttribute("inert")` lines before `removeAttribute("hidden")`; `close()` replaces the immediate `overlay.setAttribute("hidden", "")` with the `is-closing` + `inert` + deferred-hide block. Do not reorder the toggle/label/overflow/focus lines.

## Boundaries

- Do NOT touch the entrance (`mobile-nav-in` keyframes, the 40ms stagger delays, or plan 005's 360ms tempo).
- Do NOT touch `js/lightbox.js`, `js/smooth-scroll.js`, or the scroll-lock MutationObserver contract (`document.documentElement.style.overflow` must still be removed synchronously in `close()` — Lenis restarts off that inline-style mutation).
- Do NOT add a reverse stagger or any transform to the exit — opacity only.
- If the code at the cited lines doesn't match the excerpts (drift since ec6386d), STOP and report instead of improvising.

## Verification

- **Mechanical**: `python3 dev-server.py`, open the site at a ≤700px viewport width; browser console shows no new errors after opening and closing the menu repeatedly.
- **Feel check** (viewport ≤700px):
  - Tap Menu, then Close: the overlay dissolves over ~150ms instead of vanishing; the toggle label flips to "Menu" instantly, ahead of the fade.
  - Tap Menu, then a section link: the menu dissolves *while* the page is already scrolling underneath it — the scroll must start immediately, not after the fade.
  - Spam the toggle: Menu → Close → Menu within ~200ms. The menu must stay open (no delayed `hidden` swallowing the reopen) and fade smoothly back to opaque.
  - Escape closes with the same dissolve; focus returns to the toggle immediately.
  - During the fade, Tab must not land inside the closing menu (inert), and taps must pass through it.
  - DevTools Rendering panel → emulate `prefers-reduced-motion: reduce`: close is instant, open links appear without animation (unchanged from today).
- **Done when**: all feel checks pass and the only surfaces that hard-cut on this site are ones that never animated in.
