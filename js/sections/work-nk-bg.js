// Background video carousel for NK's scene in Selected Work, rebuilt to
// replicate The Writing section (js/sections/writing-bg.js): NK's four shorts
// (nk1-4, 9:16) drift muted across a single row behind the glass "watch" cards.
// Clips are lazy (data-src + preload="none") and only play while the scene is
// in view, and only on wider viewports without a reduced-motion or save-data
// hint. The horizontal scroll itself is CSS (work.css). Decorative: the whole
// carousel is aria-hidden and holds no tab stops.

const NK_CLIPS = [
  { src: "assets/wall/nk1.mp4", poster: "assets/wall/nk1.jpg" },
  { src: "assets/wall/nk2.mp4", poster: "assets/wall/nk2.jpg" },
  { src: "assets/wall/nk3.mp4", poster: "assets/wall/nk3.jpg" },
  { src: "assets/wall/nk4.mp4", poster: "assets/wall/nk4.jpg" },
];

function buildTile(clip) {
  const tile = document.createElement("div");
  tile.className = "nk-tile";
  const video = document.createElement("video");
  video.className = "nk-vid";
  video.muted = true;
  video.setAttribute("muted", "");
  video.setAttribute("loop", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("preload", "none");
  video.setAttribute("aria-hidden", "true");
  video.setAttribute("tabindex", "-1");
  video.setAttribute("disablepictureinpicture", "");
  if (clip.poster) video.setAttribute("poster", clip.poster);
  video.dataset.src = clip.src; // lazy: promoted to .src on first play
  tile.appendChild(video);
  return tile;
}

export function initWorkNkBg() {
  const scene = document.querySelector(".work-scene--nk");
  const track = scene && scene.querySelector(".nk-track");
  if (!scene || !track) return;

  // Build one group, repeating the four clips until it spans the viewport
  // (capped), then clone it once so the CSS -50% loop is seamless.
  const group = [];
  let pass = 0;
  const fillWidth = window.innerWidth || 1440;
  do {
    NK_CLIPS.forEach((clip) => {
      const tile = buildTile(clip);
      track.appendChild(tile);
      group.push(tile);
    });
    pass += 1;
    if (track.scrollWidth === 0) break; // not laid out yet
  } while (track.scrollWidth < fillWidth && pass < 4);

  group.forEach((tile) => {
    const copy = tile.cloneNode(true);
    const clonedVideo = copy.querySelector("video");
    if (clonedVideo) clonedVideo.muted = true; // muted property is lost on clone
    track.appendChild(copy);
  });

  // Match a calm, constant speed regardless of how wide the group ended up.
  const groupWidth = track.scrollWidth / 2 || 1;
  track.style.setProperty(
    "--nk-dur",
    Math.max(40, Math.round(groupWidth / 24)) + "s"
  );

  const videos = Array.from(track.querySelectorAll(".nk-vid"));
  const allowed = () =>
    window.matchMedia("(min-width: 701px)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !(navigator.connection && navigator.connection.saveData);

  let inView = false;
  const sync = () => {
    if (inView && allowed()) {
      track.classList.remove("is-idle");
      for (const video of videos) {
        if (!video.src && video.dataset.src) video.src = video.dataset.src;
        const started = video.play();
        if (started && typeof started.catch === "function")
          started.catch(() => {});
      }
    } else {
      // also freeze the CSS marquee so the compositor idles off-screen
      track.classList.add("is-idle");
      for (const video of videos) video.pause();
    }
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inView = entry.isIntersecting;
        sync();
      },
      { rootMargin: "150px 0px", threshold: 0 }
    );
    observer.observe(scene);
  } else {
    inView = true;
    sync();
  }

  window.addEventListener("resize", sync, { passive: true });
}
