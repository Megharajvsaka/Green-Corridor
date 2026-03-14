import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';

/* global L */

const HOSPITAL_PROFILES = [
  { id: 'h1', name: 'Manipal Hospital', avatar: 'MH', color: 'bg-blue-600', textColor: 'text-blue-400', border: 'border-blue-500/30' },
  { id: 'h2', name: 'Apollo Hospital', avatar: 'AP', color: 'bg-purple-600', textColor: 'text-purple-400', border: 'border-purple-500/30' },
  { id: 'h3', name: 'Victoria Hospital', avatar: 'VH', color: 'bg-cyan-600', textColor: 'text-cyan-400', border: 'border-cyan-500/30' },
  { id: 'h4', name: 'Fortis Hospital', avatar: 'FH', color: 'bg-amber-600', textColor: 'text-amber-400', border: 'border-amber-500/30' },
  { id: 'h5', name: 'Narayana Health City', avatar: 'NH', color: 'bg-emerald-600', textColor: 'text-emerald-400', border: 'border-emerald-500/30' },
];

const PREP_CHECKLISTS = {
  'Road Accident': ['Trauma bay ready', 'Blood type check', 'X-ray on standby', 'Surgical team alert', 'IV lines prepared'],
  'Cardiac Arrest': ['Defibrillator charged', 'Cath lab on standby', 'Crash cart ready', 'Cardiology team alert', 'Echocardiogram ready'],
  'Unknown': ['Trauma bay ready', 'Full assessment kit', 'All teams on standby', 'IV access prepared'],
};

function TrackingMap({ patient }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const routeLineRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [12.97, 77.59], zoom: 14, zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
    mapRef.current = map;
    // Handle tile resizing
    setTimeout(() => map.invalidateSize(), 500);
    return () => map.remove();
  }, []);

  useEffect(() => {
    if (!mapRef.current || !patient) return;
    const map = mapRef.current;

    if (patient.currentLat) {
      const ambIconHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
          <div style="
            background: white; 
            color: #111827; 
            font-family: 'Inter', sans-serif; 
            font-weight: 800; 
            font-size: 10px; 
            padding: 4px 8px; 
            border-radius: 6px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
            margin-bottom: 8px; 
            border: 1.5px solid #e5e7eb;
            white-space: nowrap;
          ">
            VICTIM
            <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #e5e7eb;"></div>
          </div>
          <div style="background:#3b82f6;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 0 10px #3b82f6;">🚑</div>
        </div>
      `;
      const ambIcon = L.divIcon({ html: ambIconHTML, className: 'ambulance-glide', iconSize: [32, 60], iconAnchor: [16, 45] });

      if (markerRef.current) {
        markerRef.current.setLatLng([patient.currentLat, patient.currentLng]).setIcon(ambIcon);
      } else {
        markerRef.current = L.marker([patient.currentLat, patient.currentLng], { icon: ambIcon }).addTo(map);
      }
      map.panTo([patient.currentLat, patient.currentLng], { animate: true });
    }

    // ── 2. Route Polyline ──
    if (patient.routeCoords && patient.routeCoords.length > 0) {
      const latLngs = patient.routeCoords.map(c => [c.lat, c.lng]);
      if (routeLineRef.current) {
        routeLineRef.current.setLatLngs(latLngs);
      } else {
        routeLineRef.current = L.polyline(latLngs, { color: '#3b82f6', weight: 5, opacity: 0.7, lineCap: 'round' }).addTo(map);
        map.fitBounds(routeLineRef.current.getBounds(), { padding: [30, 30] });
      }
    } else if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    // Handle tile resizing
    setTimeout(() => map.invalidateSize(), 500);
  }, [patient]);

  return (
    <>
      <style>{`.ambulance-glide { transition: all 1s linear !important; }`}</style>
      <div ref={mapContainerRef} className="w-full h-48 sm:h-64 rounded-2xl overflow-hidden border border-slate-700 mt-4" />
    </>
  );
}

export default function HospitalPage() {
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [hospitalStatus, setHospitalStatus] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [ackMessage, setAckMessage] = useState('');

  useEffect(() => {
    if (!selectedHospital) return;
    socket.emit('hospital_register', { hospitalId: selectedHospital.id });

    socket.on('incoming_patient', (data) => {
      setIncoming(prev => {
        const idx = prev.findIndex(p => p.emergencyId === data.emergencyId);
        if (idx >= 0) { const n = [...prev]; n[idx] = data; return n; }
        return [data, ...prev];
      });
      setSelectedPatient(data);
      setCheckedItems(prev => ({ ...prev, [data.emergencyId]: [] }));
    });

    socket.on('full_state', (data) => {
      const hs = data.hospitalStatus?.find(h => h.id === selectedHospital.id);
      if (hs) setHospitalStatus(hs);

      setIncoming(prev => {
        return prev.map(p => {
          const em = data.emergencies?.find(e => e.id === p.emergencyId);
          // Backend tick() updates routeIndex and flattenLoc outputs live position as em.lat / em.lng
          if (em) return {
            ...p,
            currentLat: em.lat,
            currentLng: em.lng,
            status: em.status,
            routeCoords: em.routeCoords || p.routeCoords
          };
          return p;
        }).filter(p => p.status !== 'completed');
      });
    });

    socket.on('patient_arrived', ({ emergencyId }) => {
      setIncoming(prev => prev.filter(p => p.emergencyId !== emergencyId));
      if (selectedPatient?.emergencyId === emergencyId) setSelectedPatient(null);
    });

    return () => {
      socket.off('incoming_patient');
      socket.off('full_state');
      socket.off('patient_arrived');
    };
  }, [selectedHospital, selectedPatient]);

  function sendReadyAck() {
    socket.emit('hospital_ready_ack', { hospitalId: selectedHospital.id, emergencyId: selectedPatient.emergencyId, message: ackMessage });
    setAckMessage('');
    // Could show a toast here
  }

  function confirmArrival() {
    socket.emit('mission_complete', { emergencyId: selectedPatient.emergencyId, hospitalId: selectedHospital.id });
    setIncoming(prev => prev.filter(p => p.emergencyId !== selectedPatient.emergencyId));
    setSelectedPatient(null);
  }

  function toggleCheckItem(patientId, item) {
    setCheckedItems(prev => {
      const curr = prev[patientId] || [];
      return { ...prev, [patientId]: curr.includes(item) ? curr.filter(i => i !== item) : [...curr, item] };
    });
  }

  if (!selectedHospital) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center">
        <div className="max-w-md w-full">
          <h2 className="text-3xl font-black text-slate-900 text-center mb-10">Facility Login</h2>
          <div className="space-y-4">
            {HOSPITAL_PROFILES.map(h => (
              <button key={h.id} onClick={() => setSelectedHospital(h)} className="w-full bg-white border border-slate-200 rounded-2xl p-6 flex items-center gap-6 hover:border-blue-300 hover:shadow-md transition-all group shadow-sm">
                <div className={`w-14 h-14 rounded-2xl ${h.color} flex items-center justify-center font-black text-xl shadow-inner text-white`}>{h.avatar}</div>
                <div className="text-left"><p className="text-slate-900 font-black text-lg">{h.name}</p><p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Emergency Dept</p></div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      <header className="bg-white border-b border-slate-200 p-6 sticky top-0 z-[100] shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${selectedHospital.color} flex items-center justify-center font-black text-xl shadow-inner text-white`}>{selectedHospital.avatar}</div>
            <div>
              <p className="text-slate-900 font-black text-xl tracking-tight">{selectedHospital.name}</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Emergency Operations Live</p>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
             <div className="bg-slate-50 border border-slate-200 px-6 py-3 rounded-2xl text-center shadow-inner">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Available Beds</p>
                <p className="text-emerald-600 text-3xl font-black leading-none">{hospitalStatus?.availableBeds ?? '--'}</p>
             </div>
             <div className="bg-slate-50 border border-slate-200 px-6 py-3 rounded-2xl text-center shadow-inner">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Incoming</p>
                <p className="text-red-500 text-3xl font-black leading-none">{incoming.length}</p>
             </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Incoming List */}
          <div className="lg:col-span-12 xl:col-span-8 flex flex-col gap-6">
            <h3 className="text-slate-900 font-black text-2xl italic tracking-tighter ml-2">🚑 ACTIVE DISPATCH RADAR</h3>
            {incoming.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-[40px] py-40 flex flex-col items-center justify-center opacity-60 shadow-sm">
                <span className="text-8xl mb-6 grayscale text-slate-300">🏥</span>
                <p className="text-slate-500 font-bold uppercase tracking-widest">No active units inbound</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {incoming.map(p => (
                  <div key={p.emergencyId} onClick={()=>setSelectedPatient(p)} className={`cursor-pointer rounded-3xl p-6 border-2 transition-all duration-300 shadow-sm ${selectedPatient?.emergencyId === p.emergencyId ? 'bg-blue-50 border-blue-400 shadow-md transform scale-[1.02]' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center text-3xl shadow-inner text-red-600">🚑</div>
                        <div>
                          <p className="text-slate-900 font-black text-lg">{p.ambulanceId}</p>
                          <p className="text-red-600 text-xs font-black uppercase tracking-widest">{p.emergencyType}</p>
                        </div>
                      </div>
                      <div className="text-right">
                         <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">ETA</p>
                         <p className="text-slate-900 font-black text-xl italic">{Math.round(p.etaSeconds / 60)}m</p>
                      </div>
                    </div>
                    {selectedPatient?.emergencyId === p.emergencyId && (
                       <TrackingMap patient={p} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Prep Panel */}
          <div className="lg:col-span-12 xl:col-span-4 sticky top-32">
             {selectedPatient ? (
               <div className="bg-white border border-slate-200 rounded-[40px] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.08)] animate-[slide-in_0.4s_ease-out]">
                  <div className="bg-blue-600 p-8 flex justify-between items-center text-white shadow-sm">
                    <h3 className="font-black text-2xl tracking-tighter italic">ER PREP PROTOCOL</h3>
                    <button onClick={()=>setSelectedPatient(null)} className="text-2xl opacity-60 hover:opacity-100 transition-opacity">✕</button>
                  </div>
                  <div className="p-8 space-y-8">
                     <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-inner">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">AI Match Score</p>
                              <p className="text-blue-600 font-black text-3xl italic">{selectedPatient.aiResult?.compositeScore || '94'}%</p>
                           </div>
                           <div className="text-right">
                              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Reasoning</p>
                              <p className="text-slate-700 text-xs font-bold uppercase tracking-tighter">{selectedPatient.aiResult?.reasoning || 'Optimized Routing'}</p>
                           </div>
                        </div>
                        <div className="space-y-2">
                           {selectedPatient.aiResult?.breakdown && Object.entries(selectedPatient.aiResult.breakdown).map(([key, val]) => (
                             <div key={key} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <span>{key.replace('Score', '')}</span>
                                <div className="flex-1 border-b border-dotted border-slate-300 mx-2 mb-1" />
                                <span className="text-slate-700">{val}</span>
                             </div>
                           ))}
                        </div>
                     </div>

                     <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Patient Profile</p>
                        <p className="text-red-600 font-black text-xl uppercase mb-1">{selectedPatient.emergencyType}</p>
                        <p className="text-slate-600 text-sm font-medium italic">"{selectedPatient.victimReport?.notes || 'No triage notes provided.'}"</p>
                     </div>

                    <div className="space-y-4">
                      {(()=>{
                        const checklist = PREP_CHECKLISTS[selectedPatient.emergencyType] || PREP_CHECKLISTS['Unknown'];
                        const checkedCount = checkedItems[selectedPatient.emergencyId]?.length || 0;
                        const allReady = checkedCount === checklist.length;
                        return (
                          <>
                            <div className="flex justify-between items-center mb-2">
                               <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Readiness Status</p>
                               <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${allReady ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : (checkedCount > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-red-50 text-red-600 border-red-200')}`}>
                                  {allReady ? 'ALL SYSTEMS READY' : (checkedCount > 0 ? 'PREP IN PROGRESS' : 'AWAITING PREP')}
                               </span>
                            </div>
                            {checklist.map(item => (
                              <div key={item} onClick={()=>toggleCheckItem(selectedPatient.emergencyId, item)} className={`flex items-center gap-4 p-5 rounded-2xl cursor-pointer border-2 transition-all shadow-sm ${checkedItems[selectedPatient.emergencyId]?.includes(item) ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${checkedItems[selectedPatient.emergencyId]?.includes(item) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-slate-50'}`}>
                                   {checkedItems[selectedPatient.emergencyId]?.includes(item) && <span className="text-white text-xs">✓</span>}
                                </div>
                                <span className={`font-black text-sm uppercase tracking-tight ${checkedItems[selectedPatient.emergencyId]?.includes(item) ? 'text-emerald-700' : 'text-slate-600'}`}>{item}</span>
                              </div>
                            ))}
                            <div className="pt-4 border-t border-slate-200 space-y-4">
                              <textarea value={ackMessage} onChange={e=>setAckMessage(e.target.value)} placeholder="Send message to driver..." className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-5 text-slate-900 outline-none focus:border-blue-400 focus:ring focus:ring-blue-100 shadow-inner" />
                              <button onClick={sendReadyAck} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-3xl text-sm uppercase tracking-widest shadow-lg shadow-blue-500/30 transition-all">BROADCAST READINESS</button>
                              
                              <button onClick={confirmArrival} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-5 rounded-3xl text-xl shadow-lg shadow-emerald-500/30 hover:shadow-xl transition-all flex items-center justify-center gap-2">
                                <span className="text-2xl">🏥</span> PATIENT ARRIVED
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
               </div>
             ) : (
               <div className="xl:flex flex-col items-center justify-center h-full text-center py-20 grayscale opacity-40">
                  <span className="text-8xl mb-4 text-slate-300">📄</span>
                  <p className="text-slate-500 font-bold uppercase tracking-[0.3em]">SELECT DISPATCH<br/>TO PREP ER</p>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
