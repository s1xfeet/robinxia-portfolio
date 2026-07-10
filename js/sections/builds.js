// Lazy, gated autoplay for the Related Shorts Changer demo screen in the Builds
// section. Same politeness as the site's other clips (js/sections/wall.js):
// the recording loads and plays only while the section is near the viewport,
// and only on wider viewports without a reduced-motion or save-data hint;
// otherwise the poster still shows and nothing downloads. Never throws.

export function initBuilds() {
  const video = document.querySelector(".build-screen__video");
  if (!video) return;

  const allowed = () =>
    window.matchMedia("(min-width: 701px)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !(navigator.connection && navigator.connection.saveData);

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

  const target = video.closest(".section--builds") || video;
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
