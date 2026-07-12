// Presence details: the tab "pauses" when you leave it, and the console
// gets a slate. Small signals that someone lives here.

export function initExtras() {
  const baseTitle = document.title;
  document.addEventListener("visibilitychange", () => {
    document.title = document.hidden ? "⏸ Paused — Robin Xia" : baseTitle;
  });

  try {
    console.log(
      "%c RX %c Made to be watched. %c robinxia706@gmail.com",
      "background:oklch(58% 0.22 27);color:#fff;font-weight:700;padding:2px 7px;",
      "color:oklch(93% 0.006 85);padding:2px 4px;",
      "color:oklch(80% 0.13 80);"
    );
  } catch (_) {
    /* consoles that reject %c styling: not worth crashing over */
  }
}
