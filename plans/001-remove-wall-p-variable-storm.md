# 001 — Remove the `--wall-p` per-frame variable recalc storm

- **Status**: DONE
- **Commit**: f44644e
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 2 files (`js/sections/wall.js`, `styles/sections/hero.css`), ~40 lines

## Problem

Every scroll frame during the 230vh hero runway, JS flips a CSS custom property on the hero section:

```js
/* js/sections/wall.js:520 — current */
hero.style.setProperty("--wall-p", p.toFixed(4));
```

Four CSS rules consume it — including one on **every tile** (40–90 elements, most holding a playing `<video>`):

```css
/* styles/sections/hero.css:38 — current */
.wall { transform: scale(calc(1.055 - 0.055 * var(--wall-p, 0))); }

/* styles/sections/hero.css:139 — current (inside .tile) */
opacity: calc(0.72 + 0.28 * var(--wall-p, 0));

/* styles/sections/hero.css:397 — current (inside .wall-scrim) */
opacity: calc(0.87 - 0.79 * var(--wall-p, 0));

/* styles/sections/hero.css:408-409 — current (inside .hero-overlay) */
opacity: clamp(0, calc(1 - 1.45 * var(--wall-p, 0)), 1); /* gone by p≈0.7 */
translate: 0 calc(var(--wall-p, 0) * -2.5rem);

/* styles/sections/hero.css:573-575 — current (mobile override) */
.wall-scrim { opacity: calc(0.94 - 0.86 * var(--wall-p, 0)); }
```

Changing an inherited custom property on the section invalidates computed style for the whole hero subtree, so every scroll frame recalcs style across dozens of video tiles — and Lenis (`js/smooth-scroll.js`) makes scroll updates fire on virtually every frame. This is the classic "CSS variable on a parent drives children" recalc storm.

The tile opacity value is **identical for every tile**, so it does not need to live per-tile at all.

## Target

No `--wall-p` variable anywhere. The same rAF that computes `p` writes styles **directly on exactly three elements**: `#wall` (transform + opacity), `.wall-scrim` (opacity), `.hero-overlay` (opacity + translate). CSS keeps only the static `p = 0` resting values as no-JS fallbacks. All formulas keep their exact current constants. Visual output must be pixel-identical at every scroll position.

## Repo conventions to follow

- Reduced-motion gates in this file use module-scoped `matchMedia` queries checked at use time — see `mqReduce` in `js/sections/wall.js:209` and `js/sections/wall.js:92`. Imitate that.
- rAF-throttled scroll pattern (`ticking` flag) already wraps `update()` — do not restructure it.

## Steps

1. **`styles/sections/hero.css:36-39`** — replace the calc with the static resting state and take over the tile opacity (hoisted here in step 2):

   ```css
   /* settles from a gentle over-scale to 1 as the user scrolls; wall.js
      drives transform + opacity directly per frame (no CSS var — a var
      flip on the section recalcs style for every tile) */
   transform: scale(1.055);
   opacity: 0.72;
   ```

2. **`styles/sections/hero.css:139`** — delete the line `opacity: calc(0.72 + 0.28 * var(--wall-p, 0));` from `.tile`. Do not touch the tile's `transition` list; the per-tile hover rules (`opacity: 1` on hover, `opacity: 0.3` spotlight dim) stay exactly as they are.

3. **`styles/sections/hero.css:397`** — in `.wall-scrim`, replace the calc line with `opacity: 0.87;` (keep the explanatory comment above it).

4. **`styles/sections/hero.css:408-409`** — in `.hero-overlay`, delete the `opacity: clamp(...)` and `translate: ...` lines (resting state is fully visible, untranslated — the default).

5. **`styles/sections/hero.css:573-575`** — in the `@media (max-width: 700px)` block, replace the `.wall-scrim` calc with `opacity: 0.94;`.

6. **`styles/sections/hero.css:599-658` (reduced-motion block)** — delete the now-dead `.wall { transform: none; }` and `.hero-overlay { translate: none; }` rules (JS gates these inline writes itself in step 7; the CSS rules would lose to inline styles anyway).

7. **`js/sections/wall.js` — inside `initWall()`**, above the existing `update` function, add:

   ```js
   const scrimEl = hero.querySelector(".wall-scrim");
   const overlayEl = hero.querySelector(".hero-overlay");
   const mqReduceP = window.matchMedia("(prefers-reduced-motion: reduce)");
   const mqNarrowP = window.matchMedia("(max-width: 700px)");
   ```

   Then replace the single `hero.style.setProperty("--wall-p", p.toFixed(4));` line (`js/sections/wall.js:520`) with:

   ```js
   // Direct writes on the three consumers — never a CSS var on the
   // section, which would recalc style for every tile each frame.
   const reduce = mqReduceP.matches;
   wall.style.transform = reduce ? "" : `scale(${(1.055 - 0.055 * p).toFixed(4)})`;
   wall.style.opacity = (0.72 + 0.28 * p).toFixed(3);
   if (scrimEl) {
     const base = mqNarrowP.matches ? 0.94 : 0.87;
     const range = mqNarrowP.matches ? 0.86 : 0.79;
     scrimEl.style.opacity = (base - range * p).toFixed(3);
   }
   if (overlayEl) {
     overlayEl.style.opacity = Math.min(1, Math.max(0, 1 - 1.45 * p)).toFixed(3);
     overlayEl.style.translate = reduce ? "" : `0 ${(-2.5 * p).toFixed(3)}rem`;
   }
   ```

8. **`js/sections/wall.js`** — after the `window.addEventListener("resize", onScroll, …)` line near the end of `initWall()` (`js/sections/wall.js:542`), re-run the writes when the reduced-motion or width query flips:

   ```js
   mqReduceP.addEventListener?.("change", onScroll);
   mqNarrowP.addEventListener?.("change", onScroll);
   ```

## Boundaries

- Do NOT touch `buildWall`, `createMarquee`, `createVideoController`, the bloom (`wall--armed` / `wall--enter`), or the `fireEntrance` / `is-live` logic inside `update()` — only the style-write block changes.
- Do NOT change any numeric constant (0.72/0.28, 0.87/0.79, 0.94/0.86, 1.055/0.055, 1.45, 2.5rem).
- Do NOT add a CSS variable back anywhere, including on `.wall` itself.
- If the cited lines don't match (drift since f44644e), STOP and report.

## Verification

- **Mechanical**: `grep -rn "wall-p" js/ styles/ index.html` returns nothing. Load the site (`.claude/launch.json` dev server or `python3 dev-server.py`) with zero console errors.
- **Feel check**: scroll the full hero runway slowly, then fast, then backwards. The wall must still settle from over-scale to 1, tiles must still brighten from 0.72 → 1, the scrim must still lift, and the statement must still fade + rise away — identical to before at every position. Check ≤700px width for the darker scrim floor.
- **Perf check**: DevTools → Performance, record a scroll through the hero. "Recalculate Style" entries during scroll should report single-digit affected elements (previously: the entire tile subtree every frame).
- **Reduced motion**: toggle in DevTools Rendering panel → wall holds `scale/translate`-free (opacity writes still apply), no inline `transform`/`translate` values stuck from before the flip after one scroll tick.
- **Done when**: no `--wall-p` reference exists, scroll visuals are unchanged, and per-frame style recalc no longer touches the tiles.
