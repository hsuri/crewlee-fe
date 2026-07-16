# crewlee-fe

Frontend for Crewlee, a restaurant operations platform. Thin Express static file server + reverse proxy — **no build step, no bundler, no frontend framework.** Every logged-in page is a single self-contained `.html` file with inline `<style>`/`<script>`. This app owns zero business logic and no database access; all of that lives in the sibling `crewlee-be` repo.

## Architecture

`server.js` (42 lines) is the entire server:
- `/api/*` → proxied via `http-proxy-middleware` to `API_URL` (`crewlee-be`, default `http://localhost:8001`), with a 502 JSON fallback if the backend is unreachable.
- `express.static('public')` serves everything else, plus explicit routes for `/admin`, `/login`, `/app` (each `res.sendFile`s its HTML), and a catch-all `app.get('*', ...)` that serves `index.html` for anything unmatched. **This catch-all means a request for a deleted static file returns `200` with the marketing page body, not a `404`** — don't rely on HTTP status to check whether a file under `public/` exists; check the filesystem instead.
- No auth/session middleware at this layer. Auth is a bearer token in `sessionStorage`, issued and verified entirely by `crewlee-be`; `server.js` just proxies the `Authorization` header through.

## Page inventory

| Route | File | Purpose |
|---|---|---|
| `/` | `index.html` | Marketing/waitlist landing page. Only page that uses `public/styles.css` and `public/app.js`. |
| `/login` | `login.html` | Email/password login → `POST /api/auth/login` → stores `{token, user}` in `sessionStorage.crewleeSession` → redirects to `/app`. |
| `/app` | `app.html` | Logged-in dashboard shell. Three tabs: **Schedule** (fully built — see below), "Ask (RAG)" and "Announcements" (placeholders, not implemented). |
| `/admin` | `admin.html` | Password-gated internal waitlist dashboard (stat cards, table, CSV export of `/api/waitlist`). Unrelated to scheduling. |

## Design tokens

`app.html`, `admin.html`, and `login.html` share one token set, now consolidated into **`public/tokens.css`**, linked via `<link rel="stylesheet" href="/tokens.css">` in each page's `<head>` (before that page's own `<style>` block, so page-specific rules can still override if ever needed). Variables: `--accent`, `--accent-hover`, `--accent-light`, `--navy`, `--slate`, `--bg`, `--white`, `--border`, `--success`, `--text-primary/secondary/muted`, `--shadow-sm/md/lg`.

`public/styles.css` (marketing page only, `index.html`) is a **deliberately separate, differently-named token set** — `--coral`, `--charcoal`, `--cream`, `--sage`, `--beige-100/200/300` — with close-but-not-identical hex values and a different visual language (fully rounded pill buttons vs. the app shell's 8px-rounded rectangular buttons). This is a known, intentional-for-now inconsistency between the marketing surface and the product surface, not something to "fix" by unifying naming — the marketing page has a distinct brand voice and reworking it wasn't in scope when `tokens.css` was introduced. If unifying it becomes a goal, treat it as its own scoped pass, not a side effect of touching `app.html`/`admin.html`/`login.html`.

## Scheduling UI (`app.html`)

The only fully-built tab. Role-gated at render time (`session.user.role === 'manager'`):

- **Manager view** (`#managerSchedule`) — CSS-grid weekly calendar (employees × 7 days) with drag-and-drop shift reassignment (`PATCH /api/scheduling/shifts/:id`), an open-shifts sidebar, a swap approval queue, week navigation, an "+ Add shift" modal, and "Auto-Build Schedule".
- **Employee view** (`#employeeSchedule`) — "My Schedule" (offer/drop a shift via `POST /api/scheduling/drop-shift?shiftId=...`, a query param, not a JSON body — matches the backend's actual signature, don't "fix" it to a body param without changing `main.py` too) and "Eligible Shifts" (claim an offered shift).
- All requests go through the shared `api()` helper (`app.html`'s inline script), which attaches `Authorization: Bearer <token>` from `sessionStorage` and throws on non-2xx so callers can `catch` into a `toast(message, type)` call. `type` is `'success'` | `'error'` | `''` (neutral) — pass it explicitly; the toast's colored left border depends on it.
- **The drag-and-drop `PATCH` always resends the full shift** (`employeeId`, `date`, `startTime`, `endTime`), because the backend's `PATCH /api/scheduling/shifts/{id}` currently requires all of those fields even for a pure reassignment (see `crewlee-be/CLAUDE.md`, Known limitations). Don't drop those fields from the payload without a matching backend change.
- Empty states (open shifts, my schedule, eligible shifts, approval queue) use a shared `.empty-state` class (centered, muted, padded) — reuse it for any new empty-list UI in this file rather than inventing another pattern.

## Conventions

- **No shared JS modules.** Each page's `<script>` is self-contained and re-declares its own small helpers (`toast`, `api`, date formatting) rather than importing from a common file. This is deliberate given the no-build-tooling constraint — don't introduce a bundler or `<script type="module">` import graph to "fix" this without discussing the tradeoff first.
- Inline `<style>` blocks are hand-formatted with generous spacing and blank lines between rule groups — match that when editing, rather than writing dense single-line CSS.

## Known limitations

- No automated tests, no CI, no TypeScript, no linting.
- Marketing-vs-app-shell token/button-shape inconsistency — see Design tokens above; intentionally left as-is.
- "Ask (RAG)" and "Announcements" tabs in `app.html` are placeholder cards only.

## Local dev

```bash
npm run dev   # nodemon, serves on :3000, requires .env.local (API_URL, PORT)
```
Requires `crewlee-be` running first (default `http://localhost:8001`) for anything beyond static asset serving — the proxy returns a 502 JSON body otherwise, which will surface as a toast error in the UI.
