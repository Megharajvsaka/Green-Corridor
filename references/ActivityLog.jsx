import React from 'react';

export default function ActivityLog({ log }) {
  return (
    <div className="p-4">
      <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
        Activity Log
        {log.length > 0 && (
          <span className="ml-2 text-gray-600 normal-case font-normal">
            ({log.length} entries)
          </span>
        )}
      </h2>

      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
        {log.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-4">
            No activity yet
          </p>
        ) : (
          log.map((entry, i) => (
            <div
              key={i}
              className="flex gap-2 items-start text-xs py-1 border-b border-gray-700/40 last:border-0"
            >
              <span className="text-gray-500 font-mono shrink-0 mt-0.5">
                [{entry.time}]
              </span>
              <span className="text-gray-300 leading-relaxed">
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
