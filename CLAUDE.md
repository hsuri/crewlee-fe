# crewlee-fe

Frontend for Crewlee, a restaurant operations platform. Thin Express static file server + reverse proxy — **no build step, no bundler, no frontend framework.** Every logged-in page is a single self-contained `.html` file with inline `<style>`/`<script>`. This app owns zero business logic and no database access; all of that lives in the sibling `crewlee-be` repo.

## Architecture

`server.js` (42 lines) is the entire server:
- `/api/*` → proxied via `http-proxy-middleware` to `API_URL` (`crewlee-be`, default `http://localhost:8001`), with a 502 JSON fallback if the backend is unreachable.
- `express.static('public')` serves everything under `public/` (pages, styles, scripts) at the site root, plus explicit routes for `/admin`, `/login`, `/app` (each `res.sendFile`s its HTML from `public/pages/`), and a catch-all `app.get('*', ...)` that serves `public/pages/index.html` for anything unmatched. **This catch-all means a request for a deleted static file returns `200` with the marketing page body, not a `404`** — don't rely on HTTP status to check whether a file under `public/` exists; check the filesystem instead.
- No auth/session middleware at this layer. Auth is a bearer token in `sessionStorage`, issued and verified entirely by `crewlee-be`; `server.js` just proxies the `Authorization` header through.

## Folder layout

```
public/
  pages/    one .html file per route (index, login, app, admin) — markup only, no inline <style>/<script>
  styles/   one .css file per page, plus tokens.css (shared design tokens)
  scripts/  one .js file per page, plus scripts/lib/ (api.js, toast.js, session.js — shared helpers)
```

Still **no build step, no bundler, no frontend framework** — `scripts/*.js` are loaded as native `<script type="module">`, so `import`/`export` works directly in the browser with zero tooling. Asset references in HTML are root-absolute (`/styles/app.css`, `/scripts/app.js`) rather than relative, since `express.static` serves the whole `public/` tree at the site root regardless of where the referencing HTML file sits under `public/pages/`.

## Page inventory

| Route | File | Purpose |
|---|---|---|
| `/` | `pages/index.html` | Marketing/waitlist landing page. Only page that uses `styles/marketing.css` and `scripts/marketing.js`. |
| `/login` | `pages/login.html` | Email/password login → `POST /api/auth/login` → stores `{token, user}` via `scripts/lib/session.js` → redirects to `/app`. |
| `/app` | `pages/app.html` | Logged-in dashboard shell. Three tabs: **Schedule** and **Announcements** (fully built — see below), "Ask (RAG)" (placeholder, not implemented). |
| `/admin` | `pages/admin.html` | Password-gated internal waitlist dashboard (stat cards, table, CSV export of `/api/waitlist`). Unrelated to scheduling. |

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

## Conventions

- **Shared JS lives in `scripts/lib/`** (`api.js`, `toast.js`, `session.js`) and is imported via native `<script type="module">` — no bundler, since browsers run ES modules directly. Page-specific logic (date formatting, DOM wiring, the scheduling calendar) stays in that page's own `scripts/<page>.js` rather than being pulled into `lib/` — only pull something into `lib/` once a second page actually needs it, don't pre-emptively generalize.
- `scripts/lib/session.js` owns both `sessionStorage` keys used across pages — `crewleeSession` (staff login, `{token, user}`, read/written via `getSession`/`setSession`/`clearSession`) and `adminToken` (waitlist admin panel, via `getAdminToken`/`setAdminToken`/`clearAdminToken`). Go through these rather than touching `sessionStorage` directly, so there's one place that knows the key names and shapes.
- CSS is one file per page under `styles/`, hand-formatted with generous spacing and blank lines between rule groups — match that when editing, rather than writing dense single-line CSS.

## Known limitations

- No automated tests, no CI, no TypeScript, no linting.
- Marketing-vs-app-shell token/button-shape inconsistency — see Design tokens above; intentionally left as-is.
- "Ask (RAG)" tab in `app.html` is a placeholder card only.
- Most user-entered strings across this file (department names, requirement notes, employee names) are interpolated into `innerHTML` unescaped — a pre-existing gap, not something newly introduced. Only announcement title/body are escaped (see Announcements UI above), since that's the one field broadcasting one user's free text to everyone.

## Local dev

```bash
npm run dev   # nodemon, serves on :3000, requires .env.local (API_URL, PORT)
```
Requires `crewlee-be` running first (default `http://localhost:8001`) for anything beyond static asset serving — the proxy returns a 502 JSON body otherwise, which will surface as a toast error in the UI.
