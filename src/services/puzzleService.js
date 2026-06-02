export async function fetchDailyPuzzle() {
  const res = await fetch('/api/puzzle');
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Unknown error');
  return data.cities; // [{ name, lat, lng }, ...]
}

export async function solveDailyPuzzle(cities) {
  const res = await fetch('/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cities }),
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Unknown error');
  return data.results;
}
