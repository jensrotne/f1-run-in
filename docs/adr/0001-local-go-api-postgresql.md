# Local Go API with PostgreSQL season snapshots

Status: Proposed

Date: 2026-11-04

Issue: [JEN-5](https://linear.app/f1-run-in/issue/JEN-5/backend-api-for-indexing-with-persistent-storage)

## Context and requirements

The application currently serves `GET /api/season` from the Node/Vite local
server. `site/lib/f1-source.mjs` fetches and validates official standings,
calendar, and GP/sprint classifications. `site/scripts/local-server.mjs` owns
a five-minute cache and writes `.local/season.json`. The UI and championship
calculator consume a complete season document described by `site/lib/types.ts`.
The checked-in `site/lib/snapshot.json` supplies a verified initial fallback.

JEN-5 requires a Go backend, PostgreSQL persistent storage with migrations,
and local-only operation. We interpret indexing as ingestion of the existing
official season dataset; the issue does not require search, historical browsing,
independent entity APIs, or a new scoring implementation.

## Options considered

1. Rewrite ingestion in Go and normalize every entity into relational tables.
   This eliminates the Node parser dependency but duplicates substantial parsing
   and matching logic, creates more migration surface, and adds no demonstrated
   benefit for the existing whole-season read contract.
2. Keep Node as the ingestion service and make Go only a persistence proxy.
   This reuses parsing but splits refresh ownership between servers and leaves
   the principal backend behavior in Node.
3. Give Go refresh, persistence, and API ownership; reuse the JavaScript parser
   through a subprocess and store complete season documents in PostgreSQL.
   This preserves tested ingestion behavior with one clear data owner, at the
   cost of retaining Node as a backend runtime dependency.

## Decision and rationale

Recommend option 3. Go owns `GET /api/season`, refresh coordination, PostgreSQL
access, and migrations. Node/Vite serves the frontend and proxies the existing
same-origin API route to the loopback Go listener. The browser contract remains
the existing Season JSON document and existing error handling.

Go invokes a small Node command that calls the existing `fetchSeason(year)`
implementation and emits JSON. Invoke the executable directly without a shell,
pass a validated year, bound execution time and output, and cancel the child
when the backend shuts down. Keep parsing and championship rules in their
existing modules. The Node command has no database or cache ownership.

Use a PostgreSQL table keyed by season year containing the complete JSONB season
document and its fetch timestamp. Replace a season atomically after validation;
readers must never see a partially indexed season. No separate tables or query
API are required for drivers, constructors, races, or results at this stage.

## Contracts and invariants

- Preserve the five-minute freshness policy, current UTC year selection, and
  single-flight refresh behavior. Concurrent requests must share one ingestion
  attempt rather than start duplicate subprocesses.
- Validate the requested year, timestamp, and required season fields before
  persistence. A malformed document must not replace the last valid snapshot.
- Commit the replacement before reporting a successful refresh. A failed fetch,
  parse, or database write must not become a successful live response.
- On refresh failure, serve the last committed same-year snapshot with cached
  provenance and a warning, retaining its original `fetchedAt`. Never silently
  substitute a different year. Without valid same-year data return an explicit
  unavailable response compatible with the existing UI.
- The checked-in verified snapshot may bootstrap an empty database, with cached
  provenance; loading a fallback must not manufacture a new successful fetch
  timestamp. PostgreSQL becomes the authoritative runtime persistence layer.
- Stop writing `.local/season.json`. Importing a valid existing file is optional
  compatibility work, not a prerequisite. Existing local files can remain
  untouched; document that they are no longer updated.
- Run ordered versioned SQL migrations transactionally, record applied versions,
  and serialize migration application so a restart or concurrent startup cannot
  apply a migration twice. Database or migration failure at startup must produce
  an actionable error, not silently start a file-backed replacement service.
- Bind both HTTP listeners to loopback, validate Host and Origin, and retain
  same-origin browser requests. Do not add wildcard CORS or configurable public
  bind addresses. Validate requests at Go as well as the frontend proxy.
- PostgreSQL configuration must target a local connection (loopback or local
  Unix socket). Any container port mapping binds explicitly to loopback and
  uses persistent storage. No cloud/deployment configuration is introduced.
- Keep connection credentials and runtime data out of tracked files. Logs may
  identify refresh/database failures but must not print credential-bearing DSNs.

## Consequences

Go is the single backend owner while existing frontend and calculation behavior
remain compatible. PostgreSQL adds installation and startup requirements, and
Node remains necessary for ingestion. JSONB deliberately favors atomic reads
and compatibility over relational queries; future query requirements may
justify a separate schema decision. The five-minute policy still means Refresh
may reuse recently indexed data.

## Migration and rollback

Initial migrations create the version ledger and season storage. Startup and
rerun behavior must be documented. A persistent PostgreSQL volume must survive
normal shutdown/restart; removal is an explicit data deletion action.

Rollback to the previous application revision can use its existing checked-in
or local JSON fallback; PostgreSQL data need not be deleted. Do not implement an
automatic destructive down-migration. Future incompatible schema changes need
their own compatibility and rollback plan.

## Validation

- Run existing parser/calculator tests and TypeScript checks.
- Exercise Go API method handling, locality checks, malformed ingestion,
  freshness, concurrent refresh, cancellation, same-year fallback, and
  different-year rejection with deterministic fixtures.
- Against real PostgreSQL, apply migrations to an empty database and rerun them;
  persist a fixture, restart the backend, and verify equivalent returned data.
  Verify failed indexing cannot overwrite the previous valid document.
- Verify frontend requests reach Go and both championship modes consume the
  unchanged contract. Exercise backend/database unavailability and cached
  warning visibility.
- Inspect listeners and any database port mapping for loopback-only operation.
  An unavailable PostgreSQL runtime leaves integration validation incomplete;
  mocked storage tests alone do not establish persistence correctness.

## Related evidence and open questions

Current behavior is defined by `site/scripts/local-server.mjs`,
`site/lib/f1-source.mjs`, `site/lib/types.ts`, and `site/README.md`.
There are no earlier repository ADRs to supersede. No requirement currently
justifies additional endpoints, historical indexing, or relational projections.
This recommendation remains Proposed pending human review; its presence does
not claim the design has been implemented or validated.
