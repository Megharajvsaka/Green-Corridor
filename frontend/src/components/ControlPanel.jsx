import React, { useState, useEffect } from 'react';
import { Radio, Zap, RotateCcw } from 'lucide-react';
import socket from '../socket.js';

export default function ControlPanel({ stats, ambulances, hospitals, availableRoutes, setAvailableRoutes }) {
  const [demoMode, setDemoMode] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  
  const [routeSelectionMode, setRouteSelectionMode] = useState(false);
  const [pendingOrigin, setPendingOrigin] = useState(null);
  const [pendingHospital, setPendingHospital] = useState(null);
  const [loadingRoutes, setLoadingRoutes] = useState(false);

  useEffect(() => {
    if (!demoMode) return;
    const interval = setInterval(() => {
      const activeCount = ambulances.filter((a) => a.status !== 'arrived').length;
      if (activeCount < 6) {
        // Auto-dispatch existing fallback logic
        socket.emit('dispatch_ambulance');
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [demoMode, ambulances]);

  useEffect(() => {
    socket.on('routes_available', () => {
      setLoadingRoutes(false);
    });
    return () => socket.off('routes_available');
  }, []);

  const handleDispatchClick = () => {
    if (hospitals.length === 0) return;
    const lat = parseFloat((12.88 + Math.random() * 0.18).toFixed(5));
    const lng = parseFloat((77.50 + Math.random() * 0.22).toFixed(5));
    const hospital = hospitals.reduce((nearest, h) => {
      const d  = Math.abs(h.lat - lat) + Math.abs(h.lng - lng);
      const nd = Math.abs(nearest.lat - lat) + Math.abs(nearest.lng - lng);
      return d < nd ? h : nearest;
    });
    setPendingOrigin({ lat, lng });
    setPendingHospital(hospital);
    setLoadingRoutes(true);
    setRouteSelectionMode(true);
    socket.emit('request_routes', {
      originLat: lat,
      originLng: lng,
      hospitalId: hospital.id,
    });
  };

  const handleSelectRoute = (route) => {
    socket.emit('dispatch_ambulance', {
      routeCoords: route.coords,
      hospitalId: pendingHospital.id,
      originLat: pendingOrigin.lat,
      originLng: pendingOrigin.lng,
    });
    setRouteSelectionMode(false);
    setPendingOrigin(null);
    setPendingHospital(null);
    if (setAvailableRoutes) setAvailableRoutes(null);
  };

  const handleCancel = () => {
    setRouteSelectionMode(false);
    setPendingOrigin(null);
    setPendingHospital(null);
    setLoadingRoutes(false);
    if (setAvailableRoutes) setAvailableRoutes(null);
  };

  function handleReset() {
    socket.emit('reset_all');
    setDemoMode(false);
  }

  const activeCorridors = ambulances.filter((a) => a.status !== 'arrived').length;

  return (
    <div className="p-4 border-b border-gray-700 bg-gray-800">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🚦</span>
        <div>
          <h1 className="text-white font-bold text-base leading-tight">
            Green Corridor System
          </h1>
          <p className="text-gray-400 text-xs">Bengaluru Emergency Response</p>
        </div>
        <button
          onClick={handleReset}
          className="ml-auto flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <RotateCcw size={12} />
          Reset All
        </button>
      </div>

      {activeCorridors > 0 ? (
        <div className="flex items-center gap-2 mb-3 bg-green-900/40 border border-green-700/50 rounded-lg px-3 py-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-green-400 text-sm font-semibold">
            {activeCorridors} Corridor{activeCorridors !== 1 ? 's' : ''} Active
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-3 bg-gray-700/40 border border-gray-600/50 rounded-lg px-3 py-2">
          <span className="h-3 w-3 rounded-full bg-gray-500 inline-block" />
          <span className="text-gray-400 text-sm">No Active Corridors</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleDispatchClick}
          disabled={dispatching || routeSelectionMode}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-all"
        >
          <Zap size={16} />
          {dispatching ? 'Dispatching…' : '🚑 Dispatch Ambulance'}
        </button>

        <button
          onClick={() => setDemoMode((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            demoMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'
          }`}
        >
          <Radio size={14} />
          Demo
        </button>
      </div>

      {routeSelectionMode && (
        <div className="bg-gray-800 rounded-lg p-3 mt-2 border border-gray-600">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-bold text-white">Select Corridor Route</p>
            <button onClick={handleCancel}
              className="text-gray-400 hover:text-white text-xs">✕ Cancel</button>
          </div>
          {availableRoutes && (
            <p className="text-xs text-gray-400 mb-3">
              → {availableRoutes.hospitalName}
            </p>
          )}
          {loadingRoutes && !availableRoutes && (
            <div className="flex items-center gap-2 text-green-400 text-sm py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2
                              border-green-400 border-t-transparent"/>
              Calculating routes...
            </div>
          )}
          {availableRoutes && availableRoutes.routes.map((route) => (
            <div key={route.id}
              className="bg-gray-700 rounded-lg p-2 mb-2 border border-gray-600
                         hover:border-green-500 transition-all">
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    route.id === 'A' ? 'bg-green-600' :
                    route.id === 'B' ? 'bg-blue-600' : 'bg-yellow-600'
                  }`}>
                    Route {route.id}
                  </span>
                  <span className="text-xs text-white font-medium">
                    {route.label}
                  </span>
                  {route.recommended && (
                    <span className="text-xs bg-green-900 text-green-300
                                     px-1 rounded">⭐ Best</span>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-400 mb-2">
                {route.distanceKm} km ·{' '}
                {Math.floor(route.durationSeconds / 60)}m{' '}
                {route.durationSeconds % 60}s ·{' '}
                {route.signalCount} signals
              </div>
              <button
                onClick={() => handleSelectRoute(route)}
                className={`w-full text-xs py-1.5 rounded font-medium
                            transition-colors ${
                  route.id === 'A'
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-gray-600 hover:bg-gray-500 text-white'
                }`}>
                Select This Route
              </button>
            </div>
          ))}
        </div>
      )}

      {demoMode && (
        <p className="text-green-400 text-xs mt-2 text-center animate-pulse">
          🎬 Demo mode — auto-dispatching every 8s
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="bg-gray-700 rounded-lg p-2 text-center">
          <div className="text-blue-400 text-lg font-bold">{stats.active}</div>
          <div className="text-gray-400 text-xs">Active</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-2 text-center">
          <div className="text-red-400 text-lg font-bold">{stats.signalsHeld}</div>
          <div className="text-gray-400 text-xs">Signals Held</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-2 text-center">
          <div className="text-green-400 text-lg font-bold">{stats.corridors}</div>
          <div className="text-gray-400 text-xs">Corridors</div>
        </div>
      </div>
    </div>
  );
}
