# crewlee-fe

Frontend for Crewlee, a restaurant operations platform. Thin Express static file server + reverse proxy — **no build step, no bundler, no frontend framework.** Every logged-in page is a single self-contained `.html` file with inline `<style>`/`<script>`. This app owns zero business logic and no database access; all of that lives in the sibling `crewlee-be` repo.

## Architecture

`server.js` is the entire server:
- `/api/*` → proxied via `http-proxy-middleware` to `API_URL` (`crewlee-be`, default `http://localhost:8001`), with a 502 JSON fallback if the backend is unreachable. `xfwd: true` is set on this proxy so `crewlee-be` sees the real client IP via `X-Forwarded-For` — added for Guest AI's per-IP rate limiter, but it's general hygiene; don't remove it.
- `app.set('trust proxy', true)` — needed so `req.protocol` reports `https` (not `http`) when running behind Cloud Run's edge TLS termination. The Guest AI QR endpoint depends on this to encode the right scheme.
- `express.static('public')` serves everything under `public/` (pages, styles, scripts) at the site root, plus explicit routes for `/admin`, `/login`, `/app*` (each `res.sendFile`s its HTML from `public/pages/`), `/guest/:slug` (public Guest AI chat page), `/guest/:slug/qr.png` (server-rendered QR PNG, via the `qrcode` npm package — generated on the fly, not stored), and a catch-all `app.get('*', ...)` that serves `public/pages/index.html` for anything unmatched. **This catch-all means a request for a deleted static file returns `200` with the marketing page body, not a `404`** — don't rely on HTTP status to check whether a file under `public/` exists; check the filesystem instead.
- No auth/session middleware at this layer. Auth is a bearer token in `sessionStorage`, issued and verified entirely by `crewlee-be`; `server.js` just proxies the `Authorization` header through. The one exception is `/guest/*`, which is intentionally unauthenticated end-to-end (see Guest AI below) — there is no session at all on that path, by design, not by omission.

## Folder layout

```
public/
  pages/    one .html file per route (index, login, app, admin, guest) — markup only, no inline <style>/<script>
  styles/   one .css file per page, plus tokens.css (shared design tokens)
  scripts/  one .js file per page, plus scripts/lib/ (api.js, toast.js, session.js, dialog.js — shared helpers)
```

Still **no build step, no bundler, no frontend framework** — `scripts/*.js` are loaded as native `<script type="module">`, so `import`/`export` works directly in the browser with zero tooling. Asset references in HTML are root-absolute (`/styles/app.css`, `/scripts/app.js`) rather than relative, since `express.static` serves the whole `public/` tree at the site root regardless of where the referencing HTML file sits under `public/pages/`.

## Page inventory

| Route | File | Purpose |
|---|---|---|
| `/` | `pages/index.html` | Marketing/waitlist landing page. Only page that uses `styles/marketing.css` and `scripts/marketing.js`. |
| `/login` | `pages/login.html` | Email/password login → `POST /api/auth/login` → stores `{token, user}` via `scripts/lib/session.js` → redirects to `/app`. |
| `/app`, `/app/dashboard`, `/app/schedule`, `/app/announcements`, `/app/rag`, `/app/guestai`, `/app/settings` | `pages/app.html` | Logged-in dashboard shell, one real route per tab (see `switchToPanel`/`panelFromPath` in `app.js`) so a refresh stays on the same tab. Tabs: Dashboard, Schedule, Announcements (all fully built), **Ask Crewlee** (`#panel-rag` — the employee-facing RAG chat + knowledge base, fully built despite what an older version of this doc said), **Guest AI** (`#panel-guestai`, manager-only — see below), plus a gear-icon **Settings** panel (profile, departments, team). |
| `/admin` | `pages/admin.html` | Password-gated internal waitlist dashboard (stat cards, table, CSV export of `/api/waitlist`). Unrelated to scheduling. |
| `/guest/:slug` | `pages/guest.html` | Public, unauthenticated Guest AI chat for restaurant customers — see Guest AI below. |

## Design tokens

`app.html`, `admin.html`, and `login.html` share one token set, in **`public/styles/tokens.css`**, linked via `<link rel="stylesheet" href="/styles/tokens.css">` in each page's `<head>` (before that page's own stylesheet, so page-specific rules can still override if ever needed). Variables: `--accent`, `--accent-hover`, `--accent-light`, `--navy`, `--slate`, `--bg`, `--white`, `--border`, `--success`, `--text-primary/secondary/muted`, `--shadow-sm/md/lg`.

`public/styles/marketing.css` (marketing page only, `index.html`) is a **deliberately separate, differently-named token set** — `--coral`, `--charcoal`, `--cream`, `--sage`, `--beige-100/200/300` — with close-but-not-identical hex values and a different visual language (fully rounded pill buttons vs. the app shell's 8px-rounded rectangular buttons). This is a known, intentional-for-now inconsistency between the marketing surface and the product surface, not something to "fix" by unifying naming — the marketing page has a distinct brand voice and reworking it wasn't in scope when `tokens.css` was introduced. If unifying it becomes a goal, treat it as its own scoped pass, not a side effect of touching `app.html`/`admin.html`/`login.html`.

## Scheduling UI (`app.html`)

Role-gated at render time (`session.user.role === 'manager'`), and structured as three layers matching the backend: coverage requirements → generated shifts → employee assignment.

- **Manager view** (`#managerSchedule`) — CSS-grid weekly calendar (employees × 7 days) with drag-and-drop shift reassignment (`PATCH /api/scheduling/shifts/:id`), an open-shifts sidebar, a swap approval queue, week navigation, an "+ Add shift" modal, "Generate Shifts" (layer 1→2, materializes `coverage_requirements` into open shifts), and "Smart Fill" (layer 2→3, `POST /api/scheduling/auto-build`).
  - Clicking a day header opens the **Day Plan modal** (`#dayPlanModal`) — add/edit/delete `coverage_requirements` blocks for that day (department, time, count, optional min-confidence gate, "every {weekday}" vs "this week only" scope), with a live filled/required coverage pill per block.
  - Clicking an employee's name opens the **Employee Card modal** (`#employeeCardModal`) — the Smart Fill profile: confidence slider (1-5), max/min/preferred hours-per-week, an "exclude from Smart Fill" opt-out, manager notes, and read-only weekly availability. `PATCH /api/scheduling/employees/{id}`.
- **Employee view** (`#employeeSchedule`) — "My Schedule" (offer/drop a shift via `POST /api/scheduling/drop-shift?shiftId=...`, a query param, not a JSON body — matches the backend's actual signature, don't "fix" it to a body param without changing `main.py` too) and "Eligible Shifts" (claim an offered shift).
- All requests go through the shared `api` client (`scripts/app.js`, built from `scripts/lib/api.js`'s `createApiClient`), which attaches `Authorization: Bearer <token>` from the session and throws on non-2xx so callers can `catch` into a `toast(message, type)` call (`scripts/lib/toast.js`). `type` is `'success'` | `'error'` | `''` (neutral) — pass it explicitly; the toast's colored left border depends on it. `.toast`/`.toast.success`/`.toast.error` are defined in `styles/app.css` — `toast.js` itself carries no CSS. Every click handler that triggers an `api(...)` call wraps it in `try/catch` and toasts `error.message` on failure — including handlers that open a modal via an async render (e.g. the day-header and employee-name clicks), so a stale/unreachable backend surfaces a visible error instead of the modal silently never opening.
- **The drag-and-drop `PATCH` always resends the full shift** (`employeeId`, `date`, `startTime`, `endTime`), because the backend's `PATCH /api/scheduling/shifts/{id}` currently requires all of those fields even for a pure reassignment (see `crewlee-be/CLAUDE.md`, Known limitations). Don't drop those fields from the payload without a matching backend change.
- Empty states (open shifts, my schedule, eligible shifts, approval queue, day plan, announcements) use a shared `.empty-state` class (centered, muted, padded) — reuse it for any new empty-list UI in this file rather than inventing another pattern.

## Announcements UI (`app.html`)

Role-gated the same way as Schedule:

- **Manager view** (`#managerAnnouncements`) — "+ New Announcement" opens `#announcementModal` (title, body, pinned checkbox) → `POST /api/announcements`. Below it, a card per announcement (title, body, author, date, pinned badge) with a "N/M read" pill (reuses the scheduling Day Plan's `.coverage-pill` empty/partial/full color convention) that opens `#readReceiptsModal` — the full roster with per-person read status, unread-first. A delete button per card (`DELETE /api/announcements/{id}`); no edit endpoint exists on purpose (see `crewlee-be/CLAUDE.md`, Known limitations).
- **Employee view** (`#employeeAnnouncements`) — same card list; unread announcements get an accent border and an "Acknowledge" button (`POST /api/announcements/{id}/read`) that's replaced with a "✓ Read {date}" indicator once confirmed — read confirmation is a deliberate click, not inferred from viewing the list.
- Announcement `title`/`body` are the one piece of free-text content in this app that's rendered from another user's input to a broad audience (a manager's post, shown to the whole team), so they're run through a small `escapeHtml` helper in `app.js` before being interpolated into `innerHTML`. Other user-entered strings in this file (department names, requirement notes, employee names) aren't escaped — that's a pre-existing, lower-risk gap elsewhere in this file, not a pattern to copy for new free-text fields.
- Both load eagerly at page init (`loadAnnouncements()`), same as the schedule data, regardless of which tab is initially active.

## Ask Crewlee UI (`app.html`, `#panel-rag`)

The employee-facing RAG chat — not a placeholder, fully built:

- `.chat-shell` > `.chat-thread` (message bubbles, `#chatThread`) + a single-input `.chat-input-bar` form. `ragThread` (module-scoped array in `app.js`) holds `{question, pending?, answer?, citations?, error?}` entries; `renderRagThread()` rebuilds the whole thread's `innerHTML` from it on every change (no incremental DOM patching anywhere in this app — that's the standing convention, not unique to this panel). No streaming: `askRag()` shows a `.typing` dots animation while the single blocking `POST /api/rag/query` call is in flight, then replaces it with the full answer at once.
- Citations render as `.source-chip` pills (`ragSourceChipHTML`) with a hover tooltip showing the quoted passage and a "View document →" link that opens the knowledge-base drawer scrolled to that document.
- The knowledge base itself is a slide-out `.drawer` (`#ragDrawer`), opened via "View knowledge base" — a card per document (`renderRagDocuments`) with Download (blob-fetch workaround since a plain `<a href>` can't carry the `Authorization` header) and, manager-only, Edit/Delete. Add/Edit uses `#ragDocumentModal` with a file-upload-or-paste-text toggle (pasted text is wrapped client-side as a synthetic `.txt` File before posting, so it flows through the same multipart endpoint either way).
- This is the template Guest AI's Test-mode chat below deliberately mirrors (same CSS classes, same render-from-array pattern) rather than inventing a second chat UI style.

## Guest AI (`app.html` `#panel-guestai` manager page; `guest.html`/`guest.js`/`guest.css` public page)

Two surfaces, both thin clients over `crewlee-be`'s `app/api/routes/guest_ai.py` — see that repo's CLAUDE.md for the actual security model (the hard boundary is entirely server-side; nothing here enforces anything).

- **Manager page** (`#panel-guestai`, tab hidden for non-managers via the same `.hidden`-class-toggle pattern as the Settings panel's Departments/Team cards): a Status card (enabled/disabled pill + toggle, `PATCH /api/guest-ai/settings`, confirms before turning *off* via `confirmDialog` since that's the guest-facing-breaking direction — turning on doesn't confirm), a Guest Knowledge card (every `rag_documents` row with a plain checkbox toggle, `PATCH /api/guest-ai/knowledge/{id}`; this is intentionally a flat list, not a category-approval workflow — see backend CLAUDE.md for why per-document is the right granularity here), a Test Guest AI chat (same `.chat-shell` markup/pattern as Ask Crewlee, but posts to `/api/guest-ai/test-query` and — unlike the public page — shows citations, since a manager verifying sources is the whole point), a QR/link card, and an Activity card (`GET /api/guest-ai/analytics`).
- **QR code**: generated **server-side** (`GET /guest/:slug/qr.png` in `server.js`, via the `qrcode` npm package), not client-side. This was a deliberate call against vendoring a client-side QR JS library: no new client dependency, "Download" is a plain `<a href=".../qr.png" download>` (no auth, no blob-fetch dance needed — unlike the RAG document downloads above, this endpoint needs no `Authorization` header since a QR code encoding a public URL isn't sensitive), and the manager page + the printable table card both just point an `<img>` at the same URL.
- **Guest URL** is built **client-side** as `${location.origin}/guest/${slug}` (`loadGuestAiSettings` in `app.js`) rather than returned by the backend — the frontend is already being viewed from the correct origin (whatever environment it's deployed in), so there's no need for the backend to know or construct a frontend URL.
- **"Print Table Card"** (`#guestAiPrintCardBtn`) doesn't generate a file — it populates a hidden `#guestAiPrintCard` block (direct child of `<body>`, styled only under `@media print` in `app.css`) and calls `window.print()`, letting the browser's own print dialog handle "save as PDF." No PDF-generation library was introduced; this was a deliberate scope call (see backend CLAUDE.md/the feature's design notes) given this app has no document-generation tooling at all today.
- **Public page** (`guest.html` + `guest.js` + `guest.css`): the `/login`-style template for a standalone unauthenticated page — own script, own stylesheet, no `session.js`/`api.js`'s `createApiClient` involved at all. Uses `publicApi()` (added to `scripts/lib/api.js` alongside `createApiClient`) — a fetch wrapper with **no** `Authorization` header, for exactly this one use case. The slug is read from `location.pathname` (`/guest/{slug}`), mirroring how `app.js`'s `panelFromPath` parses `/app/{panel}`. Mobile-first CSS (`guest.css`) — a fixed-height flex chat column (`100dvh`), 16px input font (avoids iOS Safari's auto-zoom-on-focus), `env(safe-area-inset-bottom)` padding for the home-indicator area, and a `(min-width: 640px)` block that's the *exception* (a centered card look on desktop), not the base design.
- No streaming, no multi-turn memory sent to the model — see backend CLAUDE.md. The chat still *feels* multi-turn because `guest.js`'s `thread` array and `app.js`'s `guestAiTestThread` accumulate every Q&A pair client-side for display, same as `ragThread` does for Ask Crewlee; each question is answered independently server-side.

## Conventions

- **Shared JS lives in `scripts/lib/`** (`api.js`, `toast.js`, `session.js`, `dialog.js`) and is imported via native `<script type="module">` — no bundler, since browsers run ES modules directly. Page-specific logic (date formatting, DOM wiring, the scheduling calendar) stays in that page's own `scripts/<page>.js` rather than being pulled into `lib/` — only pull something into `lib/` once a second page actually needs it, don't pre-emptively generalize.
- `scripts/lib/api.js` has two exports now: `createApiClient(getToken)` (authenticated, used by every logged-in page) and `publicApi` (no `Authorization` header at all, used only by `guest.js`). Don't add a token to `publicApi` or a "skip auth" flag to `createApiClient` — the public Guest AI page genuinely has no session, and keeping that a structurally different function makes it obvious at the call site rather than a runtime branch.
- `scripts/lib/session.js` owns both `sessionStorage` keys used across pages — `crewleeSession` (staff login, `{token, user}`, read/written via `getSession`/`setSession`/`clearSession`) and `adminToken` (waitlist admin panel, via `getAdminToken`/`setAdminToken`/`clearAdminToken`). Go through these rather than touching `sessionStorage` directly, so there's one place that knows the key names and shapes. `guest.html`/`guest.js` deliberately never touch this file at all.
- `scripts/lib/dialog.js`'s `confirmDialog`/`promptDialog` are the pattern for any "are you sure" moment (e.g. Guest AI's turn-off confirmation) — they inject a `.modal-backdrop` with no `id`, which is how the global Escape-key handler in `app.js` tells a dynamic dialog apart from a static one.
- CSS is one file per page under `styles/`, hand-formatted with generous spacing and blank lines between rule groups — match that when editing, rather than writing dense single-line CSS.
- **`app.html` contains a dead, unused `#settingsOverlay` block** (near the end of the file) with DOM ids that duplicate ones inside the real `#panel-settings` (`settingsName`, `departmentsSettingsRow`, `teamSettingsRow`, `logoutBtn`, etc.) — leftover from before Settings became a real panel, referenced by no JS or CSS. It's invalid HTML (duplicate ids) but harmless since nothing targets it. Don't copy structure from it, and pick new element ids carefully (a grep for the id first will save you a silent collision).

## Known limitations

- **Still no automated frontend tests, no CI, no TypeScript, no linting.** `crewlee-be` picked up a pytest suite for Guest AI (see its CLAUDE.md); this repo has no test framework at all, so Guest AI's frontend was verified manually (see below) rather than with automated tests — introducing a framework (Vitest/Playwright, say) for one feature would have been disproportionate given nothing else here has any coverage either.
- Marketing-vs-app-shell token/button-shape inconsistency — see Design tokens above; intentionally left as-is.
- Most user-entered strings across this file (department names, requirement notes, employee names) are interpolated into `innerHTML` unescaped — a pre-existing gap, not something newly introduced. Only announcement title/body and Guest AI content (document titles, guest questions/answers) are escaped, since those are the fields that render another party's free text.
- Guest AI's rate limiting and abuse protection live entirely in `crewlee-be` (see its CLAUDE.md) — this repo does nothing beyond forwarding `X-Forwarded-For` (`xfwd: true`) so that limiter has a real IP to key on.
- Manual verification for Guest AI (no automated frontend tests): boot both repos locally, log in as `manager@demo.com`, open `/app/guestai`, toggle a document visible, toggle Guest AI on, then open `/guest/demo-restaurant` in another tab/device and confirm the same question only ever surfaces guest-approved content.

## Local dev

```bash
npm install    # picks up the qrcode dependency added for Guest AI, if you haven't already
npm run dev    # nodemon, serves on :3000, requires .env.local (API_URL, PORT)
```
Requires `crewlee-be` running first (default `http://localhost:8001`) for anything beyond static asset serving — the proxy returns a 502 JSON body otherwise, which will surface as a toast error in the UI. `crewlee-be` in turn needs a real `VOYAGE_API_KEY`/`ANTHROPIC_API_KEY` for Ask Crewlee or Guest AI to actually answer a question (without them you'll see a 502 from those specific calls; everything else — settings, knowledge toggles, QR codes — works without them).
