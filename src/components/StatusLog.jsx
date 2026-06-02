import { useEffect, useRef } from 'react';

export default function StatusLog({ entries }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  if (!entries.length) return null;

  return (
    <div className="mt-6">
      <h2 className="text-gray-400 text-sm font-semibold mb-2 uppercase tracking-wider">Log</h2>
      <div
        ref={ref}
        className="bg-black border border-gray-800 rounded-lg p-4 h-48 overflow-y-auto text-sm text-gray-300 space-y-1"
      >
        {entries.map((entry, i) => (
          <div key={i} className="leading-relaxed">{entry}</div>
        ))}
      </div>
    </div>
  );
}
