// Minimal video lightbox. A wall tile whose href is a YouTube video opens a
// centered player instead of navigating away; TikTok / channel / "#" links keep
// their default behaviour. Event-delegated on #wall, so it works no matter when
// the tiles are built.

const YT_RE =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/))([A-Za-z0-9_-]{6,})/;

function youtubeId(url) {
  const match = url && url.match(YT_RE);
  return match ? match[1] : null;
}

export function initLightbox() {
  const wall = document.getElementById("wall");
  if (!wall) return;

  let overlay = null;
  let lastFocus = null;

  const onKey = (event) => {
    if (event.key === "Escape") close();
  };

  function close() {
    if (!overlay) return;
    overlay.remove(); // dropping the iframe stops playback
    overlay = null;
    document.removeEventListener("keydown", onKey);
    document.documentElement.style.removeProperty("overflow");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    lastFocus = null;
  }

  function open(id, vertical) {
    lastFocus = document.activeElement;

    overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Video player");

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lightbox__close";
    closeBtn.setAttribute("aria-label", "Close video");
    closeBtn.textContent = "✕";

    const frame = document.createElement("div");
    frame.className = "lightbox__frame" + (vertical ? " lightbox__frame--tall" : "");

    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
    iframe.title = "Video player";
    iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);

    overlay.append(closeBtn, frame);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    closeBtn.addEventListener("click", close);

    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeBtn.focus();
  }

  wall.addEventListener("click", (event) => {
    const tile = event.target.closest("a.tile");
    if (!tile) return;
    const id = youtubeId(tile.getAttribute("href") || "");
    if (!id) return; // TikTok, channel, or "#" anchor -> default behaviour
    event.preventDefault();
    open(id, tile.classList.contains("tile--tall"));
  });

  // Feature "dailies reel" frames (js/sections/work.js) live outside #wall but
  // reuse this same player: any anchor tagged data-lightbox opens the current
  // clip's YouTube video, and data-vertical picks the tall (Shorts) frame.
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-lightbox]");
    if (!link) return;
    const id = youtubeId(link.getAttribute("href") || "");
    if (!id) return;
    event.preventDefault();
    open(id, link.hasAttribute("data-vertical"));
  });
}
