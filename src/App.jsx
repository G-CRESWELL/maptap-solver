import { useState } from 'react';
import { fetchDailyPuzzle, solveDailyPuzzle } from './services/puzzleService';
import CityCard from './components/CityCard';
import SolverControls from './components/SolverControls';
import StatusLog from './components/StatusLog';

// Status values: 'idle' | 'fetching' | 'ready' | 'solving' | 'done' | 'error'

export default function App() {
  const [cities, setCities] = useState([]);
  const [status, setStatus] = useState('idle');
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);

  const addLog = (msg) => setLog(prev => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);

  const handleFetch = async () => {
    setStatus('fetching');
    setError(null);
    setCities([]);
    setLog([]);
    addLog('Fetching today\'s puzzle from maptap.gg...');
    try {
      const result = await fetchDailyPuzzle();
      setCities(result);
      setStatus('ready');
      addLog(`Got ${result.length} cities: ${result.map(c => c.name).join(', ')}`);
    } catch (err) {
      setError(err.message);
      setStatus('error');
      addLog(`Error: ${err.message}`);
    }
  };

  const handleSolve = async () => {
    if (!cities.length) return;
    setStatus('solving');
    addLog('Launching Playwright browser...');
    addLog('Opening maptap.gg — watch for a browser window to appear!');
    try {
      const results = await solveDailyPuzzle(cities);
      setStatus('done');
      results.forEach(r => {
        if (r.error) {
          addLog(`ERROR: ${r.error}`);
        } else {
          addLog(`✓ Clicked ${r.name} using strategy: ${r.strategy}`);
        }
      });
      addLog('Done! Check the Playwright browser window for results.');
    } catch (err) {
      setError(err.message);
      setStatus('error');
      addLog(`Solver error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8 font-mono">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-emerald-400">MapTap Solver</h1>
        <p className="text-gray-400 mt-1">Daily puzzle automation for maptap.gg</p>
      </header>

      <SolverControls
        status={status}
        onFetch={handleFetch}
        onSolve={handleSolve}
        canSolve={cities.length > 0 && status === 'ready'}
      />

      {error && (
        <div className="mt-4 p-4 bg-red-900/50 border border-red-500 rounded text-red-300">
          {error}
        </div>
      )}

      {cities.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cities.map((city, i) => (
            <CityCard key={city.name} city={city} index={i} status={status} />
          ))}
        </div>
      )}

      <StatusLog entries={log} />
    </div>
  );
}
