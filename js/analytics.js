// First-party analytics: fire-and-forget event tracking, no cookies, zero
// dependencies. Respects Do Not Track / Global Privacy Control by no-op'ing
// entirely. Events are queued and flushed via sendBeacon (fetch keepalive as
// fallback) to POST /api/track as a JSON array. The endpoint may not exist
// (local dev server) — every send is wrapped so a network failure can never
// affect the page, and initAnalytics() itself never throws outward.

const ENDPOINT = "/api/track";
const MAX_BATCH = 20;
const SESSION_KEY = "rx_sid";

const clip = (value, max) => String(value).slice(0, max);

function sessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch (_) {
    return "nosess00";
  }
}

function deviceType() {
  const w = window.innerWidth;
  if (w >= 1024) return "desktop";
  if (w >= 640) return "tablet";
  return "mobile";
}

function referrerHost() {
  try {
    return document.referrer ? new URL(document.referrer).hostname : "";
  } catch (_) {
    return "";
  }
}

// sendBeacon is preferred (survives unload); fetch+keepalive is the fallback
// for browsers/contexts where sendBeacon is unavailable or rejects the send.
function send(events) {
  if (!events.length) return;
  const body = JSON.stringify(events.slice(0, MAX_BATCH));
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
  } catch (_) {}
  try {
    fetch(ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  } catch (_) {}
}

export function initAnalytics() {
  try {
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return;

    const sid = sessionId();
    let queue = [];
    let flushTimer = 0;

    // Same-tick track() calls coalesce into one request via a 0ms debounce.
    const flush = () => {
      flushTimer = 0;
      const batch = queue;
      queue = [];
      send(batch);
    };
    const enqueue = (evt) => {
      queue.push(evt);
      if (!flushTimer) flushTimer = setTimeout(flush, 0);
    };
    const track = (name, label, value, extra) => {
      const evt = {
        e: name,
        p: location.pathname + location.hash,
        s: sid,
        d: deviceType(),
      };
      if (label !== undefined) evt.l = clip(label, 128);
      if (value !== undefined) evt.v = value;
      if (extra) Object.assign(evt, extra);
      enqueue(evt);
    };

    // 1. Pageview, once on load.
    const refHost = referrerHost();
    track("pageview", refHost, undefined, { r: refHost });

    // 2. Section views, fired once per section. A section counts as viewed
    // when EITHER half the section is visible (intersectionRatio >= 0.5) OR
    // the section fills at least half the viewport. The second condition is
    // what catches sections taller than 2x the viewport (hero, work), which
    // can never reach 50% of their OWN height visible; the lower thresholds
    // exist so those sections still get callbacks to evaluate it on.
    const sections = document.querySelectorAll("main > section[id]");
    if ("IntersectionObserver" in window && sections.length) {
      const seen = new Set();
      const sectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting || seen.has(entry.target.id)) continue;
            const viewed =
              entry.intersectionRatio >= 0.5 ||
              entry.intersectionRect.height >= window.innerHeight * 0.5;
            if (!viewed) continue;
            seen.add(entry.target.id);
            track("section_view", entry.target.id);
            sectionObserver.unobserve(entry.target);
          }
        },
        { threshold: [0.15, 0.3, 0.5] }
      );
      sections.forEach((section) => sectionObserver.observe(section));
    }

    // 3-7. One delegated capture-phase click listener covers every link type
    // so we never interfere with existing handlers (wall drag, lightbox,
    // preventDefault). Each click is classified once, most-specific first, so
    // a wall tile that also opens the lightbox only ever fires wall_click.
    document.addEventListener(
      "click",
      (event) => {
        const link = event.target.closest && event.target.closest("a");
        if (!link) return;
        const href = link.getAttribute("href") || "";

        if (href.startsWith("mailto:")) {
          track("email_click", "contact");
          return;
        }

        const wallTile = link.classList.contains("tile") && link.closest("#wall");
        if (wallTile) {
          track("wall_click", link.getAttribute("aria-label") || link.textContent.trim());
          return;
        }

        // Lightbox triggers outside the wall (reel takes, NK shorts, the
        // testimonial reference) — the wall's own triggers are handled above.
        if (link.hasAttribute("data-lightbox")) {
          const title = link.querySelector(".reel-item__title");
          const label = (title && title.textContent) || link.getAttribute("aria-label") || link.textContent.trim();
          track("lightbox_open", label);
          return;
        }

        if (link.closest(".site-nav")) {
          track("nav_click", href);
          return;
        }

        if (/^https?:\/\//i.test(href)) {
          try {
            const url = new URL(href, location.href);
            if (url.host !== location.host) {
              track("outbound", clip(url.hostname + url.pathname, 128));
            }
          } catch (_) {}
        }
      },
      { capture: true }
    );

    // 8-9. Scroll depth + engaged time, sent once on pagehide (or the
    // visibilitychange->hidden fallback, whichever fires first).
    let maxScrollPct = 0;
    let scrollTicking = false;
    const measureScroll = () => {
      scrollTicking = false;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      maxScrollPct = Math.max(maxScrollPct, Math.min(100, Math.max(0, pct)));
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!scrollTicking) {
          scrollTicking = true;
          requestAnimationFrame(measureScroll);
        }
      },
      { passive: true }
    );

    let engagedMs = 0;
    let visibleSince = document.visibilityState === "visible" ? performance.now() : null;
    const accrue = () => {
      if (visibleSince !== null) {
        engagedMs += performance.now() - visibleSince;
        visibleSince = null;
      }
    };

    let finalSent = false;
    const sendFinal = () => {
      if (finalSent) return;
      finalSent = true;
      accrue();
      const depth = Math.round(maxScrollPct / 10) * 10;
      const seconds = Math.min(1800, Math.round(engagedMs / 1000));
      track("scroll_depth", undefined, depth);
      track("time_on_page", undefined, seconds);
      clearTimeout(flushTimer);
      flush();
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        visibleSince = performance.now();
      } else {
        accrue();
        sendFinal();
      }
    });
    window.addEventListener("pagehide", sendFinal);
  } catch (_) {
    // Analytics must never break the site.
  }
}
