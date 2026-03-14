import React from 'react';

export default function SignalPanel({ signals }) {
  const heldSignals = signals.filter(s => s.status === 'held');
  
  if (heldSignals.length === 0) return (
    <div className="p-3 border-b border-gray-700">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
        🚦 Signal Coordination
      </p>
      <p className="text-xs text-gray-500">No signals currently held</p>
    </div>
  );
  
  return (
    <div className="p-3 border-b border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          🚦 Signal Coordination
        </p>
        <span className="bg-red-900 text-red-300 text-xs px-2 py-0.5 rounded-full">
          {heldSignals.length} held
        </span>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {heldSignals.map(signal => (
          <div key={signal.id}
            className="bg-gray-700 rounded-lg p-2 text-xs border border-gray-600">
            <p className="text-gray-300 font-medium mb-1 truncate">
              {signal.ambulanceRoadName} × {signal.crossRoadName}
            </p>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500
                              shadow-[0_0_6px_#22c55e] flex-shrink-0"/>
              <span className="text-gray-300 truncate">
                {signal.ambulanceRoadName}
              </span>
              <span className="text-green-400 font-bold ml-auto">GO</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500
                              shadow-[0_0_6px_#ef4444] flex-shrink-0"/>
              <span className="text-gray-300 truncate">
                {signal.crossRoadName}
              </span>
              <span className="text-red-400 font-bold ml-auto">STOP</span>
            </div>
            <div className="text-gray-500 border-t border-gray-600 pt-1 mt-1">
              ✋ {signal.vehiclesStopped} vehicles stopped · {signal.heldFor}s
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
