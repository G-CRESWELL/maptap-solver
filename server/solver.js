const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const MAPTAP_URL = 'https://maptap.gg';

const BROWSER_PROFILE_DIR = path.join(__dirname, '../.browser-profile');
const COOKIE_FILE = path.join(__dirname, '../maptap-cookies.json');

// The tutorial fires when localStorage key "maptap_history" is absent or empty.
// Source (game-init.js inline script):
//   hasSaveData = historyData && Object.keys(JSON.parse(historyData)).length > 0;
//   if (!hasSaveData) PARAMS.tutorial = 1  →  startTutorial()
//   else              PARAMS.tutorial = 0  →  startNewRound()
//
// confirmTapMode: false is critical — if true the game shows a confirmation
// button after every tap, which would block the solver waiting for a second click.
const MAPTAP_LOCALSTORAGE = {
  maptap_history: JSON.stringify({
    highScore: 1,
    streak: 1,
    soundEnabled: false,
    soundSetUp: true,
    confirmTapMode: false,
    lastPlay: 'June1',
  }),
};

const CHROME_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider',
  '--disable-background-networking',
  '--disable-client-side-phishing-detection',
  '--no-sandbox',
];

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// How long to wait after submitting a guess before the next round is ready.
// Source: game-init.js — setTimeout(() => startNewRound(), 7000 + arcDuration)
// arcDuration is 400–1500ms depending on score. We use 9500ms to be safe.
const ROUND_ADVANCE_MS = 9500;

/**
 * Opens maptap.gg and solves all 5 cities by directly calling the game's
 * own handleMapClick(lat, lng) global function with exact coordinates.
 *
 * Why direct function call instead of canvas click:
 *   The game already converts canvas pixels → lat/lng internally before
 *   calling handleMapClick. Calling it directly with the exact target
 *   coordinates is 100% accurate and avoids globe rotation alignment errors.
 *
 * @param {Array<{name: string, lat: number, lng: number}>} cities
 * @returns {Promise<Array<{name, lat, lng, clicked}|{error}>>}
 */
async function solvePuzzle(cities) {
  console.log(`Using persistent browser profile: ${BROWSER_PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    headless: false,
    slowMo: 200,
    args: CHROME_ARGS,
    userAgent: USER_AGENT,
  });

  // Inject real browser cookies if exported from Cookie-Editor extension
  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
      await context.addCookies(cookies);
      console.log(`Injected ${cookies.length} cookies from ${COOKIE_FILE}`);
    } catch (e) {
      console.warn(`Cookie injection failed (non-fatal): ${e.message}`);
    }
  }

  // Inject maptap_history before page JS runs so hasSaveData = true → tutorial skipped
  await context.addInitScript((storageData) => {
    for (const [key, value] of Object.entries(storageData)) {
      try { localStorage.setItem(key, value); } catch (_) {}
    }
  }, MAPTAP_LOCALSTORAGE);

  const page = await context.newPage();
  const results = [];

  try {
    console.log('Navigating to MapTap...');
    // 'load' instead of 'networkidle' — TileGlobe continuously loads map tiles
    // so the network never becomes idle, causing a 30s timeout with networkidle.
    await page.goto(MAPTAP_URL, { waitUntil: 'load', timeout: 30000 });

    // Wait for the canvas to appear
    await page.waitForSelector('canvas', { timeout: 15000 });
    console.log('Canvas found. Waiting for window.myGlobeReady...');

    // window.myGlobeReady is a Promise the game resolves when the globe and all
    // click handlers are fully wired up. Polling it avoids hardcoded sleep times.
    await page.waitForFunction(() => {
      return window.myGlobeReady instanceof Promise &&
             typeof window.handleMapClick === 'function' &&
             typeof window.myGlobe !== 'undefined';
    }, { timeout: 20000 });
    console.log('Globe ready. Starting solve...');

    // Rotate globe to face first city as a visual cue that the solver is running
    await page.evaluate(({ lat, lng, alt }) => {
      window.myGlobe.pointOfView({ lat, lng, altitude: alt }, 1500);
    }, { lat: cities[0].lat, lng: cities[0].lng, alt: 1.5 });
    await page.waitForTimeout(1800);

    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      console.log(`\n[${i + 1}/${cities.length}] Guessing: ${city.name} (${city.lat}, ${city.lng})`);

      // Rotate globe to the target city so the viewer can see where we're clicking
      await page.evaluate(({ lat, lng }) => {
        window.myGlobe.pointOfView({ lat, lng, altitude: 1.5 }, 800);
      }, { lat: city.lat, lng: city.lng });
      await page.waitForTimeout(900);

      // Call the game's own click handler directly with exact coordinates.
      // This is the same function the globe fires after converting a canvas
      // pixel click to lat/lng — calling it directly guarantees perfect accuracy.
      await page.evaluate(({ lat, lng }) => {
        window.handleMapClick(lat, lng);
      }, { lat: city.lat, lng: city.lng });
      console.log(`  Called handleMapClick(${city.lat}, ${city.lng})`);

      results.push({ name: city.name, lat: city.lat, lng: city.lng, clicked: true });

      if (i < cities.length - 1) {
        // Wait for scoring animation + round advance before the next city.
        // Source: setTimeout(() => startNewRound(), 7000 + arcDuration)
        // arcDuration ~ 400–1500ms, so 9500ms covers the worst case.
        console.log(`  Waiting ${ROUND_ADVANCE_MS}ms for round to advance...`);
        await page.waitForTimeout(ROUND_ADVANCE_MS);
      }
    }

    console.log('\nAll cities solved! Waiting to see final score...');
    await page.waitForTimeout(10000);

  } catch (err) {
    console.error('Solver error:', err);
    results.push({ error: err.message });
  } finally {
    await context.close();
  }

  return results;
}

module.exports = { solvePuzzle };
