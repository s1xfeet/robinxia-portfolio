// Scroll-reveal: adds .is-revealed to [data-reveal] elements as they enter.
// The data-reveal VALUE selects an entrance variant (see atmosphere.css):
//   ""/up (default) · left · right · scale · clip · wipe
// A [data-reveal-group] container auto-decorates its direct children as
// reveal targets and assigns a --reveal-i index so they cascade in order,
// so metrics/cards stagger without hand-written data-reveal-delay values.
// Respects prefers-reduced-motion by revealing everything immediately.

function decorateGroups() {
  const groups = document.querySelectorAll("[data-reveal-group]");
  groups.forEach((group) => {
    const variant = group.getAttribute("data-reveal-group") || "";
    let index = 0;
    for (const child of group.children) {
      if (!child.hasAttribute("data-reveal")) {
        child.setAttribute("data-reveal", variant);
      }
      child.style.setProperty("--reveal-i", String(index));
      index += 1;
    }
  });
}

export function initReveal() {
  decorateGroups();

  const targets = document.querySelectorAll("[data-reveal]");
  if (!targets.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 }
  );

  targets.forEach((el) => observer.observe(el));
}
