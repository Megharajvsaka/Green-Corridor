import React from 'react';

function formatSeconds(secs) {
  if (secs == null || secs <= 0 || !isFinite(secs)) return '--';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function ETAComparison({ ambulances }) {
  // Pick the most recently dispatched active ambulance
  const active = ambulances.filter((a) => a.status !== 'arrived');
  const latest = active.length > 0
    ? active.reduce((newest, a) => a.dispatchedAt > newest.dispatchedAt ? a : newest)
    : null;

  const etaWith    = latest ? latest.etaWith    : null;
  const etaWithout = latest ? latest.etaWithout : null;
  const timeSaved  = etaWith != null && etaWithout != null
    ? Math.max(0, etaWithout - etaWith)
    : null;
  const pctFaster  = etaWithout && etaWithout > 0
    ? Math.round((timeSaved / etaWithout) * 100)
    : 0;

  return (
    <div className="p-4 border-b border-gray-700">
      <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
        ETA Comparison
        {latest && (
          <span className="ml-2 text-gray-500 normal-case font-normal">
            ({latest.id})
          </span>
        )}
      </h2>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Without corridor */}
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-center">
          <div className="text-red-400 text-xs font-semibold mb-1">🔴 WITHOUT</div>
          <div className="text-white text-xl font-bold mb-1">
            {formatSeconds(etaWithout)}
          </div>
          <div className="text-gray-400 text-[10px]">Normal traffic</div>
          <div className="text-gray-500 text-[10px]">Signals not held</div>
        </div>

        {/* With corridor */}
        <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 text-center">
          <div className="text-green-400 text-xs font-semibold mb-1">🟢 WITH</div>
          <div className="text-white text-xl font-bold mb-1">
            {formatSeconds(etaWith)}
          </div>
          <div className="text-gray-400 text-[10px]">All signals clear</div>
          <div className="text-gray-500 text-[10px]">Direct route</div>
        </div>
      </div>

      {/* Time saved row */}
      <div className="bg-gray-700/60 rounded-lg px-3 py-2 text-center">
        {timeSaved != null && timeSaved > 0 ? (
          <>
            <div className="text-yellow-400 text-xs font-semibold">
              ⬇ Time Saved
            </div>
            <div className="text-white font-bold text-base">
              {formatSeconds(timeSaved)}
            </div>
            <div className="text-green-400 text-xs">
              {pctFaster}% faster with corridor
            </div>
          </>
        ) : (
          <div className="text-gray-500 text-sm">
            {latest ? 'Calculating…' : 'Dispatch an ambulance to see comparison'}
          </div>
        )}
      </div>
    </div>
  );
}
