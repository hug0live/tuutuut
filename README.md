# tuutuut

React + Vite + TypeScript web app to track upcoming bus arrivals in real time.

The app provides a simple interface to quickly inspect a stop and see:

- the lines serving that stop
- the selected direction
- upcoming arrivals
- vehicles currently observed on the route
- up to 2 stops tracked in parallel

## How It Works

The user starts by choosing a city or transport network, then searches for a stop.

Once a stop is selected, the app lets the user choose a direction and one or more lines to display a compact dashboard. The interface combines static network data with real-time data to estimate upcoming arrivals and visualize vehicle positions.

Static transport data is bundled with the project. Real-time data is fetched through `bus-tracker.fr`.

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

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```
