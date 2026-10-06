# F1 · The Run-In

A local F1 standings dashboard and championship clinch calculator. The server binds to `127.0.0.1:5173` only and rejects unexpected Host/Origin headers. There are no deployment scripts or cloud hosting configuration.

## Run

Requires Node.js 24 (or newer).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Press Ctrl+C to stop.

## Data

The Node server fetches official Formula1.com standings, calendar, race session timestamps, and completed race classifications. No API key is required. Data refreshes while the page is open, with a five-minute cache. The Refresh button checks the endpoint, which may reuse data younger than five minutes. The last successful response is saved locally in `.local/season.json`; a checked-in verified 2026 snapshot is the initial fallback. Fallback data is explicitly labeled and never represented as a successful live refresh. There is no third-party results service or browser CORS proxy.

Official HTML is not a guaranteed API: if the site's markup changes, parsing may fail and the app uses its last verified same-season snapshot. It never silently substitutes another year's standings. The current year is selected by the local server.

## Championship calculations

- Remaining capacity = 25 per unclassified Grand Prix + 8 per unclassified Sprint.
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
