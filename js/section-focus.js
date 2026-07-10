// Section focus: flags the section whose center band is crossing the viewport
// with .is-current so the live scene can brighten while neighbours ease back.
// Adds .js-focus to <html> so the dim treatment (atmosphere.css) only ever
// applies when this ran; JS-off or no IntersectionObserver leaves every
// section at full presence. Motion/dim is further gated behind
// prefers-reduced-motion in CSS.

export function initSectionFocus() {
  const sections = document.querySelectorAll("main .section");
  if (!sections.length || !("IntersectionObserver" in window)) return;

  document.documentElement.classList.add("js-focus");

  let current = null;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.target === current) continue;
        if (current) current.classList.remove("is-current");
        entry.target.classList.add("is-current");
        current = entry.target;
      }
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
  );

  sections.forEach((section) => observer.observe(section));
}
