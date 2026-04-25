# tuutuut

React + Vite + TypeScript web app to track upcoming public transport arrivals in real time.

The app provides a simple interface to quickly inspect a stop and see:

- the lines serving that stop
- the selected direction
- upcoming arrivals
- vehicles currently observed on the route
- up to 2 stops tracked in parallel

## How It Works

The user starts by choosing a city or transport network, then searches for a stop.

Once a stop is selected, the app lets the user choose a direction and one or more lines to display a compact dashboard. The interface combines static network data with real-time data to estimate upcoming arrivals and visualize vehicle positions.

Static transport data is bundled with the project. Real-time data is fetched through the shared `bus-tracker.fr` provider.

## Supported Cities

The app currently supports:

- Lyon · TCL
- Clermont-Ferrand · T2C
- Bordeaux · TBM

Each city has its own static catalog and per-city persisted selections. Real-time vehicle positions and waiting-time estimates use the shared `bus-tracker` provider architecture for every supported city.

## Data Sources

Bundled catalogs are generated from official GTFS snapshots:

- `src/tclBusCatalog.json`
- `src/t2cBusCatalog.json`
- `src/tbmBusCatalog.json`

Theoretical schedules are used as fallback waiting times when `bus-tracker` data is missing, stale, or incomplete.

Catalog generation scripts live in `scripts/`:

```bash
python3 scripts/build_tcl_bus_catalog.py
python3 scripts/build_t2c_bus_catalog.py
python3 scripts/build_tbm_bus_catalog.py
```

Each script reads its GTFS zip from `/tmp` by default, or from the matching environment variable:

- `TCL_GTFS_ZIP`
- `T2C_GTFS_ZIP`
- `TBM_GTFS_ZIP`

## Run Locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The app is then usually available at `http://localhost:5173`.

In local development, Vite proxies API calls so the app can query the real-time data source during development.

## Build

Run regression tests:

```bash
npm test
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```
