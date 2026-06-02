const { chromium } = require('playwright');

const MAPTAP_URL = 'https://maptap.gg';

// Injected into the browser page to rotate the 3D globe to face a given lat/lng.
// Tries four strategies in order of reliability:
//   1. OrbitControls API (Three.js)
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
 * @param {Array<{name: string, lat: number, lng: number}>} cities
 * @returns {Promise<Array<{name, lat, lng, clicked, strategy}|{error}>>}
 */
async function solvePuzzle(cities) {
  const browser = await chromium.launch({
    headless: false,  // Keep visible so you can watch — set true once verified
    slowMo: 500,
    args: [
      '--disable-blink-features=AutomationControlled',
      // Suppress Chrome UI features that crash on Ubuntu 26.04 (ProfileMenuView DCHECK)
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider',
      '--disable-background-networking',
      '--disable-client-side-phishing-detection',
      '--no-sandbox',
    ],
  });

  // Use a real-browser user agent to avoid bot detection
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

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

    // Dismiss tutorial overlays
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
    await browser.close();
  }

  return results;
}

module.exports = { solvePuzzle };
