# 007 — Contact copy button: masked label swap, stable width

- **Status**: DONE
- **Commit**: ec6386d
- **Severity**: LOW
- **Category**: Missed opportunity (feedback / delight budget)
- **Estimated scope**: 4 files (`index.html`, `js/contact.js`, `styles/sections/contact.css`, `styles/base.css`), ~50 lines

## Problem

The copy button is the site's terminal CTA — the one conversion success moment — and it is currently the flattest interaction on the page. On click, `js/contact.js` swaps `textContent` instantly ("Copy address" → "Copied ✓"), and because "Copied ✓" is narrower, the button *shrinks mid-press*. The amber color/border flip does ease (inherited from `.btn`'s 180ms transition), but the label itself teleports, twice (again on the 2s reset).

```js
// js/contact.js:47 — current
button.addEventListener("click", async () => {
  const ok = await copyEmail();
  if (!ok) return; // mailto link remains the fallback path

  clearTimeout(resetTimer);
  button.textContent = COPIED_LABEL;
  button.classList.add("is-copied");
  resetTimer = setTimeout(() => {
    button.textContent = DEFAULT_LABEL;
    button.classList.remove("is-copied");
  }, RESET_DELAY_MS);
});
```

```html
<!-- index.html:484 — current -->
<button type="button" class="btn contact-copy" id="contact-copy" aria-live="polite" data-reveal data-reveal-delay="2">Copy address</button>
```

```css
/* styles/sections/contact.css:43 — current: the color flip is the only motion */
.contact-copy.is-copied {
  color: var(--color-tc);
  border-color: var(--color-tc);
}
```

## Target

Both labels live permanently in the button, stacked in one grid cell — which makes the button's width equal the widest label at all times (the width jump disappears structurally, no measured `min-width` needed). On `.is-copied`, the idle label rises out through a clipped mask and the confirmation rises in — the site's masked-rise idiom at button scale. The 2s reset plays the same motion in reverse (transitions retarget automatically). Screen readers keep getting an announcement via a visually-hidden live text node, since the visible layer is `aria-hidden`.

```html
<!-- target — index.html:484. No whitespace between the two child spans:
     the sr span is absolutely positioned, but a stray text node before it
     would still render as a space inside the button. -->
<button type="button" class="btn contact-copy" id="contact-copy" aria-live="polite" data-reveal data-reveal-delay="2"><span class="contact-copy__labels" aria-hidden="true"><span class="contact-copy__label contact-copy__label--idle">Copy address</span><span class="contact-copy__label contact-copy__label--done">Copied ✓</span></span><span class="visually-hidden" id="contact-copy-status">Copy address</span></button>
```

```css
/* target — styles/sections/contact.css, after the .contact-copy rule */
.contact-copy__labels {
  display: inline-grid;
  text-align: center;
  /* masked rise: labels travel out of view and get clipped, like the
     site's mask-rise titles; the margin protects descenders at rest */
  overflow: clip;
  overflow-clip-margin: 0.1em;
}

.contact-copy__label {
  grid-area: 1 / 1; /* stacked: button width = widest label, always */
  transition:
    transform 240ms var(--ease-out-expo),
    opacity 240ms ease;
}

.contact-copy__label--done {
  opacity: 0;
  transform: translateY(0.55em);
}

.contact-copy.is-copied .contact-copy__label--idle {
  opacity: 0;
  transform: translateY(-0.55em);
}

.contact-copy.is-copied .contact-copy__label--done {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .contact-copy__label {
    transition: none; /* instant swap — today's behavior */
  }
}
```

```css
/* target — styles/base.css, new utility in the utilities section
   (after .dim). Standard inclusively-hidden pattern; no repo precedent
   exists yet, this becomes it. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

```js
// target — js/contact.js. The button's textContent must never be written
// again (it would destroy the inner spans); the class drives the visuals
// and the sr-only span carries the announcement + accessible name.
export function initContact() {
  const button = document.getElementById("contact-copy");
  if (!button) return;
  const status = document.getElementById("contact-copy-status");

  let resetTimer = null;

  button.addEventListener("click", async () => {
    const ok = await copyEmail();
    if (!ok) return; // mailto link remains the fallback path

    clearTimeout(resetTimer);
    button.classList.add("is-copied");
    if (status) status.textContent = COPIED_LABEL;
    resetTimer = setTimeout(() => {
      button.classList.remove("is-copied");
      if (status) status.textContent = DEFAULT_LABEL;
    }, RESET_DELAY_MS);
  });
}
```

`DEFAULT_LABEL`, `COPIED_LABEL`, and `RESET_DELAY_MS` (`js/contact.js:7-9`) keep their current values; they now feed the sr-only span instead of the button.

## Repo conventions to follow

- The masked-rise idiom being miniaturized here: `styles/motion.css:20-35` (`[data-reveal="mask-rise"]` uses `overflow: clip` + `overflow-clip-margin` on the window and `translateY` on the inner line). This plan is that structure at 0.55em travel and button tempo.
- Easing/duration come from `styles/tokens.css:45-47`: `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)`; pair transform with a plain-`ease` opacity, as the tile hover does (`styles/sections/hero.css:143-148`).
- The existing `.contact-copy.is-copied` amber flip (`styles/sections/contact.css:43-46`) stays exactly as is — it rides `.btn`'s own transition list and composes with the label motion.

## Steps

1. `styles/base.css` — add the `.visually-hidden` utility rule in the utilities section, directly after the `.dim` rule (line 104-106).
2. `index.html` — replace the button's text content with the two-span structure from Target (line 484). Keep every existing attribute on the `<button>` unchanged.
3. `styles/sections/contact.css` — add the five rules plus the reduced-motion block from Target, between the existing `.contact-copy` rule (line 37) and the `.contact-copy.is-copied` rule (line 43).
4. `js/contact.js` — update `initContact` to match Target: add the `status` lookup, replace both `button.textContent = …` writes with the class toggle + `status.textContent` writes.

## Boundaries

- Do NOT touch `copyEmail`, `legacyCopy`, or the clipboard fallback logic.
- Do NOT change the button's classes, `id`, `aria-live`, or `data-reveal` attributes.
- Do NOT alter `.btn` base styles or the `.is-copied` color rule.
- Do NOT introduce a `min-width`/`min-inline-size` — the stacked grid IS the width lock; if the button still resizes, the grid stacking is wrong, fix that instead.
- If the code at the cited lines doesn't match the excerpts (drift since ec6386d), STOP and report instead of improvising.

## Verification

- **Mechanical**: `python3 dev-server.py`, open the site, scroll to Roll Credits; console clean after clicking the button several times.
- **Feel check**:
  - Click "Copy address": the old label rises out clipped, "Copied ✓" rises in from below, ~240ms, while the border/text ease to amber. Nothing about it should read as a hard swap.
  - Watch the button's right edge during the swap (or measure `offsetWidth` in the console before/after): the width must not change by a single pixel.
  - Wait 2s: the reset plays the same masked motion in reverse.
  - Click again *during* the copied state: the timer extends; no flicker, no restart of the entrance.
  - In DevTools Animations panel at 10% speed: both labels move together, and glyphs clip at the button's label window rather than overlapping the neighboring text.
  - VoiceOver/NVDA: activating the button announces "Copied ✓"; after reset the accessible name is "Copy address" again.
  - Emulate `prefers-reduced-motion: reduce`: the swap is instant, the amber flip remains, the width still doesn't move.
- **Done when**: the paste actually contains `robinxia706@gmail.com`, all feel checks pass, and the swap reads as one label becoming another — not two labels trading places.
