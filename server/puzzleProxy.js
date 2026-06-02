const vm = require('vm');

const PUZZLE_URL = 'https://maptap.gg/data/this_day_in_history';

async function fetchPuzzle() {
  const response = await fetch(PUZZLE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/javascript, application/javascript, */*',
      'Referer': 'https://maptap.gg/',
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch puzzle: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();

  const sandbox = {};
  try {
    vm.runInNewContext(text, sandbox);
  } catch (e) {
    throw new Error(`Failed to parse puzzle JS: ${e.message}\nRaw text: ${text.slice(0, 200)}`);
  }

  // Debug: log available keys if cities is not found
  if (!sandbox.cities) {
    console.log('Sandbox keys:', Object.keys(sandbox));
  }

  const raw = sandbox.cities;

  if (!Array.isArray(raw)) {
    throw new Error(`Expected cities array, got: ${typeof raw}. Keys: ${Object.keys(sandbox).join(', ')}`);
  }

  return raw.map(city => ({
    name: city.name,
    lat: city.lat,
    lng: city.lng,
  }));
}

module.exports = { fetchPuzzle };
