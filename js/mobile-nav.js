// Mobile section nav: under 700px the header hides .site-nav, so this drives
// the full-screen link overlay instead. The trigger button lives in the
// header (outside the overlay) and doubles as the close control; the
// boundary-wrap focus trap mirrors the one in lightbox.js.

export function initMobileNav() {
  const toggle = document.getElementById("menu-toggle");
  const overlay = document.getElementById("mobile-nav");
  if (!toggle || !overlay) return;

  let isOpen = false;
  let hideTimer = 0;

  // queried live so it stays correct if the link list ever changes
  function focusableElements() {
    return [
      toggle,
      ...overlay.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])'),
    ];
  }

  function trapFocus(event) {
    const items = focusableElements();
    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKey(event) {
    if (event.key === "Escape") close({ returnFocus: true });
    if (event.key === "Tab") trapFocus(event);
  }

  function open() {
    isOpen = true;
    clearTimeout(hideTimer);               // reopen during a fade must win
    overlay.classList.remove("is-closing");
    overlay.removeAttribute("inert");
    overlay.removeAttribute("hidden");
    toggle.setAttribute("aria-expanded", "true");
    toggle.textContent = "Close";
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
  }

  function close({ returnFocus = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    // Exit dissolve, mirroring the lightbox (150ms CSS fade, 180ms removal).
    // `hidden` is deferred so the fade can play; inert blocks focus/AT/hits
    // immediately. Everything else stays instant — state must lead pixels.
    overlay.classList.add("is-closing");
    overlay.setAttribute("inert", "");
    hideTimer = window.setTimeout(() => {
      overlay.setAttribute("hidden", "");
      overlay.classList.remove("is-closing");
    }, 180);
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Menu";
    document.documentElement.style.removeProperty("overflow");
    document.removeEventListener("keydown", onKey);
    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => {
    if (isOpen) close({ returnFocus: true });
    else open();
  });

  overlay.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    close(); // then default anchor navigation proceeds (smooth scroll is CSS-driven)
  });

  // Resizing past the mobile breakpoint with the menu open would otherwise
  // leave the overlay dangling under the now-visible .site-nav.
  const mq = window.matchMedia("(max-width: 700px)");
  mq.addEventListener("change", (event) => {
    if (!event.matches && isOpen) close();
  });
}
