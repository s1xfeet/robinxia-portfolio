// Lazy, gated autoplay for the operator b-roll behind the About section.
// Same politeness as the site's other background clips (js/sections/builds.js):
// the clip loads and plays only while the section is near the viewport, and
// only on wider viewports without a reduced-motion or save-data hint;
// otherwise the poster carries the scene and nothing downloads. Never throws.

export function initAboutBg() {
  const video = document.querySelector(".about-bg__vid");
  if (!video) return;

  const allowed = () =>
    window.matchMedia("(min-width: 701px)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !(navigator.connection && navigator.connection.saveData);

  // fade the video layer in over the poster only once frames are flowing,
  // so there is never a poster -> black -> footage pop
  video.addEventListener("playing", () => video.classList.add("is-playing"));

  let inView = false;
  const sync = () => {
    if (inView && allowed()) {
      if (!video.src && video.dataset.src) video.src = video.dataset.src;
      const started = video.play();
      if (started && typeof started.catch === "function") started.catch(() => {});
    } else {
      video.pause();
    }
  };

  const target = video.closest(".section--about") || video;
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inView = entry.isIntersecting;
        sync();
      },
      { rootMargin: "200px 0px", threshold: 0 }
    );
    observer.observe(target);
  } else {
    inView = true;
    sync();
  }

  window.addEventListener("resize", sync, { passive: true });
}
