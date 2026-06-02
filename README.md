# MapTap Solver

Automatically solves the daily [maptap.gg](https://maptap.gg) geography puzzle. Fetches today's 5 cities, displays them in a control panel UI, and drives a real browser to click each location on the 3D globe.

![React UI + Playwright browser automation](https://img.shields.io/badge/stack-React%20%2B%20Express%20%2B%20Playwright-blue)

---

## How It Works

1. **Fetch** — Express backend fetches today's puzzle from `maptap.gg/data/this_day_in_history/<MonthDay>.js` and parses it
2. **Display** — React frontend shows each city's name, latitude, and longitude
3. **Solve** — Playwright opens a real Chromium browser, waits for the globe to initialize, then calls the game's own `handleMapClick(lat, lng)` function directly with exact coordinates for each city

---

## Prerequisites

- **Node.js 18+** — install via [nvm](https://github.com/nvm-sh/nvm) (recommended) or the [Node.js installer](https://nodejs.org)
- **Git**

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/G-CRESWELL/maptap-solver.git
cd maptap-solver

# 2. Install dependencies
npm install

# 3. Install the Playwright Chromium browser
npx playwright install chromium
```

> **Linux users:** If `npx playwright install chromium` fails due to an unsupported OS version, try:
> ```bash
> npx playwright@1.40.0 install chromium
> ```

---

## Running

### Option A — Both servers at once (recommended)

```bash
npm run start
```

Then open **http://localhost:5173** in your browser.

### Option B — Separate terminals

```bash
# Terminal 1 — backend (port 3001)
node server/index.js

# Terminal 2 — frontend (port 5173)
npm run dev
```

### Option C — If `npm` isn't in your PATH (nvm users)

```bash
./run.sh          # starts both frontend + backend
./run.sh server   # backend only
./run.sh dev      # frontend only
```

---

## Usage

1. Click **Fetch Today's Puzzle** — the 5 cities appear as cards with coordinates
2. Click **Auto-Solve** — a Chromium window opens and plays the game automatically
3. Watch the browser solve each round; your final score appears after all 5 cities

---

## Project Structure

```
maptap-solver/
├── server/
│   ├── index.js          # Express API — /api/puzzle and /api/solve routes
│   ├── puzzleProxy.js    # Fetches + parses today's city data from maptap.gg
│   └── solver.js         # Playwright automation — opens browser, clicks globe
├── src/
│   ├── App.jsx           # Root React component — fetch/solve state machine
│   ├── components/
│   │   ├── CityCard.jsx      # Displays one city (name, lat, lng, status)
│   │   ├── SolverControls.jsx # Fetch / Auto-Solve buttons
│   │   └── StatusLog.jsx     # Real-time log panel
│   └── services/
│       └── puzzleService.js  # fetch() wrappers for /api/puzzle and /api/solve
├── run.sh            # Helper script that sources nvm before running npm
├── vite.config.js    # Vite dev server — proxies /api/* to Express on port 3001
└── tailwind.config.js
```

---

## How the Solver Works

### Puzzle Fetching

`maptap.gg` serves each day's cities as a JavaScript variable assignment:

```js
// https://maptap.gg/data/this_day_in_history/June2.js?v=1
cities = [
  { name: "Oakland, California", lat: 37.8044, lng: -122.2712, ... },
  ...
]
```

The backend evaluates this in a Node.js `vm` sandbox (no `window`, no `process`, no `require`) and returns clean `{ name, lat, lng }` objects.

### Globe Automation

Rather than rotating the globe and clicking canvas pixels (error-prone), the solver calls the game's own internal function directly:

```js
// handleMapClick is a global defined in maptap.gg's inline game script.
// It's the same function the globe fires after converting a canvas pixel click
// to lat/lng coordinates — calling it with exact coordinates is 100% accurate.
window.handleMapClick(lat, lng);
```

The solver waits for `window.myGlobeReady` (the game's own Promise) before interacting, so it never fires before the globe is fully initialized.

### Session Persistence

To skip the new-user tutorial on every run, the solver injects a fake `maptap_history` entry into `localStorage` before the page loads:

```js
// game-init.js checks this to decide tutorial vs. game:
// if (!hasSaveData) PARAMS.tutorial = 1  →  startTutorial()
// else              PARAMS.tutorial = 0  →  startNewRound()
localStorage.setItem('maptap_history', JSON.stringify({ highScore: 1, ... }));
```

A persistent browser profile (`.browser-profile/`) is also saved to disk so cookies and storage survive between runs.

---

## Optional: Logged-In Session

To have your scores saved to your maptap.gg account:

1. Install the **Cookie-Editor** Chrome extension
2. Go to maptap.gg while logged in → Cookie-Editor → Export All → JSON
3. Save the file as `maptap-cookies.json` in the project root

The solver will detect and inject these cookies automatically on every run. The file is gitignored since it may contain auth tokens.

---

## Troubleshooting

**`npm: command not found`**
Your terminal doesn't auto-load nvm. Use `./run.sh` instead, or run:
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && npm run start
```

**Puzzle fetch returns 404**
The URL format is `/<MonthDay>.js` (e.g. `June2.js`). If it breaks, check `server/puzzleProxy.js` — the `getPuzzleUrl()` function builds it from today's date. Run the server and check the console for the URL it's fetching.

**Solver times out on navigation**
Make sure you're on `waitUntil: 'load'` in `server/solver.js` (not `networkidle` — the tile-loading globe keeps the network permanently active).

**Game doesn't advance after first city**
The round advance delay is `9500ms` (`ROUND_ADVANCE_MS` in `server/solver.js`). If your connection is slow and the arc animation runs long, increase this value.

**Chromium crashes on Linux**
Add `--no-sandbox` to `CHROME_ARGS` in `server/solver.js` if it's not already there. This is required in many Linux environments without a user namespace setup.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind CSS |
| Backend | Node.js 20 + Express |
| Browser automation | Playwright (Chromium) |
| Globe API | maptap.gg's `window.myGlobe` + `handleMapClick()` |

---

## License

MIT
