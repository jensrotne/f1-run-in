# F1 · The Run-In

A local F1 driver and constructor standings dashboard and championship clinch calculator. Switch between Drivers and Constructors to update standings, scenarios, charts, calendar point totals, and season results. The server binds to `127.0.0.1:5173` only and rejects unexpected Host/Origin headers. There are no deployment scripts or cloud hosting configuration.

## Run

Requires Node.js 24 (or newer).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Press Ctrl+C to stop.

## Data

The Node server fetches official Formula1.com driver and constructor standings, calendar, race session timestamps, and completed race classifications. No API key is required. Data refreshes while the page is open, with a five-minute cache. The Refresh button checks the endpoint, which may reuse data younger than five minutes. The last successful response is saved locally in `.local/season.json`; a checked-in verified 2026 snapshot is the initial fallback. Fallback data is explicitly labeled and never represented as a successful live refresh. There is no third-party results service or browser CORS proxy.

Official HTML is not a guaranteed API: if the site's markup changes, parsing may fail and the app uses its last verified same-season snapshot. It never silently substitutes another year's standings. The current year is selected by the local server.

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
```

Tests cover sprint clinches, countback, all-rival checks, eliminated drivers, custom scenarios, invalid inputs, and the verified season snapshot. The page also exposes the same scenario control through WebMCP when supported by the browser.
