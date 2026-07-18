// Click-to-copy for the contact email. Mailto silently does nothing for
// webmail users, so this gives them a working fallback: Clipboard API first,
// a hidden-textarea execCommand fallback for older browsers, and if both
// fail the mailto link is still there, so we just fail silently.

const EMAIL = "robinxia706@gmail.com";
const DEFAULT_LABEL = "Copy address";
const COPIED_LABEL = "Copied ✓";
const RESET_DELAY_MS = 2000;

function legacyCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

async function copyEmail() {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(EMAIL);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  return legacyCopy(EMAIL);
}

export function initContact() {
  const button = document.getElementById("contact-copy");
  if (!button) return;
  const status = document.getElementById("contact-copy-status");

  let resetTimer = null;

  button.addEventListener("click", async () => {
    const ok = await copyEmail();
    if (!ok) return; // mailto link remains the fallback path

    clearTimeout(resetTimer);
    button.classList.add("is-copied");
    if (status) status.textContent = COPIED_LABEL;
    resetTimer = setTimeout(() => {
      button.classList.remove("is-copied");
      if (status) status.textContent = DEFAULT_LABEL;
    }, RESET_DELAY_MS);
  });
}
