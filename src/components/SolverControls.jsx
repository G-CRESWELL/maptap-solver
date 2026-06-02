export default function SolverControls({ status, onFetch, onSolve, canSolve }) {
  const isLoading = status === 'fetching' || status === 'solving';

  return (
    <div className="flex gap-4">
      <button
        onClick={onFetch}
        disabled={isLoading}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
      >
        {status === 'fetching' ? 'Fetching...' : '🗺 Fetch Today\'s Puzzle'}
      </button>

      <button
        onClick={onSolve}
        disabled={!canSolve || isLoading}
        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
      >
        {status === 'solving' ? 'Solving... (check browser)' : '🤖 Auto-Solve'}
      </button>
    </div>
  );
}
