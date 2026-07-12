// Cursor language: a lerped viewfinder dot that augments (never replaces)
// the native cursor, plus a contextual mono chip — "SCRUB" over the live
// work wall, "PLAY" over anything that opens the lightbox. The dot grows
// rec-red over any link or button. Fine pointers only; reduced motion
// leaves the native cursor alone.

export function initCursor() {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const dot = document.createElement("div");
  dot.className = "mx-cursor";
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("div");
  label.className = "mx-cursor-label";
  label.setAttribute("aria-hidden", "true");
  document.body.append(dot, label);

  let tx = -100;
  let ty = -100;
  let x = -100;
  let y = -100;
  let lx = -100;
  let ly = -100;
  let seen = false;

  const labelFor = (target) => {
    if (!(target instanceof Element)) return null;
    if (target.closest("[data-lightbox]")) return "▶ Play";
    if (target.closest(".hero-play")) return "▶ Play";
    if (target.closest(".wall.is-live .wall-row")) return "⟷ Scrub";
    return null;
  };

  const isHot = (target) =>
    target instanceof Element && Boolean(target.closest("a, button"));

  document.addEventListener(
    "pointermove",
    (event) => {
      tx = event.clientX;
      ty = event.clientY;
      if (!seen) {
        seen = true;
        x = tx;
        y = ty;
        lx = tx;
        ly = ty;
        dot.classList.add("is-on");
      }
      const text = labelFor(event.target);
      if (text) {
        label.textContent = text;
        label.classList.add("is-on");
      } else {
        label.classList.remove("is-on");
      }
      dot.classList.toggle("is-hot", isHot(event.target));
    },
    { passive: true }
  );

  document.addEventListener("pointerleave", () => {
    dot.classList.remove("is-on");
    label.classList.remove("is-on");
    seen = false;
  });

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
}
