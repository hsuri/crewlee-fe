# crewlee-fe

Frontend for Crewlee — a restaurant knowledge-sharing, scheduling, and announcements platform. This service is a lightweight Node/Express app: it serves the public waitlist landing page and proxies `/api/*` to the [crewlee-be](../crewlee-be) backend. No frontend framework — plain HTML/CSS/JS.

## Routes

| Route | What it serves |
|---|---|
| `/` | Waitlist landing page (hero, features, founding program, signup form) |
| `/login` | Email/password login for restaurant staff |
| `/app` | Logged-in dashboard shell — tabs for Ask (RAG), Schedule, Announcements, plus a settings panel. Tab contents are placeholders; RAG and Schedule have no backend yet |
| `/admin` | Password-gated table of waitlist signups + CSV export |
| `/api/*` | Proxied straight through to `crewlee-be` (`API_URL`) |

## Local dev

Requires `crewlee-be` running first (see its README) — this app has no database access of its own, it just proxies to the backend.

```bash
npm install
cp .env.example .env.local   # then edit as needed
npm run dev                  # nodemon, hot-reloads on file changes
```

Default: serves on `http://localhost:3000`, proxies `/api/*` to `API_URL` (default `http://localhost:8001`).

## Environment variables

See `.env.example`:

| Var | Purpose |
|---|---|
| `PORT` | Port this server listens on (default `3000`) |
| `API_URL` | Backend base URL to proxy `/api/*` to. Local: `http://localhost:8001`. Production: set automatically by `scripts/deploy.sh` |

## Config

`config.js` holds branding/copy (project name, tagline, colors) used to render the landing page — no secrets or DB schema live here anymore (that moved to the backend's `config.py`).

## Deployment

GCP Cloud Run, via `scripts/`:

- `scripts/setup.sh` — one-time GCP project setup (Cloud SQL instance, IAM). Run once.
- `scripts/deploy.sh` — deploys this service, auto-detecting the backend's Cloud Run URL for `API_URL`. Run `crewlee-be`'s deploy first.
