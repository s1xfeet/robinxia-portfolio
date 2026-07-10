import { initReveal } from "./reveal.js";
import { initTimecode } from "./timecode.js";
import { initNav } from "./nav.js";
import { initSectionFocus } from "./section-focus.js";

initReveal();
initTimecode();
initNav();
initSectionFocus();

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
