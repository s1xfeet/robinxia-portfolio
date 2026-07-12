// Proximity magnification field for the work wall — Apple Watch app-library
// feel. Every tile's scale is a smooth function of its distance to the
// cursor, so a bubble of growth follows the pointer across the wall:
// the nearest tile swells the most, neighbours swell less, the field
// falls off on a raised-cosine curve. Scales are lerped per frame so the
// bubble glides rather than snaps, and rects are re-read every frame so
// the field stays correct while the marquee drifts tiles underneath it.
//
// Fine pointers only; reduced motion leaves the CSS hover fallback in
// charge. The wall is inert until it goes live, so no events (and no
// work) happen while the hero overlay is up.

const RADIUS = 400; // px falloff radius of the bubble
const MAX_BOOST = 0.26; // nearest tile grows to 1.26
const LIFT = 8; // px upward lift at full boost
const EASE = 0.18; // per-frame lerp toward target

export function initTileField() {
  const wall = document.getElementById("wall");
  if (!wall) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Hand the transform channel to this module: motion.css drops transform
  // from the tile transition list under .has-field so the per-frame writes
  // aren't double-smoothed into mush by the 180ms hover transition.
  wall.classList.add("has-field");

  let tiles = [];
  const boost = new Map(); // tile -> current 0..1 field strength

  const collect = () => {
    tiles = Array.from(wall.querySelectorAll(".tile"));
    const alive = new Set(tiles);
    for (const t of boost.keys()) if (!alive.has(t)) boost.delete(t);
    for (const t of tiles) if (!boost.has(t)) boost.set(t, 0);
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
    // All layout reads first, then all style writes — one layout pass.
    const rects = tiles.map((t) => t.getBoundingClientRect());
    tiles.forEach((t, i) => {
      const r = rects[i];
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      const target =
        active && d < RADIUS ? (Math.cos((d / RADIUS) * Math.PI) + 1) / 2 : 0;
      let k = boost.get(t) + (target - boost.get(t)) * EASE;
      if (k < 0.001 && target === 0) k = 0;
      else settled = false;
      boost.set(t, k);
      if (k === 0) {
        t.style.transform = "";
        t.style.zIndex = "";
      } else {
        t.style.transform = `translateY(${(-LIFT * k).toFixed(2)}px) scale(${(
          1 +
          MAX_BOOST * k
        ).toFixed(4)})`;
        // Swollen tiles overlap neighbours and adjacent rows; the strongest
        // rides highest so overlaps always resolve toward the cursor.
        t.style.zIndex = k > 0.4 ? "3" : "1";
      }
    });
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
