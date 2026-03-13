import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';

/* global L */

const DRIVER_PROFILES = [
  { id: 'DRV-001', name: 'Rajesh Kumar', ambulanceId: 'AMB-K01', avatar: 'RK' },
  { id: 'DRV-002', name: 'Priya Sharma', ambulanceId: 'AMB-K02', avatar: 'PS' },
  { id: 'DRV-003', name: 'Anil Reddy', ambulanceId: 'AMB-K03', avatar: 'AR' },
  { id: 'DRV-004', name: 'Deepa Nair', ambulanceId: 'AMB-K04', avatar: 'DN' },
];

const VICTIM_CONDITIONS = [
  { id: 'conscious', label: 'Conscious & Responsive' },
  { id: 'unconscious', label: 'Unconscious' },
  { id: 'breathing', label: 'Breathing Difficulties' },
  { id: 'bleeding', label: 'Active Bleeding' },
  { id: 'fracture', label: 'Suspected Fracture' },
  { id: 'burns', label: 'Burns' },
  { id: 'cardiac', label: 'Cardiac Event' },
];

const STATUS_COLORS = {
  available: 'bg-green-500', 
  alerted: 'bg-amber-500', 
  on_mission: 'bg-blue-500', 
  offline: 'bg-slate-500',
};

const STATUS_TEXT = {
  available: 'text-green-500', 
  alerted: 'text-amber-500', 
  on_mission: 'text-blue-500', 
  offline: 'text-slate-500',
};

const STATUS_LABELS = {
  available: 'Available', 
  alerted: 'Alert Incoming!', 
  on_mission: 'On Mission', 
  offline: 'Offline',
};

function kmDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function MiniMap({ coords, currentPos, targetPos, targetLabel, forceResize }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const polylineRef = useRef(null);
  const markersLayerRef = useRef(L.layerGroup());

  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current.addTo(map);

    // Force a resize check after a short delay
    setTimeout(() => map.invalidateSize(), 500);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    // Force invalidate size on every update to handle layout shifts
    map.invalidateSize();

    // Clear old markers in a dedicated layer
    markersLayerRef.current.clearLayers();
    if (polylineRef.current) polylineRef.current.remove();

    // Draw route
    if (coords && coords.length > 0) {
      const latLngs = coords.map(c => [c.lat, c.lng]);
      polylineRef.current = L.polyline(latLngs, { color: '#3b82f6', weight: 6, opacity: 0.9 }).addTo(map);
      map.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });
    }

    // Target marker
    if (targetPos && targetPos.lat && targetPos.lng && (targetPos.lat !== 0 || targetPos.lng !== 0)) {
       L.marker([targetPos.lat, targetPos.lng], {
         icon: L.divIcon({
           html: `<div style="background:#ef4444; border:2px solid white; border-radius:50%; width:16px; height:16px; box-shadow: 0 0 20px #ef4444"></div>`,
           className: '', iconSize: [16, 16], iconAnchor: [8, 8]
         })
       }).addTo(markersLayerRef.current).bindTooltip(targetLabel || 'Target', { permanent: true, direction: 'top', className: 'text-[10px] font-black' });
    }

    // Current position marker
    if (currentPos && currentPos.lat && currentPos.lng && (currentPos.lat !== 0 || currentPos.lng !== 0)) {
      L.marker([currentPos.lat, currentPos.lng], {
        icon: L.divIcon({
          html: `<div style="font-size:32px; filter:drop-shadow(0 0 15px #3b82f6)">🚑</div>`,
          className: 'ambulance-icon', iconSize: [32, 32], iconAnchor: [16, 16]
        })
      }).addTo(markersLayerRef.current);
      
      // Only pan if we aren't zoomed way out on a long route
      if (!coords || coords.length === 0) {
         map.panTo([currentPos.lat, currentPos.lng], { animate: true });
      }
    }
  }, [coords, currentPos, targetPos, forceResize]);

  return <div ref={mapContainerRef} className="w-full h-full rounded-2xl overflow-hidden border border-slate-700 shadow-2xl" />;
}

export default function DriverPage() {
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [driverStatus, setDriverStatus] = useState('offline');
  const [phase, setPhase] = useState('idle'); 
  const [caseLocked, setCaseLocked] = useState(null);
  const [victimReport, setVictimReport] = useState({ conditions: [], notes: '' });
  const [hospitalRoute, setHospitalRoute] = useState(null);
  const [hospitalReadyMsg, setHospitalReadyMsg] = useState('');
  
  const [assignment, setAssignment] = useState(null);
  const [alert, setAlert] = useState(null);
  const [livePos, setLivePos] = useState(null);

  // 🛡️ State Refs for Socket Listeners (Prevents Stale Closures)
  const assignmentRef = useRef(null);
  const alertRef = useRef(null);
  const phaseRef = useRef('idle');

  // Synchronize Refs
  useEffect(() => {
    assignmentRef.current = assignment;
    alertRef.current = alert;
    phaseRef.current = phase;
  }, [assignment, alert, phase]);

  const [countdown, setCountdown] = useState(null);
  const [myPos, setMyPos] = useState({ lat: 12.9716, lng: 77.5946 });
  const countdownRef = useRef(null);

  // 🛠️ Mission Handlers
  const handleAlert = (data) => {
    console.log('🚨 [DISPATCH] URGENT SOS:', data);
    setAlert(data);
    setPhase('alerted');
    setDriverStatus('alerted');
  };

  const handleAssignment = ({ emergencyId, emergency, routeToVictim, etaSeconds }) => {
    console.log('✅ [MISSION] LOCKED:', emergencyId);
    const flattenedEm = {
      ...emergency,
      lat: emergency.lat || (emergency.location?.coordinates ? emergency.location.coordinates[1] : null),
      lng: emergency.lng || (emergency.location?.coordinates ? emergency.location.coordinates[0] : null),
    };
    setAssignment({ ...flattenedEm, routeToVictim, etaToVictim: etaSeconds });
    setPhase('en_route');
    setDriverStatus('on_mission');
    setAlert(null);
    setLivePos({ lat: flattenedEm.lat, lng: flattenedEm.lng });
    startCountdown(etaSeconds);
  };

  const handleHospitalRoute = ({ hospital, routeCoords, etaSeconds, aiResult, signalCount }) => {
    setHospitalRoute({ hospital, routeCoords, etaSeconds, aiResult, signalCount });
    setPhase('hospital_bound');
    startCountdown(etaSeconds);
  };

  // 📡 Socket Synchronizer
  useEffect(() => {
    if (!selectedProfile) return;

    // Register with fallback coordinates if stations aren't set
    const sLat = myPos.lat || 12.9716;
    const sLng = myPos.lng || 77.5946;

    console.log('📡 [NETWORK] Synchronizing Driver:', selectedProfile.id);
    socket.emit('driver_register', {
      driverId: selectedProfile.id,
      name: selectedProfile.name,
      ambulanceId: selectedProfile.ambulanceId,
      lat: sLat,
      lng: sLng,
    });
    setDriverStatus('available');

    socket.on('emergency_alert', handleAlert);
    
    socket.on('case_assigned', (data) => {
      handleAssignment(data);
    });

    socket.on('hospital_route_assigned', handleHospitalRoute);
    
    socket.on('full_state', (data) => {
      // Find our current mission state from the master stream using Refs
      const currentId = assignmentRef.current?.id || (alertRef.current?.emergencyId);
      if (currentId) {
        const ourEm = data.emergencies?.find(e => e.id === currentId);
        if (ourEm) {
          const lat = ourEm.currentLat || ourEm.lat || (ourEm.location?.coordinates?.[1]);
          const lng = ourEm.currentLng || ourEm.lng || (ourEm.location?.coordinates?.[0]);
          
          if (lat && lng) {
            setLivePos({ lat, lng });
          }

          if (ourEm.status === 'at_scene' && phaseRef.current === 'en_route') {
            setPhase('at_scene');
            setCountdown(0);
          } else if (ourEm.status === 'completed' && phaseRef.current === 'hospital_bound') {
            handleArrivedComplete();
          }
        }
      }
    });

    socket.on('hospital_confirmed_ready', ({ message }) => setHospitalReadyMsg(message));

    socket.on('case_assigned_broadcast', ({ emergencyId, driverName }) => {
       if (alertRef.current?.emergencyId === emergencyId) {
          setCaseLocked({ message: `${driverName} took this case.` });
          setPhase('idle');
          setDriverStatus('available');
          setAlert(null);
          setTimeout(() => setCaseLocked(null), 3000);
       }
    });

    return () => {
      socket.off('emergency_alert', handleAlert);
      socket.off('case_assigned', handleAssignment);
      socket.off('full_state');
      socket.off('hospital_route_assigned', handleHospitalRoute);
      socket.off('hospital_confirmed_ready');
    };
  }, [selectedProfile]); // ONLY re-run on profile select

  function startCountdown(s) {
    setCountdown(s);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(p => { if (p <= 1) { clearInterval(countdownRef.current); return 0; } return p - 1; });
    }, 1000);
  }

  function acceptCase() {
    socket.emit('driver_accept', { driverId: selectedProfile.id, emergencyId: alert.emergencyId });
  }

  function declineCase() {
    setAlert(null);
    setPhase('idle');
    setDriverStatus('available');
  }

  function handleVictimPickup() {
    socket.emit('victim_picked_up', {
      driverId: selectedProfile.id,
      emergencyId: assignment.id,
      victimReport: { conditions: victimReport.conditions, notes: victimReport.notes, time: Date.now() },
    });
    setPhase('awaiting_hospital');
    clearInterval(countdownRef.current);
  }

  function handleArrivedComplete() {
    setPhase('idle');
    setDriverStatus('available');
    setAssignment(null);
    setHospitalRoute(null);
    setHospitalReadyMsg('');
    setVictimReport({ conditions: [], notes: '' });
    setLivePos(null);
  }

  function handleManualArrived() {
    setPhase('idle');
    setDriverStatus('available');
    setAssignment(null);
    setHospitalRoute(null);
  }

  function toggleCondition(id) {
    setVictimReport(v => ({
      ...v,
      conditions: v.conditions.includes(id) ? v.conditions.filter(c => c !== id) : [...v.conditions, id],
    }));
  }

  const fmt = (s) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;

  if (!selectedProfile) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800 border-2 border-slate-700 rounded-[40px] p-10 shadow-3xl text-center">
          <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-8 shadow-[0_0_40px_rgba(37,99,235,0.4)]">🚑</div>
          <h2 className="text-3xl font-black text-white mb-2 italic tracking-tighter">DRIVER HUB</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.3em] mb-10">Fleet Identification Required</p>
          <div className="space-y-4">
            {DRIVER_PROFILES.map(p => (
              <button key={p.id} onClick={() => setSelectedProfile(p)} className="w-full bg-slate-900 border border-slate-700/50 rounded-2xl p-5 flex items-center gap-4 hover:border-blue-500 hover:bg-slate-950 transition-all group relative overflow-hidden">
                <div className="absolute inset-0 bg-blue-600/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-blue-400 z-10">
                  {p.avatar}
                </div>
                <div className="text-left z-10">
                  <p className="text-white font-black text-sm">{p.name}</p>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{p.ambulanceId}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 text-white font-sans flex flex-col min-h-screen">
      <style>{`
        @keyframes urgent-pulse { 0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); } 70% { box-shadow: 0 0 0 40px rgba(220, 38, 38, 0); } 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); } }
        .urgent-overlay { background: radial-gradient(circle, rgba(220, 38, 38, 0.2) 0%, rgba(15, 23, 42, 0.95) 100%); }
      `}</style>
      
      {/* Dynamic Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-950 px-4 py-1.5 rounded-full border border-slate-800">
             <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[driverStatus]} animate-pulse shadow-[0_0_10px_currentColor]`} />
             <span className={`${STATUS_TEXT[driverStatus]} text-[10px] font-black uppercase tracking-[0.2em]`}>{STATUS_LABELS[driverStatus]}</span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-none">ID: {selectedProfile.ambulanceId}</span>
          </div>
        </div>
        <button className="text-slate-500 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
      </header>

      {/* Main Mission Control View */}
      <main className="flex-1 flex flex-col lg:flex-row relative">
        
        {/* Case Alert MODAL OVERLAY */}
        {phase === 'alerted' && alert && (
           <div className="absolute inset-0 z-[2000] flex items-center justify-center p-6 urgent-overlay backdrop-blur-md">
              <div className="max-w-2xl w-full bg-slate-900 border-4 border-red-600 rounded-[50px] overflow-hidden shadow-[0_0_100px_rgba(220,38,38,0.4)] animate-[slide-up_0.5s_ease-out]">
                 <div className="bg-red-600 py-6 px-10 text-center">
                    <h2 className="text-4xl font-black italic tracking-tighter text-white animate-pulse">EMERGENCY BROADCAST</h2>
                 </div>
                 <div className="p-10 space-y-8">
                    <div className="flex items-center gap-8 border-b border-slate-800 pb-8">
                       <div className="w-24 h-24 rounded-full bg-red-600 flex items-center justify-center text-5xl animate-[urgent-pulse_1.5s_infinite]">🚑</div>
                       <div className="space-y-1">
                          <p className="text-red-500 font-black text-2xl tracking-tight">{alert.type}</p>
                          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Distance: {kmDistance(alert.lat, alert.lng, myPos.lat, myPos.lng).toFixed(1)} km</p>
                       </div>
                    </div>
                    
                    <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-6 italic text-slate-300 text-lg leading-relaxed shadow-inner">
                       "{alert.description || 'Incoming emergency request. Immediate dispatch required.'}"
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                       <button onClick={acceptCase} className="bg-white text-red-600 font-black py-6 rounded-3xl text-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl">ACCEPT MISSION</button>
                       <button onClick={declineCase} className="bg-slate-800 text-slate-400 font-bold py-6 rounded-3xl text-lg border border-slate-700 hover:bg-slate-700 transition-all">STAND BY</button>
                    </div>
                 </div>
              </div>
           </div>
        )}

        {/* Left Column: Mission Console (40%) */}
        <div className="lg:w-[40%] flex flex-col border-r border-slate-800 bg-slate-900/50 shrink-0">
          {phase === 'alerted' && (
            <div className="p-8 space-y-4 bg-red-600/10 border-b border-red-500/20">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                <p className="text-red-500 font-black text-xs uppercase tracking-[0.3em]">Incoming Dispatch Signal</p>
              </div>
              <p className="text-slate-400 text-xs font-bold leading-relaxed uppercase">Signal intercept from nearby victim. Golden hour protocol initialized.</p>
            </div>
          )}
          {phase === 'idle' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
               <div className="text-8xl mb-6">📡</div>
               <h3 className="text-3xl font-black italic tracking-tighter mb-4 text-white">READY FOR DISPATCH</h3>
               <p className="text-slate-500 text-sm font-bold uppercase tracking-widest leading-relaxed">Positioned at Standby Cluster<br/>Awaiting Golden Hour Signal</p>
            </div>
          ) : (
            <div className="p-8 space-y-8 animate-in fade-in duration-500">
               {/* Mission Ident */}
               <div className="bg-slate-950 rounded-[32px] p-6 border border-slate-800 shadow-lg">
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <p className="text-blue-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1">Active Mission</p>
                        <h4 className="text-white text-3xl font-black italic tracking-tighter">#{assignment?.id || 'ALPHA-1'}</h4>
                     </div>
                     <span className="bg-blue-600/20 text-blue-500 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">Corridor Active</span>
                  </div>

                  <div className="bg-slate-900/50 rounded-2xl p-4 flex items-center justify-between">
                     <div className="text-center flex-1 border-r border-slate-800">
                        <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">ETA</p>
                        <p className="text-white text-2xl font-black tabular-nums">{countdown !== null ? fmt(countdown) : '--'}</p>
                     </div>
                     <div className="text-center flex-1">
                        <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Signals</p>
                        <p className="text-emerald-500 text-2xl font-black">CLEARED</p>
                     </div>
                  </div>
               </div>

               {/* Mission Content */}
               {phase === 'en_route' && (
                  <div className="space-y-6">
                     <div className="bg-blue-600/10 border border-blue-500/20 rounded-3xl p-6">
                        <p className="text-blue-400 font-black text-sm uppercase italic mb-2">Phase: 1 — Victim Intercept</p>
                        <p className="text-slate-400 text-sm leading-relaxed">Proceed at code-3 priority. Green Corridor is being established in your path.</p>
                     </div>
                     <button className="w-full bg-slate-800 text-slate-400 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest border border-slate-700 cursor-not-allowed opacity-50">
                        Awaiting Victim Arrival
                     </button>
                  </div>
               )}

               {phase === 'at_scene' && (
                  <div className="bg-amber-600/10 border-2 border-amber-500/40 rounded-[32px] p-8 space-y-6 shadow-2xl">
                     <h3 className="text-amber-500 font-black text-2xl italic tracking-tighter">🩺 FIELD TRIAGE</h3>
                     <div className="grid grid-cols-2 gap-3">
                        {VICTIM_CONDITIONS.map(c => (
                          <button key={c.id} onClick={() => toggleCondition(c.id)} className={`p-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-tight transition-all ${victimReport.conditions.includes(c.id) ? 'bg-amber-500 text-slate-900 border-white shadow-lg' : 'bg-slate-950 text-slate-700 border-slate-800 hover:border-slate-600'}`}>
                            {c.label}
                          </button>
                        ))}
                     </div>
                     <textarea rows={2} placeholder="Symptom notes..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white text-sm outline-none focus:border-amber-500" value={victimReport.notes} onChange={e=>setVictimReport(v=>({...v, notes:e.target.value}))} />
                     <button onClick={handleVictimPickup} className="w-full bg-white text-slate-900 font-black py-5 rounded-2xl text-xl shadow-xl active:scale-95 transition-all">PICKUP & DISPATCH</button>
                  </div>
               )}

               {phase === 'hospital_bound' && hospitalRoute && (
                  <div className="space-y-6">
                     <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-3xl p-6">
                        <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest mb-1">Destination Facility</p>
                        <h4 className="text-white text-2xl font-black italic tracking-tighter mb-4">{hospitalRoute.hospital.name}</h4>
                        {hospitalReadyMsg && (
                          <div className="bg-slate-950 p-4 rounded-xl border-l-4 border-emerald-500 italic text-[11px] text-emerald-400">
                             "{hospitalReadyMsg}"
                          </div>
                        )}
                     </div>

                     <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800">
                        <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-3">AI Score: {hospitalRoute.aiResult?.composite}% Matching</p>
                        <div className="flex gap-1">
                           <div className="h-1 bg-blue-500 rounded-full flex-1" />
                           <div className="h-1 bg-blue-500 rounded-full flex-1" />
                           <div className="h-1 bg-blue-500 rounded-full flex-1" />
                           <div className="h-1 bg-slate-800 rounded-full flex-1" />
                        </div>
                     </div>
                  </div>
               )}

               {caseLocked && (
                 <div className="bg-emerald-600 text-white rounded-2xl p-4 text-center font-black animate-bounce">
                    ✅ {caseLocked.message}
                 </div>
               )}
            </div>
          )}
        </div>

        {/* Right Column: Dynamic Map (60%) */}
        <div className="lg:w-[60%] min-h-[500px] shrink-0 relative bg-slate-950">
           <MiniMap 
             coords={phase === 'en_route' ? assignment?.routeToVictim : (phase === 'at_scene' || phase === 'hospital_bound' ? hospitalRoute?.routeCoords : null)} 
             currentPos={livePos || myPos}
             targetPos={phase === 'alerted' ? { lat: alert?.lat, lng: alert?.lng } : (phase === 'en_route' ? { lat: assignment?.lat, lng: assignment?.lng } : { lat: hospitalRoute?.hospital?.lat, lng: hospitalRoute?.hospital?.lng })}
             targetLabel={phase === 'alerted' ? 'DISPATCH SIGNAL' : (phase === 'en_route' ? 'VICTIM' : 'ER UNIT')}
             forceResize={phase}
           />
           
           {/* Map HUD Components */}
           <div className="absolute top-6 right-6 flex flex-col gap-3 pointer-events-none">
              <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/50 p-4 rounded-2xl shadow-2xl flex items-center gap-4">
                 <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-500">🛰️</div>
                 <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Network Status</p>
                    <p className="text-xs text-white font-black">HIGH PRECISION DATA</p>
                 </div>
              </div>
           </div>
        </div>

      </main>
    </div>
  );
}
