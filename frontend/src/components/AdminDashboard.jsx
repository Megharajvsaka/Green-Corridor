import React from 'react';
import socket from '../socket.js';

function formatSeconds(secs) {
  if (!secs || secs <= 0) return '--';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const STATUS_BADGE = {
  en_route:   'bg-blue-900/60 text-blue-300 border border-blue-700/50',
  dispatched: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700/50',
  arrived:    'bg-green-900/60 text-green-300 border border-green-700/50',
};
const STATUS_LABEL = {
  en_route:   'EN ROUTE',
  dispatched: 'DISPATCHED',
  arrived:    'ARRIVED',
};

export default function AdminDashboard({ stats, ambulances }) {
  const statCards = [
    { label: 'Active 🚑',    value: stats.active,        color: 'text-blue-400'  },
    { label: 'Corridors 🟢', value: stats.corridors,     color: 'text-green-400' },
    { label: 'Signals 🔴',   value: stats.signalsHeld,   color: 'text-red-400'   },
    { label: 'Avg Saved ⏱',  value: formatSeconds(stats.avgTimeSaved), color: 'text-yellow-400' },
  ];

  return (
    <div className="p-4 border-b border-gray-700">
      <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
        Admin Dashboard
      </h2>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {statCards.map((c) => (
          <div key={c.label} className="bg-gray-700 rounded-lg p-3 text-center">
            <div className={`font-bold text-lg ${c.color}`}>{c.value}</div>
            <div className="text-gray-400 text-[11px]">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Ambulance table */}
      {ambulances.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-600">
                <th className="text-left pb-1.5 pr-2">ID</th>
                <th className="text-left pb-1.5 pr-2">Status</th>
                <th className="text-left pb-1.5 pr-2">Hospital</th>
                <th className="text-right pb-1.5">ETA</th>
              </tr>
            </thead>
            <tbody>
              {ambulances.map((amb) => (
                <tr key={amb.id} className="border-b border-gray-700/50">
                  <td className="py-1.5 pr-2">
                    <span className="font-bold" style={{ color: amb.color }}>
                      {amb.id}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        STATUS_BADGE[amb.status] || STATUS_BADGE.dispatched
                      }`}
                    >
                      {STATUS_LABEL[amb.status] || amb.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-gray-300 truncate max-w-[100px]">
                    {amb.hospital?.name ?? '—'}
                  </td>
                  <td className="py-1.5 text-right text-gray-300">
                    {amb.status === 'arrived' ? (
                      <span className="text-green-400">✓</span>
                    ) : (
                      formatSeconds(amb.etaWith)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ambulances.length === 0 && (
        <p className="text-gray-500 text-xs text-center py-2">No ambulances yet</p>
      )}
    </div>
  );
}
