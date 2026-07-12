// Type choreography.
//  initTypeMasks — wraps every slate title in a masked-rise structure
//    (hero lines carry the same structure directly in the markup) and
//    switches its reveal variant to "mask-rise" (styles/motion.css).
//    Must run BEFORE initReveal so the observer sees the final variant.
//  initScramble — spin-up character scramble on mono scene labels,
//    locking in left to right. Mono type = zero layout shift.

const SCRAMBLE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789:/";
const SCRAMBLE_MS = 700;

export function initTypeMasks() {
  document.querySelectorAll(".slate__title").forEach((title) => {
    if (title.querySelector(".mask-line__inner")) return;
    const inner = document.createElement("span");
    inner.className = "mask-line__inner";
    while (title.firstChild) inner.appendChild(title.firstChild);
    title.appendChild(inner);
    title.setAttribute("data-reveal", "mask-rise");
  });
}

export function initScramble() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) return;

  const targets = document.querySelectorAll(
    ".slate__kicker, .scene__index, .hero-scene"
  );
  if (!targets.length) return;

  const scramble = (el) => {
    // animate the label's text node (kickers start with the rec-dot span)
    let node = null;
    for (const child of el.childNodes) {
      if (child.nodeType === 3 && child.textContent.trim()) node = child;
    }
    if (!node) return;
    const final = node.textContent;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / SCRAMBLE_MS);
      const lock = Math.floor(p * final.length);
      let out = final.slice(0, lock);
      for (let i = lock; i < final.length; i += 1) {
        const ch = final[i];
        out +=
          ch === " " || ch === "·"
            ? ch
            : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
      }
      node.textContent = out;
      if (p < 1) requestAnimationFrame(step);
      else node.textContent = final;
    };
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        scramble(entry.target);
      }
    },
    { threshold: 0.2 }
  );

  // hero labels scramble like everything else
  targets.forEach((el) => observer.observe(el));
}
