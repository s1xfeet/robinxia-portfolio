// Section spy: marks the nav link of the section currently in view.

export function initNav() {
  const links = document.querySelectorAll(".site-nav a[href^='#']");
  if (!links.length || !("IntersectionObserver" in window)) return;

  const byId = new Map();
  links.forEach((link) => byId.set(link.getAttribute("href").slice(1), link));

  const sections = [...byId.keys()]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((link) => link.removeAttribute("aria-current"));
        const link = byId.get(entry.target.id);
        if (link) link.setAttribute("aria-current", "true");
      }
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );

  sections.forEach((section) => observer.observe(section));
}
