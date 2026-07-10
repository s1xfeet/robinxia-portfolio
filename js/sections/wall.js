// Work wall: renders the marquee rows from wall-data.js, maps hero scroll
// progress onto --wall-p, and flips the wall interactive once it is front.
// Marquee motion and its reduced-motion stop live in CSS; this feeds state.
//
// v2: tiles with a clip render a live, muted, looping BACKGROUND <video>.
// Playback is lazy (data-src + preload="none") and gated so off-screen or
// mobile / reduced-motion / save-data tiles never download or decode video.

import { WALL_ROWS } from "./wall-data.js";

function buildTile(item) {
  const tile = document.createElement("a");
  const base = item.kind === "tall" ? "tile tile--tall" : "tile tile--wide";
  const hasVideo = Boolean(item.src);
  tile.className = hasVideo ? `${base} has-video` : base;
  tile.setAttribute("aria-label", `${item.client}, ${item.label}`);
  if (item.href) {
    tile.setAttribute("href", item.href);
    if (!item.href.startsWith("#")) {
      tile.setAttribute("target", "_blank");
      tile.setAttribute("rel", "noopener");
    }
  } else {
    tile.setAttribute("data-pending", "");
  }

  // Live-clip tiles: video (behind) + scrim (over video, under text).
  // The clip URL lives on data-src so nothing loads until playback is enabled
  // and the tile scrolls near the viewport; preload="none" keeps it lazy.
  if (hasVideo) {
    const video = document.createElement("video");
    video.className = "tile__video";
    if (item.poster) video.setAttribute("poster", item.poster);
    // muted + loop + playsinline are required for autoplay to be allowed.
    video.setAttribute("muted", "");
    video.muted = true; // property form is the one browsers trust for autoplay
    video.setAttribute("loop", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("preload", "none");
    video.setAttribute("tabindex", "-1");
    video.setAttribute("aria-hidden", "true");
    video.setAttribute("disablepictureinpicture", "");
    video.dataset.src = item.src; // lazy: promoted to video.src on first play

    const scrim = document.createElement("span");
    scrim.className = "tile__scrim";
    scrim.setAttribute("aria-hidden", "true");

    tile.append(video, scrim);
  }

  const client = document.createElement("span");
  client.className = "tile__client";
  client.textContent = item.client;

  const label = document.createElement("span");
  label.className = "tile__label";
  label.textContent = item.label;

  tile.append(client, label);
  return tile;
}

// Owns every .tile__video: decides when playback is allowed and lazily loads /
// plays only the clips that are near the viewport. Hero on/off-screen state is
// pushed in from the outside via setHeroOnScreen().
function createVideoController(wall) {
  const videos = Array.from(wall.querySelectorAll(".tile__video"));

  const mqWide = window.matchMedia("(min-width: 701px)");
  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Playback is allowed only on wider viewports, without a reduced-motion
  // request, and without a save-data hint. Otherwise videos stay on posters
  // and never load or play.
  const computeEnabled = () =>
    mqWide.matches &&
    !mqReduce.matches &&
    !(navigator.connection && navigator.connection.saveData);

  let enabled = computeEnabled();
  let heroOnScreen = true;
  const visible = new Set(); // videos currently intersecting (near) the viewport

  const canPlay = () => enabled && heroOnScreen;

  const play = (video) => {
    if (!canPlay()) return;
    if (!video.src && video.dataset.src) {
      video.src = video.dataset.src; // first-play lazy load
    }
    const started = video.play();
    // Autoplay can be rejected (policy, not-yet-ready); swallow it, no crash.
    if (started && typeof started.catch === "function") started.catch(() => {});
  };

  const pauseAll = () => {
    for (const video of videos) video.pause();
  };

  // Re-sync playback to current state: resume the visible clips when allowed,
  // otherwise stop everything. Called on enable/disable and hero on/off-screen.
  const refresh = () => {
    if (canPlay()) {
      for (const video of visible) play(video);
    } else {
      pauseAll();
    }
  };

  // Per-video observer against the viewport, with a 200px margin so clips warm
  // up just before they scroll in. Missing IntersectionObserver -> videos stay
  // paused on their posters (graceful, never crash).
  let observer = null;
  if ("IntersectionObserver" in window && videos.length) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target;
          if (entry.isIntersecting) {
            visible.add(video);
            play(video);
          } else {
            visible.delete(video);
            video.pause();
          }
        }
      },
      { root: null, rootMargin: "200px 0px", threshold: 0 }
    );
    for (const video of videos) observer.observe(video);
  }

  const onEnabledChange = () => {
    enabled = computeEnabled();
    refresh();
  };

  // Re-evaluate the enable gate on matchMedia flips and on resize / save-data.
  if (typeof mqWide.addEventListener === "function") {
    mqWide.addEventListener("change", onEnabledChange);
    mqReduce.addEventListener("change", onEnabledChange);
  } else if (typeof mqWide.addListener === "function") {
    // Legacy Safari MediaQueryList.
    mqWide.addListener(onEnabledChange);
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
    setHeroOnScreen(value) {
      if (heroOnScreen === value) return;
      heroOnScreen = value;
      refresh();
    },
    destroy() {
      if (observer) observer.disconnect();
      if (typeof mqWide.removeEventListener === "function") {
        mqWide.removeEventListener("change", onEnabledChange);
        mqReduce.removeEventListener("change", onEnabledChange);
      } else if (typeof mqWide.removeListener === "function") {
        mqWide.removeListener(onEnabledChange);
        mqReduce.removeListener(onEnabledChange);
      }
      window.removeEventListener("resize", onEnabledChange);
      if (
        navigator.connection &&
        typeof navigator.connection.removeEventListener === "function"
      ) {
        navigator.connection.removeEventListener("change", onEnabledChange);
      }
      pauseAll();
    },
  };
}

// Drives each row's marquee via transform (replacing the CSS animation) so rows
// can be dragged/scrubbed, while auto-scroll continues at the old speed. Adds
// .js-scroll to hand off from CSS. A drag past a few px swallows the following
// click so the lightbox doesn't open. Returns { destroy } for rebuild teardown.
function createMarquee(tracks, wall) {
  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const rows = Array.from(tracks).map((track) => {
    const rowEl = track.closest(".wall-row");
    const groupWidth = track.scrollWidth / 2 || 1;
    const durSec = parseFloat(track.style.getPropertyValue("--row-dur")) || 80;
    return {
      track,
      rowEl,
      groupWidth,
      dir: rowEl && rowEl.classList.contains("wall-row--rev") ? 1 : -1,
      speed: groupWidth / durSec, // px/sec, matches the old CSS animation
      offset: 0,
      hover: false,
      dragging: false,
    };
  });

  wall.classList.add("js-scroll");

  const wrap = (r) => {
    while (r.offset <= -r.groupWidth) r.offset += r.groupWidth;
    while (r.offset > 0) r.offset -= r.groupWidth;
  };
  const apply = (r) => {
    r.track.style.transform = `translateX(${r.offset.toFixed(2)}px)`;
  };
  rows.forEach(apply);

  let last = 0;
  let rafId = requestAnimationFrame(function frame(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    const paused = wall.classList.contains("is-offscreen") || mqReduce.matches;
    for (const r of rows) {
      if (paused || r.hover || r.dragging) continue;
      r.offset += r.dir * r.speed * dt;
      wrap(r);
      apply(r);
    }
    rafId = requestAnimationFrame(frame);
  });

  // Hover pause (desktop) so a tile can be read — mirrors the old CSS behaviour.
  const hoverHandlers = rows.map((r) => {
    const enter = () => {
      r.hover = true;
    };
    const leave = () => {
      r.hover = false;
    };
    r.rowEl.addEventListener("pointerenter", enter);
    r.rowEl.addEventListener("pointerleave", leave);
    return { r, enter, leave };
  });

  // Drag to scroll — grab a row and scrub it. A plain click must still reach the
  // tile so the lightbox / link fires, so we deliberately do NOT capture the
  // pointer or mark the row "dragging" on pointerdown: capturing on press
  // retargets the click that follows to the wall (where closest("a.tile") is
  // null), which silently eats every tile click. Instead a press stays "pending"
  // until the pointer actually travels past DRAG_THRESHOLD, and only then is it
  // promoted to a real drag (capture + scrub + swallow the trailing click).
  const DRAG_THRESHOLD = 6; // px of travel before a press becomes a drag
  let pending = null; // row pressed but not yet dragging
  let active = null; // row currently being dragged
  let startX = 0;
  let startOffset = 0;
  let pid = null;
  let didDrag = false;

  const onDown = (e) => {
    if (e.button != null && e.button > 0) return; // primary / touch only
    const rowEl = e.target.closest(".wall-row");
    const row = rows.find((r) => r.rowEl === rowEl) || null;
    if (!row) return;
    pending = row;
    startX = e.clientX;
    startOffset = row.offset;
    pid = e.pointerId;
    didDrag = false;
  };
  const onMove = (e) => {
    if (e.pointerId !== pid || (!pending && !active)) return;
    if (!active) {
      // Still a potential click until the pointer clears the threshold.
      if (Math.abs(e.clientX - startX) <= DRAG_THRESHOLD) return;
      // Promote to a real drag. Capture the pointer now (not on press) and
      // re-baseline against the live offset so auto-scroll drift between the
      // press and this first move doesn't make the row jump.
      active = pending;
      active.dragging = true;
      active.rowEl.classList.add("is-grabbing");
      startX = e.clientX;
      startOffset = active.offset;
      didDrag = true;
      try {
        wall.setPointerCapture(pid);
      } catch (_) {}
    }
    active.offset = startOffset + (e.clientX - startX);
    wrap(active);
    apply(active);
  };
  const onUp = () => {
    if (active) {
      active.dragging = false;
      active.rowEl.classList.remove("is-grabbing");
      try {
        wall.releasePointerCapture(pid);
      } catch (_) {}
    }
    const dragged = didDrag;
    active = null;
    pending = null;
    pid = null;
    if (dragged) {
      // Swallow the click that follows a real drag so the lightbox stays shut.
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
    }
  };
  const onDragStart = (e) => e.preventDefault(); // kill native link drag ghost

  wall.addEventListener("pointerdown", onDown);
  wall.addEventListener("pointermove", onMove);
  wall.addEventListener("pointerup", onUp);
  wall.addEventListener("pointercancel", onUp);
  wall.addEventListener("dragstart", onDragStart);

  return {
    destroy() {
      cancelAnimationFrame(rafId);
      hoverHandlers.forEach(({ r, enter, leave }) => {
        r.rowEl.removeEventListener("pointerenter", enter);
        r.rowEl.removeEventListener("pointerleave", leave);
      });
      wall.removeEventListener("pointerdown", onDown);
      wall.removeEventListener("pointermove", onMove);
      wall.removeEventListener("pointerup", onUp);
      wall.removeEventListener("pointercancel", onUp);
      wall.removeEventListener("dragstart", onDragStart);
      wall.classList.remove("js-scroll");
    },
  };
}

export function initWall() {
  const hero = document.querySelector(".section--hero");
  const wall = document.getElementById("wall");
  if (!hero || !wall) return;

  const tracks = wall.querySelectorAll(".wall-track");
  if (tracks.length < WALL_ROWS.length) return;

  let videoController = null;
  let marquee = null;

  const buildWall = () => {
    if (videoController) videoController.destroy();
    if (marquee) marquee.destroy();
    // One "group" of a row must be at least as wide as the viewport, or the CSS
    // translateX(-50%) loop shows a gap. Narrow rows (all-vertical Shorts) don't
    // reach that on wide screens, so repeat the item set until they do, then
    // clone the whole group once for the seamless loop.
    const fillWidth = (window.innerWidth || 1440) * 1.15;
    WALL_ROWS.forEach((row, index) => {
      const track = tracks[index];
      track.replaceChildren();
      track.style.setProperty("--row-dur", row.speed + "s");

      const group = [];
      let pass = 0;
      const MAX_PASSES = 12;
      do {
        row.items.forEach((item) => {
          const tile = buildTile(item);
          if (pass > 0) {
            // Repeats are decorative — keep one instance in the a11y tree.
            tile.setAttribute("aria-hidden", "true");
            tile.setAttribute("tabindex", "-1");
          }
          track.appendChild(tile);
          group.push(tile);
        });
        pass += 1;
        if (track.scrollWidth === 0) break; // not laid out yet; don't over-build
      } while (track.scrollWidth < fillWidth && pass < MAX_PASSES);

      group.forEach((tile) => {
        const copy = tile.cloneNode(true);
        copy.setAttribute("aria-hidden", "true");
        copy.setAttribute("tabindex", "-1");
        const clonedVideo = copy.querySelector(".tile__video");
        if (clonedVideo) clonedVideo.muted = true; // muted property is lost on clone
        track.appendChild(copy);
      });
    });

    // Video playback controller manages every .tile__video (originals + copies).
    videoController = createVideoController(wall);
    videoController.setHeroOnScreen(!wall.classList.contains("is-offscreen"));
    // Marquee drives the transform (replaces the CSS animation) + drag-to-scroll.
    marquee = createMarquee(tracks, wall);
  };

  buildWall();

  // A width change — or the wall finally getting a real size after loading in a
  // background/hidden tab — can turn a full row into a gapped one. Rebuild then.
  let lastBuildWidth = window.innerWidth;
  let rebuildTimer = 0;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        if (window.innerWidth === lastBuildWidth) return;
        lastBuildWidth = window.innerWidth;
        buildWall();
      }, 250);
    },
    { passive: true }
  );

  let ticking = false;
  let live = false;

  const update = () => {
    ticking = false;
    const runway = hero.offsetHeight - window.innerHeight;
    const p = runway > 0 ? Math.min(1, Math.max(0, window.scrollY / runway)) : 0;
    hero.style.setProperty("--wall-p", p.toFixed(4));
    if (!live && p >= 0.6) {
      live = true;
      wall.removeAttribute("inert");
      wall.classList.add("is-live");
    } else if (live && p <= 0.5) {
      live = false;
      wall.setAttribute("inert", "");
      wall.classList.remove("is-live");
    }
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        wall.classList.toggle("is-offscreen", !entry.isIntersecting);
        // Off-screen hero -> pause all clips; back on-screen -> resume visible.
        videoController.setHeroOnScreen(entry.isIntersecting);
      }
    });
    observer.observe(hero);
  }
}
