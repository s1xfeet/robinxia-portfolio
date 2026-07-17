# 002 — Cursor dot: GPU-only grow + idle the rAF loop

- **Status**: DONE
- **Commit**: f44644e
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 2 files (`styles/motion.css`, `js/motion/cursor.js`), ~50 lines

## Problem

Two issues in the viewfinder-cursor module, both on the hottest interaction path on the site (the pointer).

**A — layout properties animate on every link hover.** The dot grows by transitioning `width`/`height`, which are layout properties, and `.is-hot` toggles every single time the pointer enters or leaves any `a`/`button`:

```css
/* styles/motion.css:184-194 — current */
width: 8px;
height: 8px;
border-radius: 50%;
border: 1px solid var(--color-tc);
pointer-events: none;
opacity: 0;
transition:
  opacity 200ms ease,
  width 180ms var(--ease-out-expo),
  height 180ms var(--ease-out-expo),
  border-color 180ms ease;
```

```css
/* styles/motion.css:201-205 — current */
.mx-cursor.is-hot {
  width: 26px;
  height: 26px;
  border-color: var(--color-rec);
}
```

**B — the rAF loop never idles.** It lerps and writes two transforms every frame forever, even when the pointer hasn't moved for minutes:

```js
/* js/motion/cursor.js:69-78 — current */
const frame = () => {
  x += (tx - x) * 0.22;
  y += (ty - y) * 0.22;
  lx += (tx - lx) * 0.14;
  ly += (ty - ly) * 0.14;
  dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  label.style.transform = `translate3d(${lx + 16}px, ${ly + 20}px, 0)`;
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
```

The sibling module `js/motion/field.js:122-131` already solves this correctly (settle check + `wake()` on pointer events).

## Target

**A** — a fixed 26×26px box whose ring is an SVG `<circle>` with `vector-effect: non-scaling-stroke`. The grow animates `transform: scale()` on the circle (compositor-friendly geometry, paint bounded to a 26px layer) while the stroke stays a constant 1px hairline at both sizes — exact visual parity with today's 8px→26px, always-1px-border ring.

**B** — the loop stops once all four lerps settle within 0.1px, and wakes on the next `pointermove`.

## Repo conventions to follow

- Easing/duration: keep `var(--ease-out-expo)` and the existing 180ms/200ms values (`styles/tokens.css:45,47`).
- Idle-loop pattern to imitate: `wake()` / settled-early-return in `js/motion/field.js:122-131`.
- Reduced motion: `styles/motion.css:288-292` already hides `.mx-cursor` under `prefers-reduced-motion` and `js/motion/cursor.js:8-9` bails on coarse pointers / reduced motion — leave both untouched.

## Steps

1. **`js/motion/cursor.js:11-13`** — give the dot its SVG ring right after creation:

   ```js
   const dot = document.createElement("div");
   dot.className = "mx-cursor";
   dot.setAttribute("aria-hidden", "true");
   dot.innerHTML =
     '<svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="12.5" /></svg>';
   ```

2. **`styles/motion.css:173-205`** — replace the `.mx-cursor` block and `.is-hot` rule with:

   ```css
   .mx-cursor {
     position: fixed;
     left: 0;
     top: 0;
     /* Self-center on the JS-driven point. `translate` composes before the
        JS `transform`, so the ring's center always sits exactly on (x, y). */
     translate: -50% -50%;
     z-index: 10020;
     width: 26px;
     height: 26px;
     pointer-events: none;
     opacity: 0;
     transition: opacity 200ms ease;
   }

   .mx-cursor svg {
     display: block;
     width: 100%;
     height: 100%;
     overflow: visible;
   }

   /* The ring grows via transform on the circle geometry; non-scaling-stroke
      keeps the hairline at 1px at both sizes, so the grow never leaves the
      compositor-friendly path (no width/height animation). */
   .mx-cursor circle {
     fill: none;
     stroke: var(--color-tc);
     stroke-width: 1;
     vector-effect: non-scaling-stroke;
     transform-box: fill-box;
     transform-origin: center;
     transform: scale(0.308); /* renders as the 8px resting dot */
     transition:
       transform 180ms var(--ease-out-expo),
       stroke 180ms ease;
   }

   .mx-cursor.is-on {
     opacity: 1;
   }

   .mx-cursor.is-hot circle {
     transform: scale(1);
     stroke: var(--color-rec);
   }
   ```

   (Keep the surrounding `.mx-cursor-label` rules exactly as they are.)

3. **`js/motion/cursor.js:69-78`** — replace the perpetual loop with a settling one:

   ```js
   let rafId = 0;
   const frame = () => {
     x += (tx - x) * 0.22;
     y += (ty - y) * 0.22;
     lx += (tx - lx) * 0.14;
     ly += (ty - ly) * 0.14;
     const settled =
       Math.abs(tx - x) < 0.1 &&
       Math.abs(ty - y) < 0.1 &&
       Math.abs(tx - lx) < 0.1 &&
       Math.abs(ty - ly) < 0.1;
     if (settled) {
       x = tx;
       y = ty;
       lx = tx;
       ly = ty;
     }
     dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
     label.style.transform = `translate3d(${lx + 16}px, ${ly + 20}px, 0)`;
     if (settled) {
       rafId = 0;
       return;
     }
     rafId = requestAnimationFrame(frame);
   };
   const wake = () => {
     if (!rafId) rafId = requestAnimationFrame(frame);
   };
   wake();
   ```

4. **`js/motion/cursor.js:38-61`** — at the end of the existing `pointermove` handler (after the `dot.classList.toggle(...)` line), add `wake();`.

## Boundaries

- Do NOT change the lerp factors (0.22 / 0.14), the label offsets (+16, +20), or the `labelFor` / `isHot` logic.
- Do NOT touch `.mx-cursor-label` styles or the reduced-motion block.
- Do NOT add libraries.
- If the cited lines don't match (drift since f44644e), STOP and report.

## Verification

- **Mechanical**: no console errors; `grep -n "width 180ms\|height 180ms" styles/motion.css` returns nothing.
- **Feel check** (fine pointer required):
  - The dot trails the pointer with the same lag as before; the label chip trails slightly more.
  - Hover a nav link: the ring grows smoothly to 26px and turns rec-red; the stroke stays hairline-thin (~1px) at both sizes — zoom to 400% in a screenshot to confirm it did not thicken.
  - In DevTools → Performance, record 3s with the mouse **completely still**: there must be no continuous `requestAnimationFrame` activity. Move the mouse: activity resumes, then stops ~0.5s after the pointer rests.
  - DevTools Animations panel at 25% speed: the grow eases out (fast start), no size snap at either end.
- **Reduced motion**: toggle it — the cursor dot and label must not render at all (existing behavior).
- **Done when**: ring grow runs on `transform` only, stroke stays 1px at both sizes, and the rAF loop provably idles when the pointer is still.
