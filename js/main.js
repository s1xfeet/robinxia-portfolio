import { initTypeMasks, initScramble } from "./motion/type.js";
import { initReveal } from "./reveal.js";
import { initTimecode } from "./timecode.js";
import { initNav } from "./nav.js";
import { initMobileNav } from "./mobile-nav.js";
import { initSectionFocus } from "./section-focus.js";
import { initSmoothScroll } from "./smooth-scroll.js";

initTypeMasks(); // before initReveal: slate titles become masked rises
initReveal();
initScramble();
initTimecode();
initNav();
initMobileNav();
initSectionFocus();
// After initNav/initMobileNav so their document-level click listeners (which
// only close menus, never preventDefault) register before this one's.
initSmoothScroll();

// Section modules are optional enhancements; never let one kill the page.
import("./sections/wall.js")
  .then((mod) => mod.initWall?.())
  .catch(() => {});
import("./sections/work.js")
  .then((mod) => mod.initWork?.())
  .catch(() => {});
import("./sections/work-nk-bg.js")
  .then((mod) => mod.initWorkNkBg?.())
  .catch(() => {});
import("./lightbox.js")
  .then((mod) => mod.initLightbox?.())
  .catch(() => {});
import("./sections/writing-bg.js")
  .then((mod) => mod.initWritingBg?.())
  .catch(() => {});
import("./sections/builds.js")
  .then((mod) => mod.initBuilds?.())
  .catch(() => {});
import("./contact.js")
  .then((mod) => mod.initContact?.())
  .catch(() => {});
import("./motion/cursor.js")
  .then((mod) => mod.initCursor?.())
  .catch(() => {});
import("./motion/extras.js")
  .then((mod) => mod.initExtras?.())
  .catch(() => {});
import("./analytics.js")
  .then((mod) => mod.initAnalytics?.())
  .catch(() => {});
