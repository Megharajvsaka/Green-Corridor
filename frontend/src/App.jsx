import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import socket from './socket.js';
import MapView from './components/MapView.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import SignalPanel from './components/SignalPanel.jsx';
import AmbulanceList from './components/AmbulanceList.jsx';
import ETAComparison from './components/ETAComparison.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import ActivityLog from './components/ActivityLog.jsx';
import RequestPage from './pages/RequestPage.jsx';
import DriverPage from './pages/DriverPage.jsx';
import PolicePage from './pages/PolicePage.jsx';
import HospitalPage from './pages/HospitalPage.jsx';

const DEFAULT_STATS = { active: 0, corridors: 0, signalsHeld: 0, avgTimeSaved: 0 };

function CommandCenter() {
  const [hospitals, setHospitals] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [signals, setSignals] = useState([]);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [hospitalsLoaded, setHospitalsLoaded] = useState(false);
  const [connected, setConnected] = useState(true);
  const [predictiveData, setPredictiveData] = useState({});
  const [availableRoutes, setAvailableRoutes] = useState(null);

  useEffect(() => {
    const onHL = ({ hospitals }) => { setHospitals(hospitals); setHospitalsLoaded(true); };
    const onFS = (data) => {
      // The backend now provides 'drivers' as 'ambulances' for compatibility
      const ambs = data.ambulances || data.drivers || [];
      const sigs = data.signals || [];
      const stats = data.stats || DEFAULT_STATS;
      
      setAmbulances(ambs);
      setSignals(sigs);
      setStats(stats);
      if (data.log) setLog(data.log);

      // If we received hospital data, we are "loaded"
      if (data.hospitalStatus && data.hospitalStatus.length > 0) {
        setHospitals(data.hospitalStatus);
        setHospitalsLoaded(true);
      }
    };
    const onPU = (data) => {
      const map = {};
      (data?.ambulances || []).forEach(a => { map[a.id] = a.upcomingSignals; });
      setPredictiveData(map);
    };
    const onRA = (data) => setAvailableRoutes(data);
    socket.on('hospitals_loaded', onHL);
    socket.on('full_state', onFS);
    socket.on('predictive_update', onPU);
    socket.on('routes_available', onRA);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => {
      socket.off('hospitals_loaded', onHL); socket.off('full_state', onFS);
      socket.off('predictive_update', onPU); socket.off('routes_available', onRA);
    };
  }, []);

  return (
    <div className="flex w-screen bg-gray-900 text-white" style={{ minHeight: 'calc(100vh - 48px)' }}>
      {!hospitalsLoaded && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-50 flex-col gap-4">
          <div className="rounded-full h-14 w-14 border-4 border-green-400 border-t-transparent" style={{ animation: 'spin 0.9s linear infinite' }} />
          <p className="text-green-400 text-lg font-semibold">Loading real Bengaluru hospital data…</p>
          <p className="text-gray-500 text-sm">Fetching from OpenStreetMap Overpass API</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {!connected && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-700 text-white text-center py-2 text-sm font-semibold">
          ⚠️ Reconnecting to server…
        </div>
      )}
      <div className="flex-1 relative min-h-0">
        <MapView ambulances={ambulances} signals={signals} hospitals={hospitals} availableRoutes={availableRoutes} />
      </div>
      <div className="w-96 flex flex-col overflow-y-auto bg-gray-800 border-l border-gray-700" style={{ minHeight: 0 }}>
        <ControlPanel stats={stats} ambulances={ambulances} hospitals={hospitals} availableRoutes={availableRoutes} setAvailableRoutes={setAvailableRoutes} />
        <SignalPanel signals={signals} />
        <AmbulanceList ambulances={ambulances} predictiveData={predictiveData} />
        <ETAComparison ambulances={ambulances} />
        <AdminDashboard stats={stats} ambulances={ambulances} />
        <ActivityLog log={log} />
      </div>
    </div>
  );
}

function NavBar() {
  const loc = useLocation();
  const links = [
    { to: '/', label: 'Command Center', emoji: '🚦' },
    { to: '/request', label: 'Request SOS', emoji: '🆘' },
    { to: '/driver', label: 'Driver', emoji: '🚑' },
    { to: '/police', label: 'Police', emoji: '👮' },
    { to: '/hospital', label: 'Hospital', emoji: '🏥' },
  ];
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: '#0f172a',
      borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '4px', padding: '0 16px', height: '48px'
    }}>
      <span style={{ fontWeight: 700, fontSize: '14px', color: '#38bdf8', marginRight: '12px', letterSpacing: '0.05em' }}>
        GREEN CORRIDOR
      </span>
      {links.map(l => (
        <Link key={l.to} to={l.to} style={{
          padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
          textDecoration: 'none', transition: 'all 0.15s',
          background: loc.pathname === l.to ? '#1e40af' : 'transparent',
          color: loc.pathname === l.to ? '#93c5fd' : '#94a3b8',
        }}>
          {l.emoji} {l.label}
        </Link>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <div style={{ paddingTop: '48px', minHeight: '100vh', boxSizing: 'border-box', background: '#020617' }}>
        <Routes>
          <Route path="/" element={<CommandCenter />} />
          <Route path="/request" element={<RequestPage />} />
          <Route path="/driver" element={<DriverPage />} />
          <Route path="/police" element={<PolicePage />} />
          <Route path="/hospital" element={<HospitalPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}