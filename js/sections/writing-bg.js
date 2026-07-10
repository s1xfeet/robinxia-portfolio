// Background video carousel for The Writing section: the four writing videos
// play muted behind the cards. Clips are lazy (data-src + preload="none") and
// only play while the section is in view — and only on wider viewports without
// a reduced-motion or save-data hint. The horizontal scroll is CSS (writing.css).

const WRITING_CLIPS = [
  { src: "assets/wall/zack32.mp4", poster: "assets/wall/zack32.jpg" }, // The $32 Gaming PC
  { src: "assets/wall/zackwin10.mp4", poster: "assets/wall/zackwin10.jpg" }, // RIP Windows 10
  { src: "assets/wall/pc100.mp4", poster: "assets/wall/pc100.jpg" }, // The $100 Gaming PC
  { src: "assets/wall/zackloud.mp4", poster: "assets/wall/zackloud.jpg" }, // Loudest Gaming PC
];

function buildTile(clip) {
  const tile = document.createElement("div");
  tile.className = "writing-tile";
  const video = document.createElement("video");
  video.className = "writing-vid";
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

export function initWritingBg() {
  const section = document.querySelector(".section--writing");
  const track = section && section.querySelector(".writing-track");
  if (!section || !track) return;

  // Build one group, repeating the four clips until it spans the viewport
  // (capped), then clone it once so the CSS -50% loop is seamless.
  const group = [];
  let pass = 0;
  const fillWidth = window.innerWidth || 1440;
  do {
    WRITING_CLIPS.forEach((clip) => {
      const tile = buildTile(clip);
      track.appendChild(tile);
      group.push(tile);
    });
    pass += 1;
    if (track.scrollWidth === 0) break; // not laid out yet
  } while (track.scrollWidth < fillWidth && pass < 3);

  group.forEach((tile) => {
    const copy = tile.cloneNode(true);
    const clonedVideo = copy.querySelector("video");
    if (clonedVideo) clonedVideo.muted = true; // muted property is lost on clone
    track.appendChild(copy);
  });

  // Match a calm, constant speed regardless of how wide the group ended up.
  const groupWidth = track.scrollWidth / 2 || 1;
  track.style.setProperty("--wr-dur", Math.max(30, Math.round(groupWidth / 28)) + "s");

  const videos = Array.from(track.querySelectorAll(".writing-vid"));
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
        if (started && typeof started.catch === "function") started.catch(() => {});
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
    observer.observe(section);
  } else {
    inView = true;
    sync();
  }

  window.addEventListener("resize", sync, { passive: true });
}
