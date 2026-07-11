/**
 * Cloudflare Worker — static asset passthrough + first-party analytics.
 *
 * Routes:
 *   POST /api/track    — collect events into D1 (binding: DB, table `events`)
 *   GET  /stats         — private dashboard, gated by a signed `rx_stats`
 *                          cookie; shows a password page (401) when absent
 *   POST /stats         — password-page login submit; sets the cookie
 *   GET  /stats/logout  — clears the cookie
 *   *    everything else — serve the static site via env.ASSETS
 *
 * The `events` table auto-creates itself (lazily, on first write) — no manual
 * migration step. STATS_KEY is the only secret this Worker needs.
 *
 * No dependencies. Keep this file boring and small.
 */

const MAX_EVENTS_PER_REQUEST = 20;
const EVENT_NAME_RE = /^[a-z0-9_]+$/;
const STRING_FIELD_MAX = 128; // characters
const STRING_FIELD_MAX_BYTES = 256; // UTF-8 bytes (multi-byte chars can be 4 bytes each)
const EVENT_NAME_MAX = 32;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/track") {
      return handleTrack(request, env);
    }
    if (url.pathname === "/stats/logout") {
      return handleStatsLogout(request);
    }
    if (url.pathname === "/stats") {
      if (request.method === "POST") {
        return handleStatsLogin(request, env);
      }
      return handleStats(request, url, env);
    }

    if (!env.ASSETS) {
      return new Response("Static assets binding is not configured.", { status: 500 });
    }
    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------------------
// D1 schema (lazy init)
// ---------------------------------------------------------------------------

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    event TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    session TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    referrer TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    value REAL NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_events_event_ts ON events(event, ts)`,
];

// Cached per-isolate so repeated requests don't re-run the DDL. Reset to
// null on failure so a transient error doesn't wedge the isolate forever.
let schemaPromise = null;

function ensureSchema(env) {
  if (!schemaPromise) {
    schemaPromise = env.DB.batch(SCHEMA_STATEMENTS.map((sql) => env.DB.prepare(sql))).catch(
      (err) => {
        schemaPromise = null;
        throw err;
      }
    );
  }
  return schemaPromise;
}

function isMissingTableError(err) {
  const msg = String((err && err.message) || err || "");
  return msg.includes("no such table");
}

// ---------------------------------------------------------------------------
// /api/track
// ---------------------------------------------------------------------------

async function handleTrack(request, env) {
  // Always 204. Never give a tracker/bot signal about whether it worked.
  try {
    if (request.method !== "POST") {
      return noContent();
    }
    if (!env.DB) {
      return noContent();
    }

    const raw = await request.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return noContent();
    }

    const list = Array.isArray(parsed) ? parsed : [parsed];
    const events = list
      .slice(0, MAX_EVENTS_PER_REQUEST)
      .map(sanitizeEvent)
      .filter(Boolean);
    const country = request.cf?.country || "";

    if (events.length) {
      try {
        await insertEvents(env, events, country);
      } catch {
        // Drop the whole batch on unrecoverable failure; never surface to the tracker.
      }
    }

    return noContent();
  } catch {
    return noContent();
  }
}

/** Insert a validated batch of events with env.DB.batch(). All values are
 *  bound parameters — never interpolated into SQL. On a "no such table"
 *  failure (fresh database), runs the schema DDL once and retries the
 *  insert a single time. */
async function insertEvents(env, events, country) {
  const stmts = events.map((ev) =>
    env.DB
      .prepare(
        `INSERT INTO events (ts, event, label, path, session, device, referrer, country, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        Date.now(),
        ev.e,
        ev.l || "",
        ev.p || "",
        ev.s || "",
        ev.d || "",
        ev.r || "",
        country,
        typeof ev.v === "number" && isFinite(ev.v) ? ev.v : 1
      )
  );

  try {
    await env.DB.batch(stmts);
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
    await ensureSchema(env);
    await env.DB.batch(stmts);
  }
}

function noContent() {
  return new Response(null, { status: 204 });
}

/** Validate + coerce one raw event object. Returns null if it should be dropped. */
function sanitizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;

  const e = raw.e;
  if (typeof e !== "string" || e.length === 0 || e.length > EVENT_NAME_MAX || !EVENT_NAME_RE.test(e)) {
    return null;
  }

  const out = { e };
  for (const key of ["l", "p", "s", "d", "r"]) {
    const val = raw[key];
    if (typeof val === "string" && val.length > 0) {
      out[key] = truncateField(val);
    }
  }
  if (typeof raw.v === "number" && isFinite(raw.v)) {
    out.v = raw.v;
  }
  return out;
}

/** Truncate a string field by characters, then by UTF-8 bytes on a valid
 *  boundary. Keeps rows small and predictable regardless of storage backend. */
function truncateField(s) {
  let sliced = s.slice(0, STRING_FIELD_MAX);
  // The char-level slice can split a surrogate pair (e.g. emoji); drop a
  // trailing lone high surrogate so the string stays well-formed UTF-16.
  if (/[\uD800-\uDBFF]$/.test(sliced)) sliced = sliced.slice(0, -1);
  const bytes = new TextEncoder().encode(sliced);
  if (bytes.length <= STRING_FIELD_MAX_BYTES) return sliced;
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.slice(0, STRING_FIELD_MAX_BYTES)
  );
  // A byte-level cut can land mid-character; drop the trailing replacement char.
  return decoded.replace(/�+$/, "");
}

// ---------------------------------------------------------------------------
// /stats — cookie-based auth
// ---------------------------------------------------------------------------

const STATS_COOKIE_NAME = "rx_stats";
const STATS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

async function handleStats(request, url, env) {
  if (!(await isStatsAuthed(request, env))) {
    return renderPasswordPage({ status: 401 });
  }

  const days = clampDays(url.searchParams.get("days"));
  const html = await renderStatsPage(env, days);
  return new Response(html, {
    status: 200,
    headers: { ...NO_STORE_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Login submit: POST /stats with a urlencoded `k` field. Sets the auth
 *  cookie on success; re-renders the password page (401, no cookie) on
 *  failure. Never echoes the submitted value back into any response. */
async function handleStatsLogin(request, env) {
  let submitted = "";
  try {
    const raw = await request.text();
    submitted = new URLSearchParams(raw).get("k") || "";
  } catch {
    submitted = "";
  }

  if (!env.STATS_KEY || !submitted || !timingSafeEqual(submitted, env.STATS_KEY)) {
    return renderPasswordPage({ status: 401, incorrect: true });
  }

  const token = await statsToken(env.STATS_KEY);
  return new Response(null, {
    status: 302,
    headers: {
      ...NO_STORE_HEADERS,
      Location: "/stats",
      "Set-Cookie": buildStatsCookie(token, {
        maxAge: STATS_COOKIE_MAX_AGE,
        secure: isHttpsRequest(request),
      }),
    },
  });
}

function handleStatsLogout(request) {
  return new Response(null, {
    status: 302,
    headers: {
      ...NO_STORE_HEADERS,
      Location: "/stats",
      "Set-Cookie": buildStatsCookie("", {
        maxAge: 0,
        secure: isHttpsRequest(request),
      }),
    },
  });
}

/** True when the request carries a valid `rx_stats` cookie. False (never
 *  throws) when STATS_KEY isn't configured — config state is never leaked. */
async function isStatsAuthed(request, env) {
  if (!env.STATS_KEY) return false;
  const cookie = getCookie(request, STATS_COOKIE_NAME);
  if (!cookie) return false;
  const expected = await statsToken(env.STATS_KEY);
  return timingSafeEqual(cookie, expected);
}

/** Derive the cookie token from the secret so the raw key is never stored
 *  client-side: hex(SHA-256(STATS_KEY + "|rx-stats-v1")). */
async function statsToken(statsKey) {
  const bytes = new TextEncoder().encode(`${statsKey}|rx-stats-v1`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

/** `Secure` cookies are dropped by browsers over plain http, and `wrangler
 *  dev` serves http://localhost — so only set `Secure` when the request
 *  actually arrived over https (always true in production, behind
 *  Cloudflare's TLS termination). */
function isHttpsRequest(request) {
  if (new URL(request.url).protocol === "https:") return true;
  return (request.headers.get("x-forwarded-proto") || "").toLowerCase() === "https";
}

function buildStatsCookie(value, { maxAge, secure }) {
  const attrs = [`${STATS_COOKIE_NAME}=${value}`, "HttpOnly"];
  if (secure) attrs.push("Secure");
  attrs.push("SameSite=Lax", "Path=/stats", `Max-Age=${maxAge}`);
  return attrs.join("; ");
}

/** Minimal, unbranded password page. Deliberately has no title, hint, or
 *  link that would advertise what it protects. */
function renderPasswordPage({ status, incorrect = false }) {
  const note = incorrect ? `<p class="note">Incorrect.</p>` : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0a0908; color: #e8e3da; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  form { display: flex; flex-direction: column; gap: .6rem; align-items: center; }
  input[type="password"] {
    background: #131110; border: 1px solid #241f18; border-radius: 6px;
    color: #e8e3da; padding: .6rem .8rem; font-size: 1rem; width: 220px;
  }
  input[type="password"]:focus { outline: none; border-color: #d94f30; }
  button {
    background: #d94f30; color: #0a0908; border: none; border-radius: 6px;
    padding: .55rem 1rem; font-size: .9rem; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #eb8a3a; }
  .note { color: #837a6d; font-size: .8rem; margin: 0; }
</style>
</head>
<body>
<form method="POST" action="/stats">
  <input type="password" name="k" autofocus>
  <button type="submit">Enter</button>
  ${note}
</form>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { ...NO_STORE_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Simple length + char-by-char comparison. Not cryptographically hardened,
 *  but avoids the cheapest short-circuit timing tell from `===` on strings
 *  of differing length landing on the very first mismatched byte. */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function clampDays(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 7;
  return Math.min(n, 365);
}

/** Run a query; on any failure (including "no such table" on a brand-new
 *  database) return null so the caller can render a "no data yet" state
 *  instead of blanking the whole page. */
async function safeQuery(env, sql, params = []) {
  try {
    const stmt = params.length ? env.DB.prepare(sql).bind(...params) : env.DB.prepare(sql);
    const res = await stmt.all();
    return res.results || [];
  } catch {
    return null;
  }
}

/** Totals by event type, with unique-session counts. */
function queryTotals(env, cutoff) {
  return safeQuery(
    env,
    `SELECT event, COUNT(*) AS count, COUNT(DISTINCT session) AS sessions
     FROM events WHERE ts > ? GROUP BY event ORDER BY count DESC`,
    [cutoff]
  );
}

/** Top-N labels for a given event type, e.g. wall_click / outbound / section_view. */
function queryTopLabels(env, cutoff, eventName, limit) {
  return safeQuery(
    env,
    `SELECT label, COUNT(*) AS count FROM events
     WHERE ts > ? AND event = ? AND label != '' GROUP BY label ORDER BY count DESC LIMIT ?`,
    [cutoff, eventName, limit]
  );
}

/** Average of `value` for one event type. Returns a number or null. */
async function queryAvgValue(env, cutoff, eventName) {
  const rows = await safeQuery(
    env,
    `SELECT AVG(value) AS avg_v FROM events WHERE ts > ? AND event = ?`,
    [cutoff, eventName]
  );
  if (!rows || rows.length === 0) return null;
  const v = Number(rows[0].avg_v);
  return Number.isFinite(v) ? v : null;
}

/** Top-N values of a pageview dimension (device / country / referrer).
 *  `column` is always one of our own hardcoded literals below — never
 *  user input — so this string interpolation is safe. */
function queryPageviewDimension(env, cutoff, column, limit) {
  return safeQuery(
    env,
    `SELECT ${column} AS value, COUNT(*) AS count FROM events
     WHERE ts > ? AND event = 'pageview' AND ${column} != '' GROUP BY ${column} ORDER BY count DESC LIMIT ?`,
    [cutoff, limit]
  );
}

/** Raw pageview referrer counts (unbucketed) — grouping into channels
 *  happens in JS via `classifyReferrer`, since hostnames are too messy to
 *  bucket cleanly in SQL. No LIMIT: the long tail still needs to be seen
 *  by the classifier so it can fold into the right channel. */
function queryReferrerCounts(env, cutoff) {
  return safeQuery(
    env,
    `SELECT referrer, COUNT(*) AS n FROM events
     WHERE ts > ? AND event = 'pageview' GROUP BY referrer`,
    [cutoff]
  );
}

/** One referrer per session (first/only pageview referrer seen — MIN just
 *  picks a stable single value per session). Used to tie a session's later
 *  engagement events back to the channel that brought it in. */
function querySessionReferrers(env, cutoff) {
  return safeQuery(
    env,
    `SELECT session, MIN(referrer) AS referrer FROM events
     WHERE ts > ? AND event = 'pageview' GROUP BY session`,
    [cutoff]
  );
}

function querySessionWallClicks(env, cutoff) {
  return safeQuery(
    env,
    `SELECT session, COUNT(*) AS clicks FROM events
     WHERE ts > ? AND event = 'wall_click' GROUP BY session`,
    [cutoff]
  );
}

function querySessionScrollDepth(env, cutoff) {
  return safeQuery(
    env,
    `SELECT session, MAX(value) AS depth FROM events
     WHERE ts > ? AND event = 'scroll_depth' GROUP BY session`,
    [cutoff]
  );
}

function queryScrollDepth(env, cutoff) {
  return safeQuery(
    env,
    `SELECT value AS bucket, COUNT(*) AS count FROM events
     WHERE ts > ? AND event = 'scroll_depth' GROUP BY value ORDER BY bucket ASC`,
    [cutoff]
  );
}

function queryDaily(env, cutoff) {
  return safeQuery(
    env,
    `SELECT date(ts / 1000, 'unixepoch') AS day, COUNT(*) AS count FROM events
     WHERE ts > ? AND event = 'pageview' GROUP BY day ORDER BY day ASC`,
    [cutoff]
  );
}

// ---------------------------------------------------------------------------
// "This week" recap — Monday-start week in America/Toronto, independent of
// the ?days= window used by the rest of the dashboard.
// ---------------------------------------------------------------------------

/** Broken-down date/time parts for `ms`, as observed in `zone`. */
function zonedParts(ms, zone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const out = {};
  for (const p of dtf.formatToParts(new Date(ms))) out[p.type] = p.value;
  return out;
}

/** Convert a wall-clock date/time in `zone` to a UTC epoch-ms instant.
 *  Standard guess/observe/correct approach — never hardcodes the zone's UTC
 *  offset, so it stays correct across DST transitions. */
function zonedWallClockToUtcMs(y, m, d, h, mi, s, zone) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const observed = zonedParts(guess, zone);
  const observedAsUtc = Date.UTC(
    Number(observed.year),
    Number(observed.month) - 1,
    Number(observed.day),
    Number(observed.hour) % 24,
    Number(observed.minute),
    Number(observed.second)
  );
  return guess + (guess - observedAsUtc);
}

/** UTC epoch-ms of the most recent Monday 00:00 in America/Toronto, at or
 *  before `nowMs`. DST-aware (no fixed UTC offset); being off by up to an
 *  hour right at a DST transition edge is acceptable. */
function startOfWeekTorontoMs(nowMs) {
  const zone = "America/Toronto";
  const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const today = zonedParts(nowMs, zone);
  const daysSinceMonday = WEEKDAY_INDEX[today.weekday] ?? 0;

  // Anchor on noon UTC so subtracting whole days can't skip a calendar date
  // in the zone (Toronto's offset never exceeds 5h either side of UTC).
  const todayNoonUtc = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day), 12);
  const mondayNoonUtc = todayNoonUtc - daysSinceMonday * 24 * 60 * 60 * 1000;
  const monday = zonedParts(mondayNoonUtc, zone);

  return zonedWallClockToUtcMs(Number(monday.year), Number(monday.month), Number(monday.day), 0, 0, 0, zone);
}

/** "Mon Jul 7" for the given UTC ms, as read in America/Toronto. Built from
 *  formatToParts directly (rather than the locale's combined string) so we
 *  control spacing/punctuation instead of inheriting a locale-added comma. */
function formatWeekStartLabel(weekStartMs) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(weekStartMs))) parts[p.type] = p.value;
  return `${parts.weekday} ${parts.month} ${parts.day}`;
}

/** COUNT(*) and COUNT(DISTINCT session) for one event type within
 *  (sinceMs, untilMs]. `untilMs == null` means no upper bound. */
function queryEventWindow(env, event, sinceMs, untilMs) {
  const sql =
    untilMs == null
      ? `SELECT COUNT(*) AS n, COUNT(DISTINCT session) AS sessions FROM events WHERE event = ? AND ts > ?`
      : `SELECT COUNT(*) AS n, COUNT(DISTINCT session) AS sessions FROM events WHERE event = ? AND ts > ? AND ts <= ?`;
  const params = untilMs == null ? [event, sinceMs] : [event, sinceMs, untilMs];
  return safeQuery(env, sql, params);
}

/** AVG(value) for one event type within (sinceMs, untilMs]. */
function queryAvgValueWindow(env, event, sinceMs, untilMs) {
  const sql =
    untilMs == null
      ? `SELECT AVG(value) AS avg_v FROM events WHERE event = ? AND ts > ?`
      : `SELECT AVG(value) AS avg_v FROM events WHERE event = ? AND ts > ? AND ts <= ?`;
  const params = untilMs == null ? [event, sinceMs] : [event, sinceMs, untilMs];
  return safeQuery(env, sql, params);
}

/** First row's numeric column, or null when the query failed or came back
 *  empty (so a failed query renders "—" instead of blanking the panel). */
function firstRowNumber(rows, key) {
  if (!rows || rows.length === 0) return null;
  const v = Number(rows[0][key]);
  return Number.isFinite(v) ? v : null;
}

/** Assemble the "This week" recap's data from the raw query results. */
function buildWeekRecap({
  weekStart,
  pvThisRows,
  pvLastRows,
  clickThisRows,
  clickLastRows,
  scrollThisRows,
  scrollLastRows,
  referrerCounts,
}) {
  return {
    weekStart,
    visitorsThis: firstRowNumber(pvThisRows, "sessions"),
    visitorsLast: firstRowNumber(pvLastRows, "sessions"),
    pageviewsThis: firstRowNumber(pvThisRows, "n"),
    pageviewsLast: firstRowNumber(pvLastRows, "n"),
    videoPlaysThis: firstRowNumber(clickThisRows, "n"),
    videoPlaysLast: firstRowNumber(clickLastRows, "n"),
    avgScrollThis: firstRowNumber(scrollThisRows, "avg_v"),
    avgScrollLast: firstRowNumber(scrollLastRows, "avg_v"),
    topChannel: topSourceChannel(referrerCounts),
  };
}

/** Bucket a referrer hostname into a traffic-source channel. Pure function,
 *  reused by both the "Traffic sources" and "Source quality" cards.
 *  Unrecognized hostnames fall through as themselves (the raw hostname
 *  becomes its own "channel") so the long tail is still visible. */
function classifyReferrer(host) {
  const raw = String(host || "");
  const h = raw.toLowerCase();
  if (h === "") return "Direct";
  if (/google|bing|duckduckgo|yahoo|ecosia|brave/.test(h)) return "Search";
  if (h.includes("instagram")) return "Instagram"; // incl. l.instagram.com
  if (h.includes("tiktok")) return "TikTok";
  if (h.includes("youtube") || h.includes("youtu.be")) return "YouTube";
  if (h.includes("twitter") || h.includes("x.com") || h.includes("t.co")) return "X / Twitter";
  if (h.includes("linkedin") || h.includes("lnkd.in")) return "LinkedIn";
  if (h.includes("reddit")) return "Reddit"; // incl. out.reddit.com
  if (h.includes("facebook")) return "Facebook"; // incl. lm./l.facebook.com
  if (h.includes("threads.net")) return "Threads";
  return raw;
}

/** Group raw pageview-referrer counts into per-channel totals, sorted by
 *  count desc. Shared by the "Traffic sources" card and the "This week"
 *  top-source line. */
function groupReferrerChannels(referrerCounts) {
  if (!referrerCounts || referrerCounts.length === 0) return [];

  const byChannel = new Map();
  for (const r of referrerCounts) {
    const n = Number(r.n) || 0;
    const channel = classifyReferrer(r.referrer);
    byChannel.set(channel, (byChannel.get(channel) || 0) + n);
  }

  return [...byChannel.entries()]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);
}

/** Group raw pageview-referrer counts into channels for the "Traffic
 *  sources" card. Returns `barRows`-shaped rows (label/count) sorted by
 *  count desc, with each channel's share of total baked into the label. */
function buildTrafficSources(referrerCounts) {
  const channels = groupReferrerChannels(referrerCounts);
  const total = channels.reduce((sum, c) => sum + c.count, 0);
  return channels.map((c) => ({
    label: `${c.channel} — ${total ? Math.round((100 * c.count) / total) : 0}%`,
    count: c.count,
  }));
}

/** The single busiest channel by pageview count, or null when there's no
 *  data. Used by the "This week" recap's "Top source" line. */
function topSourceChannel(referrerCounts) {
  const channels = groupReferrerChannels(referrerCounts);
  return channels.length ? channels[0].channel : null;
}

/** Join session→referrer, session→wall-clicks, and session→scroll-depth
 *  into a per-channel engagement summary for the "Source quality" card. */
function buildSourceQuality(sessionReferrers, sessionClicks, sessionScroll) {
  if (!sessionReferrers || sessionReferrers.length === 0) return [];

  const clicksBySession = new Map((sessionClicks || []).map((r) => [r.session, Number(r.clicks) || 0]));
  const depthBySession = new Map((sessionScroll || []).map((r) => [r.session, Number(r.depth) || 0]));

  const byChannel = new Map(); // channel -> { sessions, clicks, depthSum, depthCount }
  for (const r of sessionReferrers) {
    const channel = classifyReferrer(r.referrer);
    const bucket = byChannel.get(channel) || { sessions: 0, clicks: 0, depthSum: 0, depthCount: 0 };
    bucket.sessions += 1;
    bucket.clicks += clicksBySession.get(r.session) || 0;
    if (depthBySession.has(r.session)) {
      bucket.depthSum += depthBySession.get(r.session);
      bucket.depthCount += 1;
    }
    byChannel.set(channel, bucket);
  }

  return [...byChannel.entries()]
    .map(([channel, b]) => ({
      channel,
      sessions: b.sessions,
      avgScroll: b.depthCount ? Math.round(b.depthSum / b.depthCount) : null,
      clicksPerSession: Math.round((b.clicks / b.sessions) * 10) / 10,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

async function renderStatsPage(env, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const nowMs = Date.now();
  const weekStart = startOfWeekTorontoMs(nowMs);
  const lastWeekStart = weekStart - 7 * 24 * 60 * 60 * 1000;

  const [
    totals,
    wallClicks,
    outbound,
    sections,
    scrollDepth,
    daily,
    devices,
    countries,
    avgTimeOnPage,
    avgScrollDepth,
    referrerCounts,
    sessionReferrers,
    sessionWallClicks,
    sessionScrollDepth,
    pvThisWeek,
    pvLastWeek,
    clicksThisWeek,
    clicksLastWeek,
    scrollThisWeek,
    scrollLastWeek,
    weekReferrerCounts,
  ] = await Promise.all([
    queryTotals(env, cutoff),
    queryTopLabels(env, cutoff, "wall_click", 15),
    queryTopLabels(env, cutoff, "outbound", 15),
    queryTopLabels(env, cutoff, "section_view", 15),
    queryScrollDepth(env, cutoff),
    queryDaily(env, cutoff),
    queryPageviewDimension(env, cutoff, "device", 10),
    queryPageviewDimension(env, cutoff, "country", 10),
    queryAvgValue(env, cutoff, "time_on_page"),
    queryAvgValue(env, cutoff, "scroll_depth"),
    queryReferrerCounts(env, cutoff),
    querySessionReferrers(env, cutoff),
    querySessionWallClicks(env, cutoff),
    querySessionScrollDepth(env, cutoff),
    queryEventWindow(env, "pageview", weekStart, null),
    queryEventWindow(env, "pageview", lastWeekStart, weekStart),
    queryEventWindow(env, "wall_click", weekStart, null),
    queryEventWindow(env, "wall_click", lastWeekStart, weekStart),
    queryAvgValueWindow(env, "scroll_depth", weekStart, null),
    queryAvgValueWindow(env, "scroll_depth", lastWeekStart, weekStart),
    queryReferrerCounts(env, weekStart),
  ]);

  const trafficSources = buildTrafficSources(referrerCounts);
  const sourceQuality = buildSourceQuality(sessionReferrers, sessionWallClicks, sessionScrollDepth);
  const weekRecap = buildWeekRecap({
    weekStart,
    pvThisRows: pvThisWeek,
    pvLastRows: pvLastWeek,
    clickThisRows: clicksThisWeek,
    clickLastRows: clicksLastWeek,
    scrollThisRows: scrollThisWeek,
    scrollLastRows: scrollLastWeek,
    referrerCounts: weekReferrerCounts,
  });

  return renderPage({
    days,
    totals,
    wallClicks,
    outbound,
    sections,
    scrollDepth,
    daily,
    devices,
    countries,
    trafficSources,
    sourceQuality,
    avgTimeOnPage,
    avgScrollDepth,
    weekRecap,
  });
}

function daysNav(active) {
  return [1, 7, 30, 90]
    .map((d) =>
      d === active
        ? `<span class="pill pill-active">${d}d</span>`
        : `<a class="pill" href="/stats?days=${d}">${d}d</a>`
    )
    .join("");
}

function barRows(rows, labelKey, countKey, extraKey) {
  if (!rows || rows.length === 0) {
    return `<p class="empty">No data yet.</p>`;
  }
  const max = Math.max(...rows.map((r) => Number(r[countKey]) || 0), 1);
  return rows
    .map((r) => {
      const label = escapeHtml(String(r[labelKey] ?? "(unknown)"));
      const count = Number(r[countKey]) || 0;
      const pct = Math.max(2, Math.round((count / max) * 100));
      const extra = extraKey && r[extraKey] != null ? ` · ${escapeHtml(String(r[extraKey]))} sessions` : "";
      return `
        <div class="bar-row">
          <div class="bar-label">${label}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="bar-count">${count.toLocaleString()}${extra}</div>
        </div>`;
    })
    .join("");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Format a duration in seconds as e.g. "42s" or "1m 42s". */
function formatDuration(seconds) {
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** One big stat value with a small label under it; "no data yet" when null. */
function statBlock(label, formatted) {
  const value = formatted == null
    ? `<p class="empty">No data yet.</p>`
    : `<div class="stat-value">${escapeHtml(formatted)}</div>`;
  return `<div class="stat">${value}<div class="stat-label">${escapeHtml(label)}</div></div>`;
}

/** Format a "vs last week" delta as colored markup. Every metric (including
 *  the scroll-depth average) uses the same round(100*(this-last)/last)
 *  formula. Output is fixed markup with only a number interpolated, so it's
 *  safe to inline without escaping. */
function formatWeekDelta(current, previous) {
  if (previous === 0 && current === 0) return `<span class="delta delta-flat">—</span>`;
  if (previous === 0) return `<span class="delta delta-up">new</span>`;
  const pct = Math.round((100 * (current - previous)) / previous);
  if (pct > 0) return `<span class="delta delta-up">▲ ${pct}%</span>`;
  if (pct < 0) return `<span class="delta delta-down">▼ ${Math.abs(pct)}%</span>`;
  return `<span class="delta delta-flat">0%</span>`;
}

/** One "This week" stat tile: big number, label, and a colored delta vs
 *  last week. Reuses the existing `.stat` / `.stat-value` / `.stat-label`
 *  look from the Engagement card. Renders "—" for a metric whose query
 *  failed or came back empty, without touching the rest of the panel. */
function weekStatTile(label, current, previous, formatValue) {
  const value = current == null ? "—" : escapeHtml(formatValue(current));
  const delta =
    current == null || previous == null
      ? `<span class="delta delta-flat">—</span>`
      : formatWeekDelta(current, previous);
  return `<div class="stat">
    <div class="stat-value">${value}</div>
    <div class="stat-label">${escapeHtml(label)} ${delta}</div>
  </div>`;
}

/** The "This week" recap panel: four stat tiles vs. the prior Monday-start
 *  week, plus the busiest traffic-source channel. Always Monday-anchored in
 *  America/Toronto — independent of the ?days= selector used below it. */
function renderWeekRecap(recap) {
  const rangeLabel = formatWeekStartLabel(recap.weekStart);
  const topSource = recap.topChannel ? escapeHtml(recap.topChannel) : "—";
  return `
  <section class="card week-recap">
    <h2>This week</h2>
    <p class="sub week-recap-sub">${escapeHtml(rangeLabel)} – now · vs previous week</p>
    <div class="stat-row">
      ${weekStatTile("Visitors", recap.visitorsThis, recap.visitorsLast, (v) => v.toLocaleString())}
      ${weekStatTile("Pageviews", recap.pageviewsThis, recap.pageviewsLast, (v) => v.toLocaleString())}
      ${weekStatTile("Video plays", recap.videoPlaysThis, recap.videoPlaysLast, (v) => v.toLocaleString())}
      ${weekStatTile("Avg scroll", recap.avgScrollThis, recap.avgScrollLast, (v) => `${Math.round(v)}%`)}
    </div>
    <p class="week-recap-source">Top source: <strong>${topSource}</strong></p>
  </section>`;
}

/** One row per channel for the "Source quality" card: sessions, avg scroll
 *  depth, and wall-clicks-per-session. Not a `barRows` list — there's no
 *  single "value" to bar-chart, just a few numbers side by side. */
function sourceQualityRows(channels) {
  if (!channels || channels.length === 0) {
    return `<p class="empty">No data yet.</p>`;
  }
  return channels
    .map((c) => {
      const scroll = c.avgScroll == null ? "n/a" : `${c.avgScroll}%`;
      const sessionWord = c.sessions === 1 ? "session" : "sessions";
      return `
        <div class="quality-row">
          <span class="quality-channel">${escapeHtml(c.channel)}</span>
          <span class="quality-detail">${c.sessions} ${sessionWord} · ${scroll} scroll · ${c.clicksPerSession.toFixed(1)} clicks/session</span>
        </div>`;
    })
    .join("");
}

function renderPage({ days, totals, wallClicks, outbound, sections, scrollDepth, daily, devices, countries, trafficSources, sourceQuality, avgTimeOnPage, avgScrollDepth, weekRecap }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Portfolio Analytics</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2.5rem 1.5rem 5rem;
    background: #0a0908;
    color: #e8e3da;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.5;
  }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; letter-spacing: -0.01em; }
  h2 {
    font-size: .85rem; text-transform: uppercase; letter-spacing: .08em;
    color: #d94f30; margin: 0 0 .9rem; font-weight: 600;
  }
  .sub { color: #837a6d; font-size: .85rem; margin: 0 0 1.75rem; font-family: ui-monospace, monospace; }
  .container { max-width: 960px; margin: 0 auto; }
  .nav { display: flex; gap: .4rem; margin-bottom: 2.25rem; flex-wrap: wrap; }
  .pill {
    padding: .3rem .7rem; border-radius: 999px; font-size: .8rem;
    background: #17140f; color: #b8ae9d; text-decoration: none;
    border: 1px solid #2a251d; font-family: ui-monospace, monospace;
  }
  .pill:hover { border-color: #d94f30; color: #e8e3da; }
  .pill-active { background: #d94f30; color: #0a0908; border-color: #d94f30; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.25rem; }
  .card {
    background: #131110; border: 1px solid #241f18; border-radius: 10px;
    padding: 1.25rem 1.4rem 1.4rem;
  }
  .card.wide { grid-column: 1 / -1; }
  .empty { color: #5f584c; font-size: .85rem; font-style: italic; margin: .25rem 0 0; }
  .bar-row { display: grid; grid-template-columns: minmax(90px,160px) 1fr auto; gap: .6rem; align-items: center; margin-bottom: .45rem; font-size: .82rem; }
  .bar-label { color: #cfc7b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: ui-monospace, monospace; }
  .bar-track { background: #1c1812; border-radius: 4px; height: 10px; overflow: hidden; }
  .bar-fill { background: linear-gradient(90deg, #d94f30, #eb8a3a); height: 100%; border-radius: 4px; }
  .bar-count { color: #9c927f; font-variant-numeric: tabular-nums; font-size: .78rem; white-space: nowrap; }
  .stat-row { display: flex; gap: 2rem; flex-wrap: wrap; }
  .stat-value { font-size: 1.9rem; font-weight: 700; color: #eb8a3a; font-variant-numeric: tabular-nums; line-height: 1.15; }
  .stat-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; color: #837a6d; margin-top: .2rem; }
  .daily-row { display: flex; align-items: flex-end; gap: 3px; height: 90px; margin-top: .5rem; }
  .daily-bar { flex: 1; background: linear-gradient(180deg, #eb8a3a, #d94f30); border-radius: 3px 3px 0 0; min-height: 2px; position: relative; }
  .daily-labels { display: flex; gap: 3px; margin-top: .35rem; }
  .daily-labels span { flex: 1; text-align: center; font-size: .62rem; color: #6b6255; font-family: ui-monospace, monospace; }
  .quality-row { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; padding: .4rem 0; border-bottom: 1px solid #1c1812; font-size: .82rem; }
  .quality-row:last-child { border-bottom: none; }
  .quality-channel { color: #cfc7b8; font-family: ui-monospace, monospace; white-space: nowrap; }
  .quality-detail { color: #9c927f; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .week-recap { margin-bottom: 1.75rem; border-color: #3a2c1c; background: #161009; }
  .week-recap .stat-row { margin-top: .9rem; gap: 2.5rem; }
  .week-recap-sub { color: #837a6d; font-size: .8rem; margin: 0 0 .25rem; font-family: ui-monospace, monospace; }
  .week-recap-source { color: #b8ae9d; font-size: .82rem; margin: 1.1rem 0 0; }
  .week-recap-source strong { color: #e8e3da; }
  .delta { font-weight: 600; font-variant-numeric: tabular-nums; margin-left: .35rem; text-transform: none; letter-spacing: 0; }
  .delta-up { color: #7fb069; }
  .delta-down { color: #d94f30; }
  .delta-flat { color: #5f584c; }
  footer { max-width: 960px; margin: 2.5rem auto 0; color: #5f584c; font-size: .78rem; font-family: ui-monospace, monospace; }
  a { color: #eb8a3a; }
</style>
</head>
<body>
<div class="container">
  <h1>Portfolio Analytics</h1>
  <p class="sub">last ${days} day${days === 1 ? "" : "s"} · portfolio.relatedshortschanger.com</p>

  ${renderWeekRecap(weekRecap)}

  <nav class="nav">${daysNav(days)}</nav>

  <div class="grid">
    <div class="card">
      <h2>Events by type</h2>
      ${barRows(totals, "event", "count", "sessions")}
    </div>

    <div class="card">
      <h2>Engagement</h2>
      <div class="stat-row">
        ${statBlock("avg time on page", avgTimeOnPage == null ? null : formatDuration(avgTimeOnPage))}
        ${statBlock("avg scroll depth", avgScrollDepth == null ? null : `${Math.round(avgScrollDepth)}%`)}
      </div>
    </div>

    <div class="card">
      <h2>Devices</h2>
      ${barRows(devices, "value", "count")}
    </div>

    <div class="card wide">
      <h2>Daily pageviews</h2>
      ${renderDailyChart(daily)}
    </div>

    <div class="card">
      <h2>Top wall clicks</h2>
      ${barRows(wallClicks, "label", "count")}
    </div>

    <div class="card">
      <h2>Top outbound links</h2>
      ${barRows(outbound, "label", "count")}
    </div>

    <div class="card">
      <h2>Section views</h2>
      ${barRows(sections, "label", "count")}
    </div>

    <div class="card">
      <h2>Scroll depth</h2>
      ${barRows(scrollDepth, "bucket", "count")}
    </div>

    <div class="card">
      <h2>Top countries</h2>
      ${barRows(countries, "value", "count")}
    </div>

    <div class="card">
      <h2>Traffic sources</h2>
      ${barRows(trafficSources, "label", "count")}
    </div>

    <div class="card">
      <h2>Source quality</h2>
      ${sourceQualityRows(sourceQuality)}
    </div>
  </div>
</div>
<footer>Cookieless, first-party analytics — stored in Cloudflare D1 · free tier. No time-based retention limit. · <a href="/stats/logout">Sign out</a></footer>
</body>
</html>`;
}

function renderDailyChart(daily) {
  if (!daily || daily.length === 0) {
    return `<p class="empty">No data yet.</p>`;
  }
  const max = Math.max(...daily.map((r) => Number(r.count) || 0), 1);
  const bars = daily
    .map((r) => `<div class="daily-bar" style="height:${Math.max(2, Math.round((Number(r.count) / max) * 100))}%" title="${escapeHtml(String(r.count))}"></div>`)
    .join("");
  const labels = daily
    .map((r) => {
      const d = new Date(r.day);
      const label = isNaN(d) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
      return `<span>${label}</span>`;
    })
    .join("");
  return `<div class="daily-row">${bars}</div><div class="daily-labels">${labels}</div>`;
}
