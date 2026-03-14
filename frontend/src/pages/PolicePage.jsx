import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';

/* global L */

function MapPreview({ drivers, signals }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(L.layerGroup());

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [12.9716, 77.5946], zoom: 12, zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
    markersLayerRef.current.addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 500);
    return () => map.remove();
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    markersLayerRef.current.clearLayers();

    // Map drivers
    drivers?.forEach(d => {
      if (d.lat && d.lng) {
        L.marker([d.lat, d.lng], {
          icon: L.divIcon({ html: `<div style="font-size:24px; filter:drop-shadow(0 0 10px #3b82f6)">🚑</div>`, className: '', iconSize: [24, 24] })
        }).addTo(markersLayerRef.current).bindTooltip(d.ambulanceId, { permanent: true, direction: 'right', className: 'text-[10px] font-black' });
      }
    });

    // Map signals
    signals?.forEach(s => {
       if (s.location?.coordinates) {
         const isHeld = s.status === 'held' || s.status === 'flushing';
         const color = isHeld ? '#ef4444' : '#10b981';
         L.circleMarker([s.location.coordinates[1], s.location.coordinates[0]], {
           radius: 6, fillColor: color, color: '#fff', weight: 2, fillOpacity: 1
         }).addTo(markersLayerRef.current).bindTooltip(s.crossRoadName, { direction: 'top', className: 'text-[10px]' });
       }
    });
  }, [drivers, signals]);

  return <div ref={mapContainerRef} className="w-full h-[500px] rounded-[40px] overflow-hidden border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.08)] bg-slate-50" />;
}

const UNIT_ID = 'POLICE-001';
const UNIT_NAME = 'Command Control - Bengaluru';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  en_route: { label: 'En Route', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  at_scene: { label: 'At Scene', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  hospital_bound: { label: 'In Transit', color: 'text-purple-500', bg: 'bg-purple-500/10' },
  completed: { label: 'Arrived', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
};

export default function PolicePage() {
  const [tab, setTab] = useState('overview');
  const [emergencies, setEmergencies] = useState([]);
  const [hospitalStatus, setHospitalStatus] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [signals, setSignals] = useState([]);
  const [stats, setStats] = useState({ active: 0, completed: 0, signalsHeld: 0, avgTimeSaved: 0 });

  useEffect(() => {
    socket.emit('police_register', { unitId: UNIT_ID });

    socket.on('full_state', (data) => {
      if (data.emergencies) setEmergencies(data.emergencies);
      if (data.hospitalStatus) setHospitalStatus(data.hospitalStatus);
      if (data.drivers || data.ambulances) setDrivers(data.drivers || data.ambulances);
      if (data.signals) setSignals(data.signals);
      
      const active = data.emergencies?.filter(e => e.status !== 'completed').length || 0;
      const completed = data.emergencies?.filter(e => e.status === 'completed').length || 0;
      setStats({ active, completed, signalsHeld: data.stats?.signalsHeld || 0, avgTimeSaved: data.stats?.avgTimeSaved || 0 });
    });

    return () => {
      socket.off('full_state');
    };
  }, []);

  return (
    <div className="flex bg-slate-50 text-slate-900 font-sans" style={{ minHeight: 'calc(100vh - 48px)' }}>
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-8 border-b border-slate-200">
          <h1 className="text-xl font-black italic tracking-tighter text-slate-900">POLICE CONTROL</h1>
          <p className="text-blue-600 text-[10px] font-black uppercase tracking-widest">Ecosystem Monitor</p>
        </div>
        <div className="flex-1 p-4 space-y-2">
           {['overview', 'signals & map', 'hospitals', 'fleet'].map(t => (
             <button key={t} onClick={()=>setTab(t)} className={`w-full text-left px-6 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
               {t}
             </button>
           ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-10 bg-slate-50">
        {tab === 'overview' && (
          <div className="space-y-10">
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                 <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Active SOS</p>
                 <p className="text-4xl font-black text-red-600">{stats.active}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                 <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Total Signals Held</p>
                 <p className="text-4xl font-black text-blue-600">{stats.signalsHeld || 0}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                 <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Est. Time Saved</p>
                 <p className="text-4xl font-black text-emerald-600">{stats.avgTimeSaved || 0}m</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-[40px] overflow-hidden shadow-sm">
               <div className="p-8 border-b border-slate-100 bg-slate-50/50"><h3 className="font-black text-xl italic tracking-tighter text-slate-900">MISSION LEDGER</h3></div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-8 py-5 text-slate-500 text-[10px] uppercase font-black tracking-widest">Case ID</th>
                        <th className="px-8 py-5 text-slate-500 text-[10px] uppercase font-black tracking-widest">Type</th>
                        <th className="px-8 py-5 text-slate-500 text-[10px] uppercase font-black tracking-widest">Driver</th>
                        <th className="px-8 py-5 text-slate-500 text-[10px] uppercase font-black tracking-widest">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {emergencies.map(em => (
                         <tr key={em.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-8 py-5 font-mono text-xs font-black text-blue-600">{em.id}</td>
                            <td className="px-8 py-5 font-bold text-sm text-slate-900">{em.type}</td>
                            <td className="px-8 py-5 text-slate-600 font-medium">{em.driverName || 'UNASSIGNED'}</td>
                            <td className="px-8 py-5 text-sm">
                               <span className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase ${STATUS_CONFIG[em.status]?.bg} ${STATUS_CONFIG[em.status]?.color}`}>
                                  {STATUS_CONFIG[em.status]?.label}
                               </span>
                            </td>
                         </tr>
                       ))}
                       {emergencies.length === 0 && (
                         <tr><td colSpan={4} className="py-20 text-center text-slate-400 font-bold uppercase text-sm italic tracking-[0.2em]">All sectors clear</td></tr>
                       )}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>
        )}

        {tab === 'signals & map' && (
          <div className="space-y-10">
            <h2 className="text-3xl font-black italic tracking-tighter ml-2 text-slate-900">CITY SURVEILLANCE & SIGNALS</h2>
            <MapPreview drivers={drivers} signals={signals} />
            
            <div className="bg-white border border-slate-200 rounded-[40px] overflow-hidden shadow-sm">
               <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                 <h3 className="font-black text-xl italic tracking-tighter text-slate-900">TRAFFIC CONTROL GRIDS</h3>
                 <span className="bg-amber-50 text-amber-600 border border-amber-200 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                   Manual Overrides Available
                 </span>
               </div>
               <div className="p-8 bg-slate-50/30">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {signals.map(s => (
                       <div key={s.signalId} className="bg-white border border-slate-200 rounded-3xl p-6 transition-all hover:border-slate-300 shadow-sm hover:shadow-md">
                          <p className="text-slate-900 font-black text-lg mb-1">{s.crossRoadName || s.signalId}</p>
                          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Location: {s.location?.coordinates?.[1].toFixed(4)}, {s.location?.coordinates?.[0].toFixed(4)}</p>
                          <div className="flex items-center justify-between mb-6">
                            <span className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest ${s.status === 'held' ? 'bg-red-50 text-red-600 border border-red-200 font-bold' : (s.status === 'caution' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200')}`}>
                               {s.status === 'held' ? '🛑 CORRIDOR HOLD' : s.status.toUpperCase()}
                            </span>
                            {s.ambulanceId && <span className="text-blue-600 font-black text-sm">{s.ambulanceId} 🚑</span>}
                          </div>
                          <button 
                             className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${(s.status === 'held' || s.status === 'flushing') ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-md' : 'bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                             disabled={!(s.status === 'held' || s.status === 'flushing')}
                             onClick={() => socket.emit('police_signal_override', { signalId: s.signalId })}
                          >
                             Release Override
                          </button>
                       </div>
                    ))}
                    {signals.length === 0 && (
                       <div className="col-span-full py-10 text-center text-slate-400 font-bold uppercase tracking-widest">No Signals Registered in Database</div>
                    )}
                 </div>
               </div>
            </div>
          </div>
        )}

        {tab === 'hospitals' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {hospitalStatus.map(h => (
              <div key={h.id} className="bg-white border border-slate-200 rounded-3xl p-8 hover:border-blue-300 transition-all shadow-sm">
                <div className="flex justify-between items-start mb-6">
                   <h3 className="text-slate-900 font-black text-xl italic tracking-tighter">{h.name}</h3>
                   <div className="bg-blue-50 border border-blue-200 text-blue-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">Active</div>
                </div>
                <div className="flex items-end justify-between">
                   <div>
                     <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Available Beds</p>
                     <p className="text-5xl font-black text-emerald-600 leading-none">{h.availableBeds}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Total Capacity</p>
                     <p className="text-slate-900 font-black text-xl leading-none">{h.totalBeds}</p>
                   </div>
                </div>
                <div className="mt-8 pt-8 border-t border-slate-100 flex gap-4">
                   {Object.entries(h.departments || {}).map(([d, s]) => (
                     <div key={d} className={`w-2 h-2 rounded-full ${s === 'available' ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-red-500'}`} title={`${d}: ${s}`} />
                   ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'fleet' && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {drivers.map(d => (
                <div key={d.driverId} className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center font-black text-xl shadow-inner text-blue-600">🚑</div>
                      <div>
                        <p className="text-slate-900 font-black text-lg">{d.name}</p>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{d.ambulanceId}</p>
                      </div>
                   </div>
                   <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${d.status === 'available' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-blue-600 bg-blue-50 border-blue-200'}`}>{d.status}</span>
                </div>
              ))}
           </div>
        )}
      </div>
    </div>
  );
}
