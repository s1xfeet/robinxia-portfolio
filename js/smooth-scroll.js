// Inertial "smooth scroll" upgrade over native window scrolling. Lenis drives
// window.scrollY itself (no wrapper element), so every existing scroll-linked
// system (timecode.js, sections/wall.js) keeps reading real scroll position
// and needs no changes.
//
// Reduced-motion and Save-Data both bail before instantiation: native scroll
// plus the CSS scroll-behavior: smooth on <html> is the correct degraded path.

import Lenis from "./vendor/lenis.mjs";

const HEADER_OFFSET = -88; // matches html { scroll-padding-top: 5.5rem } = 88px

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function saveDataEnabled() {
  return Boolean(navigator.connection?.saveData);
}

function focusTarget(target) {
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

function handleAnchorClick(event, lenis) {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  if (link.closest(".lightbox")) return; // lightbox controls its own focus/scroll

  const hash = link.getAttribute("href");
  if (!hash || hash === "#") return;

  const target = document.querySelector(hash);
  if (!target) return;

  event.preventDefault();
  lenis.scrollTo(hash, {
    offset: HEADER_OFFSET,
    onComplete: () => focusTarget(target),
    // force: a click from inside the mobile menu lands while Lenis is still
    // stopped (the overflow unlock is observed in a microtask, after this
    // handler), and a stopped Lenis silently drops scrollTo otherwise
    force: true,
  });
  history.pushState(null, "", hash);
}

function watchScrollLock(lenis) {
  const observer = new MutationObserver(() => {
    // read the INLINE style the lockers (lightbox, mobile nav) set, not the
    // computed value: our own .lenis-stopped CSS also computes to hidden,
    // which would re-trigger stop() forever after the first unlock
    const locked = document.documentElement.style.overflow === "hidden";
    if (locked) lenis.stop();
    else lenis.start();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style"],
  });
  return observer;
}

function createLenis() {
  return new Lenis({
    autoRaf: true,
    lerp: 0.09,
    wheelMultiplier: 1,
    smoothWheel: true,
    syncTouch: false,
    anchors: false,
  });
}

export function initSmoothScroll() {
  if (prefersReducedMotion() || saveDataEnabled()) return;

  let lenis = createLenis();
  const lockObserver = watchScrollLock(lenis);

  const onAnchorClick = (event) => handleAnchorClick(event, lenis);
  document.addEventListener("click", onAnchorClick);

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotionQuery.addEventListener("change", (event) => {
    if (!event.matches || !lenis) return;
    lockObserver.disconnect();
    lenis.destroy();
    lenis = null;
    document.removeEventListener("click", onAnchorClick);
  });
}
