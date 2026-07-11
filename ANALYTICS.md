# Analytics — setup & usage

This site tracks visits itself — no Google Analytics, no cookies, nothing
shared with a third party. It's built on Cloudflare Workers, which is already
hosting the site, and stores events in Cloudflare D1 (their managed SQLite).

Data collection works the moment this is deployed — there's nothing to set up
for that part, and the database table auto-creates itself on the very first
event. The dashboard that lets you *view* the numbers needs exactly one
secret (see below).

## What gets tracked

A small script on the site (`js/analytics.js`, built separately from this
worker) reports a handful of anonymous events as people browse:

- `pageview` — someone loaded the page
- `section_view` — which section of the page they scrolled to
- `wall_click` — a click on a video wall tile
- `outbound` — a click on a link that leaves the site (LinkedIn, IMDb, etc.)
- `scroll_depth` — how far down the page someone got

Each event carries: the event name, an optional label (e.g. which wall tile),
the page path, a short random session id (resets each visit — it is not a
persistent identifier), the device type (desktop/tablet/mobile), and the
referring site. Cloudflare also attaches the visitor's country automatically.
No IP address, name, email, or any other personal information is stored.

This is cookieless and first-party — it only talks to your own domain. If a
visitor's browser sends the "Do Not Track" signal, the tracker script
respects it and skips sending events (see the tracker's own logic in
`js/analytics.js`).

## Before your first deploy after this change

Open `wrangler.jsonc` at the repo root and check the `"name"` field:

```jsonc
"name": "robinxia-portfolio",
```

This matches the Worker that serves `portfolio.relatedshortschanger.com` via
Workers Builds from GitHub (verified against the Cloudflare dashboard on
2026-07-10). If you ever rename the Worker in the dashboard, update this
value to match — a mismatch would make the next `git push` deploy a brand-new
Worker instead of updating the live one, and your domain would keep pointing
at the old one.

## Storage: Cloudflare D1

Events are stored in a D1 database (Cloudflare's managed SQLite), bound as
`env.DB`:

| Setting | Value |
|---|---|
| Database name | `portfolio-analytics` |
| Database ID | `5623cc1f-c6de-4bdb-9739-99a401026d54` |
| Binding | `DB` (see `wrangler.jsonc`) |

The `events` table and its indexes are created lazily by the Worker itself —
the first `POST /api/track` request against a fresh database runs the schema
DDL once per isolate, then retries the insert. There is no migration command
to run and nothing to provision by hand beyond the database existing (it
already does).

### Free tier limits

Cloudflare D1's free tier includes roughly:

- 5 GB of storage
- 5,000,000 row reads / day
- 100,000 row writes / day

A portfolio site's traffic is nowhere near these limits — each visit writes a
handful of rows (one insert per event, batched per request), so you'd need
tens of thousands of visits a day before writes became a concern. There is no
time-based data retention window — rows are kept indefinitely (subject to the
storage cap above), unlike the previous Analytics Engine setup which aged out
data after ~90 days.

## One-time setup: viewing the stats dashboard

Collection happens automatically once deployed. To actually *look* at the
numbers, you visit a private page at `/stats` — it needs exactly one secret:
`STATS_KEY`.

In the Cloudflare dashboard: **Workers & Pages** → click the
`robinxia-portfolio` worker → **Settings** → **Variables and Secrets** →
**Add**:

| Name | Value |
|---|---|
| `STATS_KEY` | any long random string you make up yourself |

`STATS_KEY` is effectively the password for your dashboard — pick something
long and hard to guess (a password manager's "generate password" button
works well). Nobody else needs to know it. This is the *only* secret the
Worker needs now — there's no API token or account ID to create or manage.

### Open the dashboard

Once the secret is saved (Cloudflare redeploys automatically), visit:

```
https://portfolio.relatedshortschanger.com/stats
```

You'll land on a plain password box — enter your `STATS_KEY` once. On
success the Worker sets a secure, `HttpOnly` cookie (`rx_stats`) and keeps
you signed in for 30 days, so you won't need to re-enter it on every visit.
The key itself is never placed in the URL — it never lands in your browser
history, in a bookmark, or in Cloudflare's request logs, which is the whole
point of this flow (the old `?key=...` query-parameter link no longer works
at all; it now just shows the password box like any other unauthenticated
visit).

Once signed in you'll see totals by event type, top video-wall clicks, top
outbound link clicks, section views, scroll depth, daily pageviews, devices,
top countries, and top referrers. Use the `1d`/`7d`/`30d`/`90d` links at the
top of the page to change the time window (any integer from 1 to 365 works
via the URL, e.g. `?days=180`) — no key is needed for these once you're
signed in.

To sign out (e.g. on a shared machine), click **Sign out** in the dashboard
footer, or visit `/stats/logout` directly — this clears the cookie.

If you forget your `STATS_KEY`, get the password wrong, or haven't signed in
yet, `/stats` just shows the plain password box (HTTP 401) — no title, no
hint about what it protects, nothing that would advertise the dashboard's
existence to random visitors or bots.

## Local development

Running the site locally with `python3 dev-server.py` serves static files
only — there is no `/api/track` endpoint in that simple server, so the
tracker's requests will just silently fail (by design; it never surfaces
errors to visitors). That's fine for everyday local editing.

If you want to test the analytics collection or the `/stats` dashboard
locally, run the real Worker instead:

```bash
npx wrangler dev
```

This runs `worker.js` with the same routing it has in production, including
`/api/track` and `/stats`. `wrangler dev` automatically spins up a local
SQLite-backed D1 database for the `DB` binding — you don't need any Cloudflare
credentials or network access, and the schema creates itself on the first
event just like in production. Local writes never touch the real
`portfolio-analytics` database; local and production data are entirely
separate.

You'll need a local `.dev.vars` file (already ignored by git and by asset
upload) with `STATS_KEY=something` if you want to test the dashboard locally.
The repo's `.dev.vars` already has `STATS_KEY=localtest` set up for this.
Open `http://localhost:8787/stats` and enter `localtest` in the password box
— note the auth cookie only gets the `Secure` attribute over https, so it
still works fine over plain `http://localhost` in dev.
