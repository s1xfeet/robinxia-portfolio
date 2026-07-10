// Selected Work - each feature client is a full-viewport scene whose real
// clips play full-bleed in the background. A foreground playlist of numbered
// takes drives it: the background auto-advances through the clips, and hovering
// (or focusing) a take pins that clip and cross-dissolves it into the
// background. Clicking a take opens its real YouTube video in the shared
// lightbox (js/lightbox.js handles any a[data-lightbox] click).
//
// Politeness mirrors the work wall (js/sections/wall.js): clips are lazy (src
// assigned from the config below only when the scene is near the viewport),
// muted + playsinline + looping, paused off-screen, and skipped entirely -
// poster only - on reduced-motion, save-data, or narrow (<=700px) viewports.
// At most one clip plays per scene with the next warmed. Nothing throws out of
// initWork; a failing scene just leaves its static poster in place.

// Per scene: the ordered clips (src for the background, href for the lightbox).
// Hrefs mirror the pairings in js/sections/wall-data.js, but the background
// plays the dedicated high-quality set in assets/bg/ (1080p60, ~8s loops,
// re-cut from the same videos) rather than the small wall-tile clips. (NK is
// no longer a full-bleed scene: it now replicates the writing section as a
// drifting background carousel + glass cards, built by work-nk-bg.js.)
const SCENES = {
  jack: [
    { src: "assets/bg/jack1.mp4", href: "https://youtu.be/CgJolSvDO5g" },
    { src: "assets/bg/jack2.mp4", href: "https://youtu.be/W9j0dezbjOw" },
    { src: "assets/bg/jack3.mp4", href: "https://youtu.be/ehmWKL0nH5g" },
    { src: "assets/bg/jack4.mp4", href: "https://youtu.be/a59gdEbij3o" },
    { src: "assets/bg/jack5.mp4", href: "https://youtu.be/USWDz5vG7lg" },
    { src: "assets/bg/jack6.mp4", href: "https://youtu.be/-a7hFbNbuDE" },
    { src: "assets/bg/jack7.mp4", href: "https://youtu.be/PgWWIpsRKkg" },
    { src: "assets/bg/jack8.mp4", href: "https://youtu.be/wvVJzNjqlsY" },
  ],
};

const HOLD_MS = 7000; // time each clip holds before the background auto-advances

// A muted, looping, lazily-loaded background layer. src is assigned only when a
// clip is first shown, so nothing downloads until the scene is near the
// viewport AND playback is allowed.
function makeVideo() {
  const video = document.createElement("video");
  video.className = "scene__bgvid";
  video.muted = true; // property form is the one browsers trust for autoplay
  video.setAttribute("muted", "");
  video.setAttribute("loop", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("preload", "none");
  video.setAttribute("tabindex", "-1");
  video.setAttribute("aria-hidden", "true");
  video.setAttribute("disablepictureinpicture", "");
  return video;
}

// One controller per scene. Owns two <video> layers (front shown, back
// warming), the auto-advance timer, and the enable / visibility gates. The
// playlist items drive which clip is current via hover / focus.
function createScene(sceneEl) {
  const clips = SCENES[sceneEl.dataset.scene];
  const bg = sceneEl.querySelector(".scene__bg");
  const scrim = bg && bg.querySelector(".scene__scrim");
  const items = Array.from(sceneEl.querySelectorAll(".reel-item"));
  const reelList = sceneEl.querySelector(".scene__reel");
  if (!clips || !bg || !items.length || !reelList) return null;

  const mqWide = window.matchMedia("(min-width: 701px)");
  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const computeEnabled = () =>
    mqWide.matches &&
    !mqReduce.matches &&
    !(navigator.connection && navigator.connection.saveData);

  let enabled = computeEnabled();
  let visible = false;
  let built = false;
  let started = false;
  let hovering = false;
  let cur = 0;
  let timer = 0;
  let front = null;
  let back = null;

  const canPlay = () => enabled && visible;

  // Highlight the take whose clip is currently in the background.
  const setActive = (i) => {
    items.forEach((el, n) => el.classList.toggle("is-active", n === i));
  };

  const setClip = (video, clip) => {
    if (video._clipSrc !== clip.src) {
      video.src = clip.src; // lazy: first assignment triggers the download
      video._clipSrc = clip.src;
    }
  };

  const playVideo = (video) => {
    if (!canPlay()) return;
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  const buildVideos = () => {
    if (built) return;
    front = makeVideo();
    back = makeVideo();
    // Insert behind the scrim so the wash always sits on top of the footage.
    bg.insertBefore(back, scrim);
    bg.insertBefore(front, scrim);
    built = true;
  };

  const warmNext = () => {
    setClip(back, clips[(cur + 1) % clips.length]);
  };

  const showFirst = () => {
    setClip(front, clips[cur]);
    front.classList.add("is-front");
    playVideo(front);
    setActive(cur);
    warmNext();
  };

  // Cross-dissolve to clip i by swapping the warmed back layer to front.
  const showClip = (i) => {
    if (!built) return;
    cur = i;
    setClip(back, clips[cur]);
    try {
      back.currentTime = 0;
    } catch (_) {}
    playVideo(back);
    back.classList.add("is-front");
    front.classList.remove("is-front");
    const prev = front;
    front = back;
    back = prev;
    back.pause(); // only the front layer keeps decoding
    setActive(cur);
    warmNext();
  };

  const schedule = () => {
    clearTimeout(timer);
    if (hovering) return;
    timer = window.setTimeout(() => {
      if (canPlay() && !hovering) {
        showClip((cur + 1) % clips.length);
        schedule();
      }
    }, HOLD_MS);
  };

  const start = () => {
    buildVideos();
    if (!started) {
      started = true;
      showFirst();
    } else {
      playVideo(front);
      setActive(cur);
    }
    schedule();
  };

  // Pause playback. `reveal` drops the front layer so the poster shows again -
  // used when the gate closes (reduced-motion / save-data / narrow).
  const stop = (reveal) => {
    clearTimeout(timer);
    if (!built) return;
    front.pause();
    back.pause();
    if (reveal) {
      front.classList.remove("is-front");
      back.classList.remove("is-front");
    }
  };

  // Hover / focus a take: pin it, swap the background, hold until the pointer
  // (or focus) leaves the list, then resume the calm auto-advance.
  const onPreview = (event) => {
    const item = event.target.closest(".reel-item");
    if (!item) return;
    const i = Number(item.dataset.clip);
    if (Number.isNaN(i)) return;
    hovering = true;
    clearTimeout(timer);
    if (canPlay() && built && i !== cur) showClip(i);
    else setActive(i); // gated: still move the highlight for responsiveness
  };

  const onLeave = () => {
    hovering = false;
    schedule();
  };

  reelList.addEventListener("pointerover", onPreview);
  reelList.addEventListener("focusin", onPreview);
  reelList.addEventListener("pointerleave", onLeave);
  reelList.addEventListener("focusout", (event) => {
    if (!reelList.contains(event.relatedTarget)) onLeave();
  });

  const onVisibility = (isVisible) => {
    visible = isVisible;
    if (canPlay()) start();
    else stop(false);
  };

  const onEnabledChange = () => {
    enabled = computeEnabled();
    if (enabled) {
      if (visible) start();
    } else {
      stop(true);
    }
  };

  // Warm just before the scene scrolls in; pause the moment it leaves.
  let observer = null;
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) onVisibility(entry.isIntersecting);
      },
      { root: null, rootMargin: "200px 0px", threshold: 0 }
    );
    observer.observe(sceneEl);
  } else {
    onVisibility(true);
  }

  if (typeof mqWide.addEventListener === "function") {
    mqWide.addEventListener("change", onEnabledChange);
    mqReduce.addEventListener("change", onEnabledChange);
  } else if (typeof mqWide.addListener === "function") {
    mqWide.addListener(onEnabledChange); // legacy Safari
    mqReduce.addListener(onEnabledChange);
  }
  window.addEventListener("resize", onEnabledChange, { passive: true });
  if (
    navigator.connection &&
    typeof navigator.connection.addEventListener === "function"
  ) {
    navigator.connection.addEventListener("change", onEnabledChange);
  }

  return {
    destroy() {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", onEnabledChange);
      stop(true);
    },
  };
}

export function initWork() {
  const scenes = document.querySelectorAll(".work-scene[data-scene]");
  for (const scene of scenes) {
    try {
      createScene(scene);
    } catch (_) {
      // A broken scene must never take down the page - poster stays as-is.
    }
  }
}
