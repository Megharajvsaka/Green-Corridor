import React from 'react';

const STATUS_STYLES = {
  en_route:   { label: 'EN ROUTE',   dot: 'bg-blue-400',   badge: 'bg-blue-900/60 text-blue-300 border-blue-700/50' },
  dispatched: { label: 'DISPATCHED', dot: 'bg-yellow-400', badge: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/50' },
  arrived:    { label: 'ARRIVED',    dot: 'bg-green-400',  badge: 'bg-green-900/60 text-green-300 border-green-700/50' },
};

function formatSeconds(secs) {
  if (!secs || secs <= 0) return '--';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function AmbulanceList({ ambulances, predictiveData = {} }) {
  const active = ambulances.filter((a) => a.status !== 'arrived');

  if (active.length === 0) {
    return (
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
          Active Ambulances
        </h2>
        <p className="text-gray-500 text-sm text-center py-4">
          No ambulances en route
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-gray-700">
      <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
        Active Ambulances ({active.length})
      </h2>
      <div className="flex flex-col gap-2">
        {active.map((amb) => {
          const style = STATUS_STYLES[amb.status] || STATUS_STYLES.dispatched;
          const progress = amb.totalCoords > 0
            ? Math.min(100, Math.round((amb.routeIndex / amb.totalCoords) * 100))
            : 0;

          const upcoming = predictiveData[amb.id] || [];

          return (
            <div
              key={amb.id}
              className="bg-gray-700 rounded-lg p-3"
              style={{ borderLeft: `3px solid ${amb.color}` }}
            >
              {/* Row 1: ID + Status */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="font-bold text-sm"
                    style={{ color: amb.color }}
                  >
                    {amb.id}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${style.badge}`}
                  >
                    {style.label}
                  </span>
                </div>
                <span className="text-gray-400 text-xs">
                  ETA: <span className="text-white font-semibold">{formatSeconds(amb.etaWith)}</span>
                </span>
              </div>

              {/* Row 2: Route */}
              <div className="text-gray-300 text-xs mb-2 truncate">
                📍 {amb.originLabel} → <span className="text-green-400">{amb.hospital?.name}</span>
              </div>

              {/* Progress bar */}
              <div className="bg-gray-600 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: amb.color,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 mb-2">
                <span className="text-gray-500 text-[10px]">{progress}% complete</span>
                <span className="text-gray-500 text-[10px]">
                  {amb.routeIndex}/{amb.totalCoords} coords
                </span>
              </div>

              {/* Pre-clearing prediction section */}
              {upcoming.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-600">
                  <p className="text-xs text-purple-400 font-semibold mb-1">
                    🔮 Pre-clearing ahead
                  </p>
                  {upcoming.map((sig) => (
                    <div key={sig.signalId}
                      className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-400 truncate max-w-[140px]">
                        {sig.roadName}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-gray-500">
                          {sig.etaSeconds}s
                        </span>
                        <span className={
                          sig.status === 'clearing' ? 'text-green-400' :
                          sig.status === 'queued'   ? 'text-yellow-400' : 'text-gray-500'
                        }>
                          {sig.status === 'clearing' ? '✅' :
                           sig.status === 'queued'   ? '🟡' : '⬜'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
