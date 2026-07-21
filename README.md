# crewlee-fe

Frontend for Crewlee — a restaurant knowledge-sharing, scheduling, and announcements platform. Thin Express static-file server + reverse proxy — **no build step, no bundler, no frontend framework.** Owns zero business logic and no database access; all of that lives in [crewlee-be](../crewlee-be).

For the full page-by-page breakdown and UI conventions, see **`CLAUDE.md`** in this repo — kept detailed and current; this README is the practical quick-start.

## Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `pages/index.html` | Marketing/waitlist landing page — hero, features, founding program, signup form |
| `/login` | `pages/login.html` | Email/password login → stores `{token, user}` → redirects to `/app` |
| `/app` | `pages/app.html` | Logged-in dashboard shell. Three tabs: **Schedule** and **Announcements** (fully built — drag-and-drop calendar, Smart Fill auto-build, swap marketplace, read receipts), **"Ask (RAG)"** (placeholder only, not implemented) |
| `/admin` | `pages/admin.html` | Password-gated internal waitlist dashboard (stat cards, table, CSV export) |
| `/api/*` | — | Proxied straight through to `crewlee-be` (`API_URL`) |

Note: `server.js`'s catch-all route serves `index.html` for anything unmatched, so a request for a deleted static file returns `200` with the marketing page body, not a `404` — don't rely on HTTP status to check whether a file under `public/` exists.

## Folder layout

```
public/
  pages/    one .html file per route — markup only, no inline <style>/<script>
  styles/   one .css file per page, plus tokens.css (shared design tokens for login/app/admin)
  scripts/  one .js file per page, plus scripts/lib/ (api.js, session.js, toast.js, dialog.js)
```

`scripts/*.js` load as native `<script type="module">` — browsers handle `import`/`export` with zero tooling. Asset references are root-absolute (`/styles/app.css`) since `express.static` serves the whole `public/` tree at the site root.

`index.html`'s marketing styling (`marketing.css`) deliberately uses a different token set than the app shell's `tokens.css` — an intentional, known inconsistency (distinct brand voice for the landing page), not something to "fix" as a side effect of other work.

## What's actually built

- **Scheduling** — fully built. Manager: weekly drag-and-drop calendar, Day Plan modal (coverage requirements), Employee Card modal (Smart Fill profile), Generate Shifts, Smart Fill auto-build, swap approval queue, templates. Employee: My Schedule (drop/offer a shift), Eligible Shifts (claim one).
- **Announcements** — fully built. Manager: post/pin/delete, read-receipts modal. Employee: view + explicit "Acknowledge."
- **RAG / "Ask"** — placeholder card only. Not started.

## Local dev

Requires `crewlee-be` running first (see its README) — this app has no database access of its own.

```bash
npm install
cp .env.example .env.local   # then edit as needed
npm run dev                  # nodemon, hot-reloads on file changes
```

Default: serves on `http://localhost:3000`, proxies `/api/*` to `API_URL` (default `http://localhost:8001`). Log in at `/login` with any of the demo accounts listed in `crewlee-be`'s README.

## Environment variables

See `.env.example`:

| Var | Purpose |
|---|---|
| `PORT` | Port this server listens on (default `3000`) |
| `API_URL` | Backend base URL to proxy `/api/*` to. Local: `http://localhost:8001`. Production: set automatically by `scripts/deploy.sh` |

## Config

`config.js` holds branding/copy (project name, tagline, colors) for the landing page — no secrets or DB schema live here (that's in the backend's `app/core/config.py`).

## Known limitations

See `CLAUDE.md` → Known limitations for the full list. Highlights: no tests/CI/TypeScript/linting; most user-entered strings (department names, employee names, requirement notes) are interpolated into `innerHTML` unescaped except announcement title/body, which are explicitly escaped since they broadcast one user's input to the whole team.

## Deployment

GCP Cloud Run, via `scripts/`:

- `scripts/setup.sh` — one-time GCP project setup (Cloud SQL instance, IAM). Run once.
- `scripts/deploy.sh` — deploys this service, auto-detecting the backend's Cloud Run URL for `API_URL`. Run `crewlee-be`'s deploy first.
