# 004 — Lightbox: physical entrance, animated exit

- **Status**: DONE
- **Commit**: f44644e
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files (`styles/base.css`, `js/lightbox.js`), ~35 lines

## Problem

The lightbox enters as a pure fade with no transform — the "comes from nowhere" entrance — and exits with a hard DOM removal, an instant cut from a full-screen dark overlay back to the page:

```css
/* styles/base.css:408-424 — current */
.lightbox {
  ...
  animation: lightbox-fade var(--duration-fast) ease;
}

@keyframes lightbox-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

```js
/* js/lightbox.js:59-67 — current */
function close() {
  if (!overlay) return;
  overlay.remove(); // dropping the iframe stops playback
  overlay = null;
  ...
}
```

## Target

- **Enter**: overlay keeps its 180ms fade; the player frame additionally settles from `scale(0.97)` + reduced opacity over 240ms `var(--ease-out-expo)`. Centered origin is correct — modals are exempt from trigger-origin.
- **Exit**: overlay fades out over 150ms, then is removed. Playback is killed at the *start* of the fade (silent exit). Exit is faster than enter — system response snaps.
- Reduced motion: both entrance and exit are instant (current behavior preserved).

## Repo conventions to follow

- Tokens: `var(--duration-fast)` = 180ms, `var(--ease-out-expo)` (`styles/tokens.css:45,47`).
- The reduced-motion kill for the lightbox already lives at `styles/base.css:474-478` — extend that block, don't create a new one.

## Steps

1. **`styles/base.css:408-424`** — add an opacity transition to `.lightbox`, an `is-closing` state, and the frame entrance. Result:

   ```css
   .lightbox {
     position: fixed;
     inset: 0;
     z-index: 1100;
     display: grid;
     place-items: center;
     padding: clamp(1rem, 4vw, 3rem);
     background: oklch(4% 0.005 270 / 0.88);
     backdrop-filter: blur(6px);
     -webkit-backdrop-filter: blur(6px);
     animation: lightbox-fade var(--duration-fast) ease;
     transition: opacity 150ms ease;
   }

   /* exit rides a transition (JS adds the class, removes the node after) */
   .lightbox.is-closing {
     opacity: 0;
     pointer-events: none;
   }

   @keyframes lightbox-fade {
     from { opacity: 0; }
     to { opacity: 1; }
   }

   /* the player lands physically: a 3% settle instead of appearing from
      nowhere; centered origin is correct for a modal */
   .lightbox__frame {
     animation: lightbox-frame-in 240ms var(--ease-out-expo) backwards;
   }

   @keyframes lightbox-frame-in {
     from {
       opacity: 0;
       transform: scale(0.97);
     }
   }
   ```

   (`.lightbox__frame` already has other declarations at `styles/base.css:426-433` — add the `animation` line to that existing rule instead of duplicating the block, and put the keyframes after it.)

2. **`styles/base.css:474-478`** — extend the reduced-motion block:

   ```css
   @media (prefers-reduced-motion: reduce) {
     .lightbox {
       animation: none;
       transition: none;
     }

     .lightbox__frame {
       animation: none;
     }
   }
   ```

3. **`js/lightbox.js:59-67`** — replace `close()`:

   ```js
   function close() {
     if (!overlay) return;
     const el = overlay;
     overlay = null;
     document.removeEventListener("keydown", onKey);
     document.documentElement.style.removeProperty("overflow");
     // kill playback at the start of the fade — the exit must be silent
     const iframe = el.querySelector("iframe");
     if (iframe) iframe.removeAttribute("src");
     el.classList.add("is-closing");
     window.setTimeout(() => el.remove(), 180);
     if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
     lastFocus = null;
   }
   ```

   (Under reduced motion the transition is `none`, so the overlay vanishes instantly and the delayed `remove()` is unobservable — one code path, no branch.)

## Boundaries

- Do NOT touch `open()`, the focus trap, or the click/keydown wiring.
- Do NOT animate the iframe itself or add motion to `.lightbox__close`.
- Do NOT exceed the stated durations (enter ≤ 240ms, exit 150ms).
- If the cited code doesn't match (drift since f44644e), STOP and report.

## Verification

- **Mechanical**: no console errors opening/closing via tile click, ✕ button, backdrop click, and Escape.
- **Feel check**:
  - Open a wall tile: the dark overlay fades in while the player settles from a hair small — DevTools Animations panel at 25% speed: the frame never starts at full size, never overshoots.
  - Close via Escape: audio stops immediately, the overlay fades ~150ms, no hard cut. Exit reads faster than enter.
  - Spam open → Escape → open quickly: no stacked overlays, no dead click layer (the closing overlay has `pointer-events: none`).
- **Reduced motion**: toggle it — open and close are both instant, playback still stops immediately.
- **Done when**: enter has transform + fade, exit fades before removal, silent exit confirmed, RM instant.
