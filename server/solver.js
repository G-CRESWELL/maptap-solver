const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const MAPTAP_URL = 'https://maptap.gg';

// Persistent profile directory — survives between runs so cookies/localStorage
// are preserved. First run: manually dismiss the tutorial in the browser window.
// Every run after that: the profile remembers and the tutorial is skipped.
const BROWSER_PROFILE_DIR = path.join(__dirname, '../.browser-profile');

// Optional: export your real Chrome cookies from maptap.gg using the
// "Cookie-Editor" extension, save as maptap-cookies.json next to this file,
// and they'll be injected on every run (useful if the game requires login).
const COOKIE_FILE = path.join(__dirname, '../maptap-cookies.json');

// Known localStorage keys that control first-run / tutorial state on maptap.gg.
// Add more keys here if you find them via DevTools → Application → Local Storage.
// These are injected via addInitScript so the page sees them before its JS runs.
const MAPTAP_LOCALSTORAGE = {
  hasSeenTutorial: 'true',
  hasPlayedBefore: 'true',
  tutorialComplete: 'true',
  onboardingDone: 'true',
};

const CHROME_ARGS = [
  '--disable-blink-features=AutomationControlled',
  // Suppress Chrome UI features that crash on Ubuntu 26.04 (ProfileMenuView DCHECK)
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider',
  '--disable-background-networking',
  '--disable-client-side-phishing-detection',
  '--no-sandbox',
];

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Injected into the browser page to rotate the 3D globe to face a given lat/lng.
// Tries four strategies in order of reliability:
//   1. OrbitControls API (Three.js controls exposed on window)
//   2. globe.gl pointOfView()
//   3. React fiber walk (stub — extend if needed)
//   4. Synthetic pointer drag fallback
const ROTATE_GLOBE_SCRIPT = `
async function rotateGlobeTo(lat, lng) {
  await new Promise(r => setTimeout(r, 300));

  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  // Strategy 1: Three.js OrbitControls exposed on window
  const possibleControls = [
    window.controls,
    window.orbitControls,
    window.globeControls,
    window.threeControls,
  ].filter(Boolean);

  for (const ctrl of possibleControls) {
    if (ctrl && typeof ctrl.setAzimuthalAngle === 'function') {
      ctrl.setAzimuthalAngle(-lngRad);
      ctrl.setPolarAngle(Math.PI / 2 - latRad);
      ctrl.update();
      return 'controls-api';
    }
  }

  // Strategy 2: globe.gl library instance
  if (window.__globe__ && typeof window.__globe__.pointOfView === 'function') {
    window.__globe__.pointOfView({ lat, lng, altitude: 1.5 }, 800);
    await new Promise(r => setTimeout(r, 900));
    return 'globe-gl-pov';
  }

  // Strategy 3: React fiber walk (extend here if globe is buried in component state)
  const root = document.querySelector('#root') || document.querySelector('[data-reactroot]');
  if (root && root._reactFiber) {
    // Deep fiber walk would go here — add if strategies 1 & 2 both miss
  }

  // Strategy 4: Synthetic mouse-drag fallback (approximate)
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('No canvas found');

  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dragX = -lng * (rect.width / 360);
  const dragY = lat * (rect.height / 180);

  canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + dragX, clientY: cy + dragY, bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: cx + dragX, clientY: cy + dragY, bubbles: true }));

  return 'drag-fallback';
}
`;

/**
 * Opens maptap.gg in a visible Chromium browser and clicks the correct
 * globe location for each city in the provided array.
 *
 * Session persistence is layered — each layer is a fallback for the one above:
 *   Layer 1: Persistent browser profile (.browser-profile/) — survives between runs
 *   Layer 2: Cookie injection from maptap-cookies.json (optional, for logged-in sessions)
 *   Layer 3: localStorage injection via addInitScript (fires before page JS, sets tutorial flags)
 *
 * @param {Array<{name: string, lat: number, lng: number}>} cities
 * @returns {Promise<Array<{name, lat, lng, clicked, strategy}|{error}>>}
 */
async function solvePuzzle(cities) {
  // ── Layer 1: Persistent profile ──────────────────────────────────────────
  // launchPersistentContext stores cookies, localStorage, and IndexedDB on disk.
  // First run: dismiss the tutorial manually in the browser window.
  // All subsequent runs: the profile loads it pre-dismissed.
  console.log(`Using persistent browser profile: ${BROWSER_PROFILE_DIR}`);
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    headless: false,
    slowMo: 500,
    args: CHROME_ARGS,
    userAgent: USER_AGENT,
  });

  // ── Layer 2: Cookie injection (optional) ─────────────────────────────────
  // If maptap-cookies.json exists, inject it so the game sees you as logged in.
  // Export cookies from your real browser using the "Cookie-Editor" extension.
  if (fs.existsSync(COOKIE_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
      await context.addCookies(cookies);
      console.log(`Injected ${cookies.length} cookies from ${COOKIE_FILE}`);
    } catch (e) {
      console.warn(`Cookie injection failed (non-fatal): ${e.message}`);
    }
  }

  // ── Layer 3: localStorage injection ──────────────────────────────────────
  // addInitScript runs before any page JavaScript, so the app reads these
  // values as if they were already stored from a previous real session.
  // This is the most reliable way to suppress first-run / tutorial UI.
  await context.addInitScript((storageData) => {
    for (const [key, value] of Object.entries(storageData)) {
      try { localStorage.setItem(key, value); } catch (_) {}
    }
  }, MAPTAP_LOCALSTORAGE);

  const page = await context.newPage();
  const results = [];

  try {
    console.log('Navigating to MapTap...');
    await page.goto(MAPTAP_URL, { waitUntil: 'networkidle', timeout: 30000 });

    await page.waitForSelector('canvas', { timeout: 15000 });
    console.log('Globe canvas found. Waiting for Three.js to initialize...');
    await page.waitForTimeout(3000);

    // Inject the rotation helper function into the live page
    await page.evaluate(ROTATE_GLOBE_SCRIPT);

    // Dismiss any tutorial overlays that survived the localStorage injection
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } catch (_) {}

    // Click any "Play", "Start", or "Got it" button that might block the globe
    const startButton = page.locator('button:has-text("Play"), button:has-text("Start"), button:has-text("Got it")');
    if (await startButton.count() > 0) {
      await startButton.first().click();
      await page.waitForTimeout(1000);
    }

    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      console.log(`\n[${i + 1}/${cities.length}] Solving: ${city.name} (${city.lat}, ${city.lng})`);

      // Rotate the globe so the target city faces the camera
      const strategy = await page.evaluate(
        ({ lat, lng }) => rotateGlobeTo(lat, lng),
        { lat: city.lat, lng: city.lng }
      );
      console.log(`  Globe rotated using strategy: ${strategy}`);

      // Wait for rotation animation to settle before clicking
      await page.waitForTimeout(1200);

      // Click the canvas center — the target should now be centered there
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      if (!box) throw new Error('Canvas bounding box not found');

      const clickX = box.x + box.width / 2;
      const clickY = box.y + box.height / 2;

      await page.mouse.click(clickX, clickY);
      console.log(`  Clicked canvas center at (${Math.round(clickX)}, ${Math.round(clickY)})`);

      results.push({ name: city.name, lat: city.lat, lng: city.lng, clicked: true, strategy });

      // Wait for the game to register the guess and advance to the next city
      await page.waitForTimeout(2500);
    }

    console.log('\nAll cities solved!');

  } catch (err) {
    console.error('Solver error:', err);
    results.push({ error: err.message });
  } finally {
    // Pause so you can see the final score before the browser closes
    await page.waitForTimeout(10000);
    // close() saves the persistent profile back to disk
    await context.close();
  }

  return results;
}

module.exports = { solvePuzzle };
