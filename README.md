# Robin Xia — Portfolio

A one-page, cinematic-dark portfolio for a video editor, writer, producer, and
motion designer. Vanilla HTML, CSS, and JavaScript — no build step and no
runtime dependencies. Fonts are self-hosted (Bebas Neue + Inter, SIL OFL).

## Run locally

Any static file server works:

```bash
python3 -m http.server 4173
# → http://localhost:4173
```

## Structure

```
index.html            # the whole page
styles/
  tokens.css          # design tokens (palette, type, spacing)
  fonts.css           # @font-face (self-hosted woff2)
  base.css            # reset, header/footer, utilities
  atmosphere.css      # grain, section slates, frames, scroll reveals
  sections/*.css      # one stylesheet per section
js/
  main.js             # entry point
  reveal.js           # IntersectionObserver scroll reveals
  timecode.js         # scroll-driven timecode readout
  nav.js              # active-section nav spy
  lightbox.js         # in-page video lightbox
  section-focus.js    # current-section focus
  sections/           # per-section behavior + work-wall data/render
assets/
  fonts/              # self-hosted woff2
  wall/  bg/          # video clips + posters
```

## Deploy

Static-host anywhere (Cloudflare Pages, Netlify, GitHub Pages, Vercel). There is
no build command — serve the repository root as-is.

## Analytics

The site tracks its own first-party, cookieless analytics via a Cloudflare
Worker (`worker.js`, `wrangler.jsonc`) — no third-party service involved.
Collection works out of the box once deployed; viewing the `/stats` dashboard
needs a short one-time setup. See [ANALYTICS.md](./ANALYTICS.md) for what's
tracked and how to configure it.
