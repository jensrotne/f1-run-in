# F1 championship break-even

Local-only Formula 1 standings, results, and championship clinch calculator. A Go API owns official-source ingestion and PostgreSQL season snapshots; Node/Vite serves the dashboard.

Requires Node.js 24+, Go 1.26+, and PostgreSQL 17 (native or Docker Compose).

```sh
npm run setup
export POSTGRES_PASSWORD='choose-a-local-password'
docker compose up -d --wait db
export DATABASE_URL="postgres://f1:${POSTGRES_PASSWORD}@127.0.0.1:55432/f1?sslmode=disable"
# Choose a URL-safe password, or URL-encode it in DATABASE_URL.
cd backend
go run . migrate  # safe to repeat; startup also applies migrations
go run .
```

In a second terminal, from the repository root:

```sh
npm run dev
```

Open http://127.0.0.1:5173. The frontend and API bind only to loopback on ports 5173 and 5174. PostgreSQL's supplied port publication binds to `127.0.0.1:55432`, avoiding existing services on 5432. No deployment configuration is included.

Stop each server with Ctrl+C (SIGTERM also works), then `docker compose stop db`. Restart with `docker compose up -d --wait db` and the same commands/environment. The named volume retains data. `docker compose down` also retains it; **`docker compose down -v` deletes the database**. Do not remove volumes to stop the app. Native PostgreSQL may instead use a loopback address or local Unix socket in `DATABASE_URL`.

Credentials belong in your shell or an untracked root `.env`; never commit them. Docker Compose reads `.env`; export `DATABASE_URL` separately for Go. A missing/unreachable database or failed migration stops backend startup explicitly. The API never falls back to file storage. See [the app README](site/README.md) for data semantics and verification, and [ADR 0001](docs/adr/0001-local-go-api-postgresql.md) for the architecture proposal.
