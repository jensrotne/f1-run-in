# F1 · The Run-In

A local F1 driver and constructor standings dashboard and championship clinch calculator. Switch between Drivers and Constructors to update standings, scenarios, charts, calendar point totals, and season results. The server binds to `127.0.0.1:5173` only and rejects unexpected Host/Origin headers. There are no deployment scripts or cloud hosting configuration.

## Run

Requires Node.js 24+, Go 1.26+, and PostgreSQL 17. Follow the [root startup instructions](../README.md) to start PostgreSQL and the Go API, then run `npm install` and `npm run dev` here. Open http://127.0.0.1:5173. Press Ctrl+C in each server terminal to stop; SIGTERM also shuts down cleanly. Database data survives normal shutdown.

## Data

The Go API on `127.0.0.1:5174` owns `GET /api/season`, refresh coordination, and PostgreSQL persistence. Node/Vite proxies the route without changing JSON or cached provenance. Backend unavailability returns an explicit 503 error. The API runs the existing official Formula1.com parser in a bounded Node subprocess (90 seconds, 16 MiB JSON output). No API key is required.

Complete season documents include drivers, constructors, calendar, GP/sprint classifications, countback flags and sources. A refresh is validated and committed as one PostgreSQL JSONB upsert before it can be served as live. Concurrent requests share one refresh. Fresh official snapshots are reused for five minutes, including after backend restart; the Refresh button may reuse fresh data. Migrations run transactionally at startup, serialize concurrent application and record versions. `cd backend && go run . migrate` from the repository root also applies them explicitly and safely more than once.

If official ingestion or persistence fails, the API serves only its last committed same-season snapshot with `source: cached`, a warning and the original `fetchedAt`. Without a same-year snapshot it returns 503. A verified checked-in snapshot can bootstrap an empty database only for its own year and is labeled cached. Official markup can change and cause parsing failure. The current UTC year is selected by Go. Existing `site/.local/season.json` files are no longer read or written. PostgreSQL is the only runtime persistence store.

Both HTTP servers reject unexpected Host/Origin headers. Remote database targets are rejected. Keep credentials in your shell or untracked root `.env`; use the loopback PostgreSQL publication described in the root README. No third-party results service, browser CORS proxy, or deployment workflow is used.

## Season results

The season results section shows Grand Prix and sprint winners, plus official circuit artwork on each GP card. Select a weekend and switch between Grand Prix and Sprint to view its full classification, including laps, time or retirement status, and awarded points. In Constructors mode, results combine the points awarded to both cars under their actual race team, with both driver finishes shown. GP cards highlight the team with the most session points. Upcoming sessions show no results yet. Only Grand Prix classifications are used for championship countback; sprint results contribute points but never race wins.

## Championship calculations

- Drivers: remaining capacity = 25 per unclassified Grand Prix + 8 per unclassified Sprint.
- Constructors: remaining capacity = 43 per Grand Prix (P1/P2) + 15 per Sprint (P1/P2). The official constructor standings are authoritative; totals are not inferred from current driver affiliations.
- Constructor countback combines both cars’ Grand Prix finishes. A rival at its maximum final score must finish first and second in every remaining GP; both finishes are included. Sprint finishes are excluded.
- Constructor scenarios: earliest assumes P1/P2 with all rivals scoring zero; pressure assumes P1/P2 with each rival independently bounded by P3/P4; custom lets you choose four car finishes, with distinct scoring positions.
- A driver is uncatchable once their points exceed every other driver's maximum final points. Equal points also clinch if Grand Prix countback is guaranteed.
- Countback uses completed race classifications: wins, seconds, thirds, etc. Rivals at their maximum final score must win every remaining Grand Prix; those wins are included in the comparison. Unresolved countbacks and missing countback data remain open. Qualifying countback is not evaluated.
- Earliest possible: selected driver wins all future sessions; every rival scores zero.
- Keep the pressure on: selected driver wins; each rival's score is bounded independently by second place.
- Custom: chosen finishing positions apply in every remaining race and sprint. Each rival is independently bounded by the rival position. This is a conservative bound, rather than a claim that multiple rivals can occupy one position. Outside points / DNF earns zero.
- Scoring positions cannot be shared. At most 8 drivers score in a sprint.

The app evaluates sprint and Grand Prix sessions independently, including possible Saturday clinches. Projections assume full points, unchanged future calendar, and no subsequent penalties. F1 points and countback rules are linked to the FIA's 2026 regulations in the UI.

## Verify

```sh
npm test
npm run check
cd ../backend
go test -race ./...
go vet ./...
```

Tests cover sprint clinches, countback, all-rival checks, eliminated drivers, custom scenarios, invalid inputs, and the verified season snapshot. The page also exposes the same scenario control through WebMCP when supported by the browser.

Backend integration tests require an isolated local database (they replace the current-year fixture and briefly install a write-rejection trigger):

```sh
cd backend # from repository root
TEST_DATABASE_URL="$DATABASE_URL" go test -race -run TestPostgresIntegration -v
```

Without `TEST_DATABASE_URL`, this database test is explicitly skipped. The suite verifies migration replay, persisted data across new connections, same-year fallback and atomic write-failure behavior. Unit tests cover refresh coordination, malformed/wrong-year ingestion, write failures, Host/Origin/method guards and subprocess cancellation/output bounds. Node proxy tests require free loopback port 5174; stop the API before `npm test`.

For deterministic end-to-end QA, `F1_INGEST_SCRIPT=/absolute/path/to/fixture.mjs go run .` selects an ingestion adapter script that receives the year as its first argument and writes a valid Season JSON document to stdout. This is an operator-only test hook; the normal adapter calls official `fetchSeason`. To force a stale refresh, use a fixture with an old `fetchedAt` and then change the adapter to fail; cached responses must retain that timestamp and warning. Never point integration tests at a database whose data you need to keep.

Run the complete deterministic stack check after the database test above has left a stale current-year fixture. Stop any existing frontend/backend first:

```sh
TEST_DATABASE_URL="$DATABASE_URL" node site/scripts/verify-stack.mjs # repository root
```

This builds the Go API, starts both listeners, verifies database-backed responses, stale upstream-failure fallback and fresh restart reuse, then stops both processes with SIGTERM. It uses temporary fixture scripts and removes them afterward. Ports 5173 and 5174 must be free. The separate Go integration test verifies migration replay and real write rejection.
