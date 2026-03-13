import React, { useState, useEffect } from 'react';
import socket from '../socket.js';

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
  const [stats, setStats] = useState({ active: 0, completed: 0 });

  useEffect(() => {
    socket.emit('police_register', { unitId: UNIT_ID });

    socket.on('full_state', (data) => {
      if (data.emergencies) setEmergencies(data.emergencies);
      if (data.hospitalStatus) setHospitalStatus(data.hospitalStatus);
      if (data.drivers) setDrivers(data.drivers);
      
      const active = data.emergencies?.filter(e => e.status !== 'completed').length || 0;
      const completed = data.emergencies?.filter(e => e.status === 'completed').length || 0;
      setStats({ active, completed });
    });

    return () => {
      socket.off('full_state');
    };
  }, []);

  return (
    <div className="flex bg-slate-950 text-white font-sans" style={{ minHeight: 'calc(100vh - 48px)' }}>
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-8 border-b border-slate-800">
          <h1 className="text-xl font-black italic tracking-tighter">POLICE CONTROL</h1>
          <p className="text-blue-500 text-[10px] font-black uppercase tracking-widest">Ecosystem Monitor</p>
        </div>
        <div className="flex-1 p-4 space-y-2">
           {['overview', 'hospitals', 'fleet'].map(t => (
             <button key={t} onClick={()=>setTab(t)} className={`w-full text-left px-6 py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:bg-slate-800'}`}>
               {t}
             </button>
           ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-10">
        {tab === 'overview' && (
          <div className="space-y-10">
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                 <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Active SOS</p>
                 <p className="text-4xl font-black text-red-500">{stats.active}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                 <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Total Signals Held</p>
                 <p className="text-4xl font-black text-blue-500">{stats.signalsHeld || 0}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                 <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Est. Time Saved</p>
                 <p className="text-4xl font-black text-emerald-500">{stats.avgTimeSaved || 0}m</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-[40px] overflow-hidden">
               <div className="p-8 border-b border-slate-800 bg-slate-800/10"><h3 className="font-black text-xl italic tracking-tighter">MISSION LEDGER</h3></div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-950/40 border-b border-slate-800">
                        <th className="px-8 py-5 text-slate-500 text-[10px] uppercase font-black tracking-widest">Case ID</th>
                        <th className="px-8 py-5 text-slate-500 text-[10px] uppercase font-black tracking-widest">Type</th>
                        <th className="px-8 py-5 text-slate-500 text-[10px] uppercase font-black tracking-widest">Driver</th>
                        <th className="px-8 py-5 text-slate-500 text-[10px] uppercase font-black tracking-widest">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                       {emergencies.map(em => (
                         <tr key={em.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="px-8 py-5 font-mono text-xs font-black text-sky-500">{em.id}</td>
                            <td className="px-8 py-5 font-bold text-sm">{em.type}</td>
                            <td className="px-8 py-5 text-slate-400 font-medium">{em.driverName || 'UNASSIGNED'}</td>
                            <td className="px-8 py-5 text-sm">
                               <span className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase ${STATUS_CONFIG[em.status]?.bg} ${STATUS_CONFIG[em.status]?.color}`}>
                                  {STATUS_CONFIG[em.status]?.label}
                               </span>
                            </td>
                         </tr>
                       ))}
                       {emergencies.length === 0 && (
                         <tr><td colSpan={4} className="py-20 text-center text-slate-700 font-bold uppercase text-sm italic tracking-[0.2em]">All sectors clear</td></tr>
                       )}
                    </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}

        {tab === 'hospitals' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {hospitalStatus.map(h => (
              <div key={h.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-8 hover:border-blue-500 transition-all">
                <div className="flex justify-between items-start mb-6">
                   <h3 className="text-white font-black text-xl italic tracking-tighter">{h.name}</h3>
                   <div className="bg-blue-600/10 border border-blue-500/30 text-blue-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">Active</div>
                </div>
                <div className="flex items-end justify-between">
                   <div>
                     <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Available Beds</p>
                     <p className="text-5xl font-black text-emerald-500 leading-none">{h.availableBeds}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-1">Total Capacity</p>
                     <p className="text-white font-black text-xl leading-none">{h.totalBeds}</p>
                   </div>
                </div>
                <div className="mt-8 pt-8 border-t border-slate-800 flex gap-4">
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
                <div key={d.driverId} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-black text-xl">🚑</div>
                      <div>
                        <p className="text-white font-black text-lg">{d.name}</p>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{d.ambulanceId}</p>
                      </div>
                   </div>
                   <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${d.status === 'available' ? 'text-emerald-500 bg-emerald-500/10' : 'text-blue-500 bg-blue-500/10'}`}>{d.status}</span>
                </div>
              ))}
           </div>
        )}
      </div>
    </div>
  );
}
