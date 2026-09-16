# NHIH — Local Development Guide

## Architecture (local)

```text
Browser / other Wi‑Fi device
        ↓  http://<MAC-IP>:5173
Vite (React)  →  proxies /api → 127.0.0.1:8787
        ↓
Hono API (0.0.0.0:8787)
        ↓  PERSISTENCE=postgres
Local PostgreSQL (nhih_ops)
```

Production on Vercel continues to use **Upstash Redis** and is not switched to Postgres.

## 1. Requirements

- Node.js 20+
- PostgreSQL on macOS (this machine already has Homebrew PostgreSQL 14 accepting connections on port 5432)

If Postgres were missing:

```bash
brew install postgresql@14
brew services start postgresql@14
```

## 2. Installing dependencies

```bash
npm install
```

## 3. Starting the database

```bash
brew services start postgresql@14   # if not already running
pg_isready                          # should say accepting connections
```

Database and role created for local use:

| Item | Value |
|------|--------|
| Database | `nhih_ops` |
| User | `nhih_local` |
| Password | `nhih_local_dev` |
| URL | `postgresql://nhih_local:nhih_local_dev@127.0.0.1:5432/nhih_ops` |

## 4. Running migrations / schema

```bash
cp .env.example .env.local   # if you do not already have .env.local
# Ensure PERSISTENCE=postgres and DATABASE_URL are set
npm run db:setup
```

Schema file: `db/schema.sql`

## 5. Importing development data

Redis snapshot backup (read-only export; production untouched):

```text
backups/nhih-ops-state-latest.json
backups/nhih-ops-state-<timestamp>.json
backups/*.meta.json   (sha256 + counts)
```

Import into local Postgres:

```bash
npm run db:import
# or:
npx tsx scripts/import-ops-to-postgres.ts backups/nhih-ops-state-latest.json
```

### Restore notes

- **Local Postgres again:** re-run `npm run db:import` (replaces local table rows from the JSON backup).
- **Production Redis:** only if you intentionally need disaster recovery — `SET nhih-ops-state` with the JSON file contents via Upstash. **Do not do this casually.** Local development never writes to Redis while `PERSISTENCE=postgres`.

## 6–7. Starting backend and frontend

One command (recommended):

```bash
npm run dev
```

Or two terminals:

```bash
npm run dev:api   # http://0.0.0.0:8787
npm run dev:web   # http://0.0.0.0:5173
```

Health check:

```bash
curl -sS http://127.0.0.1:8787/api/health
# expect: "storage":"postgres"
```

## 8. Finding your Mac’s local IP

```bash
ipconfig getifaddr en0
# or
ipconfig getifaddr en1
```

## 9. Accessing NHIH from another device (LAN)

| Surface | URL |
|---------|-----|
| Dashboard | `http://<MAC-IP>:5173` |
| Operator desk | `http://<MAC-IP>:5173/desk` |

Vite already uses `host: true`. The API binds `0.0.0.0:8787`. Other devices should use **port 5173** so `/api` is proxied through Vite to the local API.

macOS may prompt to allow Node/Vite through the firewall the first time — allow it for LAN access.

CORS is already `origin: *` for the API. Auth is the operator PIN via `X-Operator-Code` + `sessionStorage` (not cookies), so LAN clients work the same as localhost after unlocking `/desk`.

Do **not** port-forward this to the public internet.

## 10. Authentication

Still the shared **operator code** (`OPERATOR_CODE` / default local `nhih-ops`). No multi-user login and no change required for Postgres. Unlock on `/desk`; mutating API calls send `X-Operator-Code`.

## 11. Notifications

Not implemented yet (activity `events` feed only). Web Push / notification center are future work.

## 12. Troubleshooting

| Symptom | Check |
|---------|--------|
| `storage` is `kv` not `postgres` | `.env.local` must have `PERSISTENCE=postgres` and API restarted |
| Connection refused :5432 | `brew services start postgresql@14` |
| Empty hub | `npm run db:import` |
| Other device can’t connect | Same Wi‑Fi; Mac firewall; use Mac LAN IP + `:5173` |
| Accidentally worried about Redis | With `PERSISTENCE=postgres`, KV env vars are ignored |

## 13. How to stop everything

- Stop `npm run dev` with Ctrl+C
- Optional: `brew services stop postgresql@14` (only if you want Postgres off)

## 14. Reset local environment safely

```bash
# Wipe local Postgres hub tables by re-importing backup
npm run db:import

# Or empty seed (destructive to LOCAL data only):
# Use desk reset only against local API — never against production
```

Does **not** delete Upstash Redis or Vercel data.

## 15. Eventually deploying to Heroku

Later (not now):

- Build: `npm run build`
- Run: `npm start` (serves API + `dist` static)
- Add Heroku Postgres **or** keep Redis — production today is Redis JSON; switching production to Postgres would require setting `PERSISTENCE=postgres` + `DATABASE_URL` on Heroku only after a planned cutover
- Set `OPERATOR_CODE`, HTTPS, CORS as needed
- Scheduled overdue tick already runs in the Node process via `setInterval`

## Blob

The app does **not** require Vercel Blob for normal operation. Live storage is Redis (`storage: kv`). Blob is optional recovery behind `ENABLE_BLOB`. No Blob export was performed.

## Safety rules

- Production Vercel env: leave unchanged; do not set `PERSISTENCE=postgres` there.
- Local: `PERSISTENCE=postgres` → API never reads/writes Redis or Blob.
- Backups live under `backups/` (gitignored).
