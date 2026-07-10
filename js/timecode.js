// Timecode scrubber: maps scroll progress onto a 2-minute, 24fps timecode
// and scales the #tc-bar. rAF-throttled; transform/text updates only.

const FPS = 24;
const TOTAL_FRAMES = 120 * FPS; // 00:02:00:00

function toTimecode(frame) {
  const ff = frame % FPS;
  const totalSeconds = Math.floor(frame / FPS);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

export function initTimecode() {
  const bar = document.getElementById("tc-bar");
  const readout = document.getElementById("tc-readout");
  if (!bar && !readout) return;

  let ticking = false;

  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (bar) bar.style.transform = `scaleX(${progress})`;
    if (readout) {
      readout.textContent = `TC ${toTimecode(Math.round(progress * TOTAL_FRAMES))}`;
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
}
