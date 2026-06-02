export default function CityCard({ city, index, status }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-emerald-400 font-bold">#{index + 1}</span>
        <span className="text-white font-semibold">{city.name}</span>
      </div>
      <div className="text-gray-400 text-sm space-y-1">
        <div>Lat: <span className="text-yellow-300">{city.lat}</span></div>
        <div>Lng: <span className="text-yellow-300">{city.lng}</span></div>
      </div>
      {status === 'done' && (
        <div className="mt-2 text-emerald-400 text-sm">✓ Clicked</div>
      )}
    </div>
  );
}
