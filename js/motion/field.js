// Proximity magnification field for the work wall — Apple Watch app-library
// feel. Every tile's scale is a smooth function of its distance to the
// cursor, and — like the macOS Dock — growth DISPLACES row siblings
// instead of overlapping them: a growing tile pushes everything on each
// side of it by half its added width, which exactly preserves the row's
// gaps.
//
// Rows deliberately do NOT move. An earlier version also spaced the rows
// apart vertically, but whole rows bobbing as the cursor crossed them made
// the wall churn (motion sickness) and shoved the top row under the fixed
// header. Growth is kept small enough that the row gaps absorb most of
// the vertical swell; the little that remains overlaps by a few px and
// resolves toward the cursor via z-index.
//
// Scales are lerped per frame so the bubble glides rather than snaps, and
// geometry is re-read every frame so the field stays correct while the
// marquee drifts tiles underneath it. Fine pointers only; reduced motion
// leaves the CSS hover fallback in charge. The wall is inert until it
// goes live, so no events (and no work) happen under the hero overlay.

const RADIUS = 400; // px falloff radius of the bubble
const MAX_BOOST = 0.14; // nearest tile grows to 1.14 — calm, not churning
const EASE = 0.12; // per-frame lerp toward target; lower = floatier

export function initTileField() {
  const wall = document.getElementById("wall");
  if (!wall) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Hand the transform channel to this module: motion.css drops transform
  // from the tile transition list under .has-field so the per-frame writes
  // aren't double-smoothed into mush by the 180ms hover transition.
  wall.classList.add("has-field");

  // tile -> { k: field strength 0..1, tx: applied x displacement }
  const tileState = new Map();

  let rows = [];
  const collect = () => {
    rows = Array.from(wall.querySelectorAll(".wall-row")).map((rowEl) =>
      Array.from(rowEl.querySelectorAll(".tile"))
    );
    const alive = new Set();
    for (const row of rows) {
      for (const t of row) {
        alive.add(t);
        if (!tileState.has(t)) tileState.set(t, { k: 0, tx: 0 });
      }
    }
    for (const t of tileState.keys()) if (!alive.has(t)) tileState.delete(t);
  };
  collect();

  // Wall rebuilds (resize) replace every tile — re-collect when tracks change.
  const observer = new MutationObserver(collect);
  for (const track of wall.querySelectorAll(".wall-track")) {
    observer.observe(track, { childList: true });
  }

  let px = -1e4;
  let py = -1e4;
  let active = false; // pointer currently over the wall
  let rafId = 0;

  const frame = () => {
    let settled = true;

    for (const row of rows) {
      // Phase 1 — read. Rects include our own previous transforms, so back
      // them out to get base geometry; computing the field from base
      // positions keeps the displacement from feeding back into itself.
      const geo = row.map((t) => {
        const s = tileState.get(t);
        const r = t.getBoundingClientRect();
        const scale = 1 + MAX_BOOST * s.k;
        return {
          t,
          s,
          w: r.width / scale,
          cx: r.left + r.width / 2 - s.tx,
          cy: r.top + r.height / 2,
        };
      });

      // Phase 2 — field strengths.
      for (const g of geo) {
        const d = Math.hypot(px - g.cx, py - g.cy);
        const target =
          active && d < RADIUS
            ? (Math.cos((d / RADIUS) * Math.PI) + 1) / 2
            : 0;
        g.s.k += (target - g.s.k) * EASE;
        if (g.s.k < 0.001 && target === 0) g.s.k = 0;
        else settled = false;
      }

      // Phase 3 — displacement + write. A tile growing by `grow` px pushes
      // everything on each side of it by grow/2, preserving the row's gaps.
      for (const g of geo) {
        let tx = 0;
        for (const o of geo) {
          if (o === g || o.s.k === 0) continue;
          tx += Math.sign(g.cx - o.cx) * ((o.w * MAX_BOOST * o.s.k) / 2);
        }
        g.s.tx = tx;
        if (g.s.k === 0 && Math.abs(tx) < 0.05) {
          g.t.style.transform = "";
          g.t.style.zIndex = "";
        } else {
          const scale = (1 + MAX_BOOST * g.s.k).toFixed(4);
          g.t.style.transform = `translateX(${tx.toFixed(2)}px) scale(${scale})`;
          // The slight vertical swell can brush the neighbouring row;
          // strongest tile rides highest so overlaps resolve to the cursor.
          g.t.style.zIndex = g.s.k > 0.4 ? "3" : g.s.k > 0 ? "1" : "";
        }
      }
    }

    // While the pointer is over the wall the marquee keeps moving tiles
    // through the field, so keep running; once it leaves, run until decayed.
    if (!active && settled) {
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (!rafId) rafId = requestAnimationFrame(frame);
  };

  wall.addEventListener(
    "pointermove",
    (event) => {
      px = event.clientX;
      py = event.clientY;
      active = true;
      wake();
    },
    { passive: true }
  );
  wall.addEventListener("pointerleave", () => {
    active = false;
    wake();
  });
}
