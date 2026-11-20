# Docker deploy (office server / another device)

Run the full app (API + UI + Postgres) with one command. Existing entered data is kept via the host `data/` folder and a Postgres volume.

## What you need on the machine

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine + Compose
- This project folder, **including** `data/ops-state.json` (copy from the machine that already has the data)

## Start

```bash
cd NHIH_Dashboard

# Optional: set a strong operator PIN / DB password
cp .env.docker.example .env
# edit .env

docker compose up -d --build
```

Open **http://localhost:8787** (or `http://<office-server-ip>:8787`).

Stop:

```bash
docker compose down
```

Data stays in:

- Docker volume `nhih_pgdata` (Postgres — source of truth)
- `./data/ops-state.json` (JSON mirror, updated as the app writes)

## Moving to another device with existing data

1. On the current machine, ensure `data/ops-state.json` is up to date (the app writes it whenever Postgres saves).
2. Copy the whole project folder (at least `data/`, `docker-compose.yml`, `Dockerfile`, source, etc.).
3. On the new machine: `docker compose up -d --build`.
4. On **first** boot with an empty Postgres volume, the entrypoint imports the richest snapshot from:
   - `data/ops-state.json` (preferred), or
   - `backups/nhih-ops-state-latest.json`

Later boots keep whatever is already in Postgres and do not overwrite it.

## Useful commands

```bash
# Logs
docker compose logs -f app

# Health
curl -s http://localhost:8787/api/health

# Rebuild after code changes
docker compose up -d --build

# Reset DB only (keeps ./data — re-seeds from ops-state.json on next start)
docker compose down -v
docker compose up -d --build
```

## Notes

- Default operator desk code is `nhih-ops` unless you set `OPERATOR_CODE` in `.env`.
- **Visitor Register security:** The Visitor Register (`GET /api/visitors` and all visitor write endpoints) **requires** a configured non-default `OPERATOR_CODE` in `.env` and rejects the default `nhih-ops` code. Only the aggregate checked-in count (`GET /api/visitors/summary`) is public.
- Change `POSTGRES_PASSWORD` before putting this on a shared office network.
- Vercel / Upstash Redis are not used in this stack (`PERSISTENCE=postgres` only).

## Visitor Register & Google Sheets setup

The Visitor Register stores visits and attendance events (`registered`, `checked_in`, `checked_out`) in PostgreSQL (`visitor_visits` and `visitor_events` tables) and syncs registrations from Google Sheets on the server using a **read-only** service account.

1. Create a Google Cloud service account and enable the **Google Sheets API**.
2. Share the visitor spreadsheet (`1uf2AK5_YhOZd0bHiigN3TsH-TToR6KMeH1AYiIYW33w`) with the service account email as **Viewer** (read-only).
3. In `.env` (copied from `.env.docker.example`), set:
   - `OPERATOR_CODE=<strong-non-default-secret>`
   - `GOOGLE_SHEETS_SPREADSHEET_ID=1uf2AK5_YhOZd0bHiigN3TsH-TToR6KMeH1AYiIYW33w`
   - `GOOGLE_SHEETS_TAB_NAME=Form Responses 1`
   - One credential method (never commit keys to git or expose them via `VITE_*`):
     - **Key file (recommended):** save the JSON key under `./secrets/google-service-account.json`, uncomment the read-only volume mount in `docker-compose.yml`, and set `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/run/secrets/google-service-account.json`.
     - **Inline JSON:** set `GOOGLE_SERVICE_ACCOUNT_JSON=<minified-json>`.
     - **Separate vars:** set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
4. Only the submission timestamp, full name, organization or unit, and visit purpose are imported. Emails and phone numbers remain in the source sheet.
5. Restart the stack: `docker compose up -d --build`.
