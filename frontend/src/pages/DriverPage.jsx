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

function MiniMap({ coords, currentPos, targetPos, targetLabel, forceResize, phase, signals, hospitals }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const initializedRef = useRef(false);
  const hasFitBoundsRef = useRef(false);
  const lastPhaseRef = useRef(null);
  
  // Persistent layers to allow smooth animation
  const routeLinesRef = useRef([]);
  const hospitalMarkersRef = useRef(new Map());
  const signalMarkersRef = useRef(new Map());
  const ambulanceMarkerRef = useRef(null);
  const targetMarkerRef = useRef(null);

  useEffect(() => {
    if (initializedRef.current) return;
    if (!mapContainerRef.current) return;
    initializedRef.current = true;
    
    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);
    
    setTimeout(() => map.invalidateSize(), 500);
    mapRef.current = map;

    return () => { 
      if (mapRef.current) {
         mapRef.current.remove(); 
         mapRef.current = null; 
      }
      initializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (forceResize !== lastPhaseRef.current) {
      hasFitBoundsRef.current = false;
      lastPhaseRef.current = forceResize;
    }
  }, [forceResize]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    map.invalidateSize();

    // ── 1. Route Lines — green for hospital_bound, blue for victim intercept ──
    routeLinesRef.current.forEach(l => l.remove());
    routeLinesRef.current = [];
    if (coords && coords.length > 0) {
      const latLngs = coords.map(c => [c.lat, c.lng]);
      const isHospital = phase === 'hospital_bound';
      const activeColor = isHospital ? '#22c55e' : '#3b82f6';   // green for hospital, blue for victim
      const ghostColor  = isHospital ? '#86efac' : '#ef4444';   // lighter ghost
      const ghostL = L.polyline(latLngs, { color: ghostColor, weight: 3, opacity: 0.3, dashArray: '8 12' }).addTo(map);
      const activeL = L.polyline(latLngs, { color: activeColor, weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      routeLinesRef.current = [ghostL, activeL];

      if (!hasFitBoundsRef.current) {
        map.fitBounds(L.polyline(latLngs).getBounds(), { padding: [40, 40] });
        hasFitBoundsRef.current = true;
      }
    }

    // ── 2. Hospitals ──
    if (hospitals && hospitals.length > 0) {
      const currentHospIds = new Set(hospitals.map(h => h.id || h.name));
      hospitals.forEach(h => {
        const hId = h.id || h.name;
        if (!h.lat || !h.lng || hospitalMarkersRef.current.has(hId)) return;
        const marker = L.marker([h.lat, h.lng], {
          icon: L.divIcon({
            html: `
              <div style="
                background: #1d4ed8; 
                width: 32px; height: 32px; 
                border-radius: 8px; 
                display: flex; align-items: center; justify-content: center; 
                border: 2.5px solid white; 
                box-shadow: 0 4px 12px rgba(29,78,216,0.6);
              ">
                <span style="font-size: 16px;">🏥</span>
              </div>
            `,
            className: '', iconSize: [32, 32], iconAnchor: [16, 16]
          })
        }).addTo(map).bindPopup(`<b style="color:#4ade80">🏥 ${h.name}</b>`);
        hospitalMarkersRef.current.set(hId, marker);
      });
      for (const [id, marker] of hospitalMarkersRef.current) {
        if (!currentHospIds.has(id)) { marker.remove(); hospitalMarkersRef.current.delete(id); }
      }
    }

    // ── 3. Signals (Dynamically toggle icons without clearLayers) ──
    if (signals) {
      const currentSigIds = new Set(signals.map(s => s.signalId));
      signals.forEach(sig => {
        const agn = sig.ambulanceRoadSignal === 'green';
        const cgn = sig.crossRoadSignal === 'green';
        const iconHTML = `
          <div style="background:#111827;border:2px solid #374151;border-radius:8px;padding:5px 7px;font-size:10px;color:white;white-space:nowrap;box-shadow:0 2px 12px rgba(0,0,0,0.6);min-width:130px;">
            <div style="font-size:9px;color:#9ca3af;margin-bottom:3px;font-weight:600;letter-spacing:0.05em;">🚦 SIGNAL ${sig.status.toUpperCase()}</div>
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
              <div style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${agn ? '#22c55e' : '#ef4444'};box-shadow:0 0 6px ${agn ? '#22c55e' : '#ef4444'};"></div>
              <span style="color:#e5e7eb;font-size:10px">${sig.ambulanceRoadName || 'Main Corridor'}</span>
              <span style="color:${agn ? '#22c55e' : '#ef4444'};font-weight:700;font-size:9px;margin-left:auto;">${agn ? 'GO' : 'STOP'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
              <div style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${cgn ? '#22c55e' : '#ef4444'};box-shadow:0 0 6px ${cgn ? '#22c55e' : '#ef4444'};"></div>
              <span style="color:#e5e7eb;font-size:10px">${sig.crossRoadName || 'Cross Traffic'}</span>
              <span style="color:${cgn ? '#22c55e' : '#ef4444'};font-weight:700;font-size:9px;margin-left:auto;">${cgn ? 'GO' : 'STOP'}</span>
            </div>
            <div style="color:#6b7280;font-size:9px;border-top:1px solid #374151;padding-top:3px;">
              ✋ ${sig.vehiclesStopped || 0} stopped · ${sig.heldFor || 0}s held
            </div>
          </div>
        `;
        const sigIcon = L.divIcon({ html: iconHTML, className: '', iconAnchor: [0, 0] });
        
        if (signalMarkersRef.current.has(sig.signalId)) {
          const m = signalMarkersRef.current.get(sig.signalId);
          m.setIcon(sigIcon);
          m.setLatLng([sig.lat, sig.lng]);
        } else {
          const marker = L.marker([sig.lat, sig.lng], { icon: sigIcon, zIndexOffset: 500 }).addTo(map);
          signalMarkersRef.current.set(sig.signalId, marker);
        }
      });
      for (const [id, marker] of signalMarkersRef.current) {
        if (!currentSigIds.has(id)) { marker.remove(); signalMarkersRef.current.delete(id); }
      }
    }

    // ── 4. Target Marker (Victim/Hospital) ──
    if (targetPos && targetPos.lat && targetPos.lng && (targetPos.lat !== 0 || targetPos.lng !== 0)) {
       const isVictim = targetLabel === 'VICTIM' || targetLabel === 'DISPATCH SIGNAL';
       if (targetMarkerRef.current) {
         targetMarkerRef.current.setLatLng([targetPos.lat, targetPos.lng]);
         // Update icon if target type changes
         if (isVictim) {
           targetMarkerRef.current.setIcon(L.divIcon({
              html: `<div style="background:#ef4444; border:3px solid white; border-radius:50%; width:18px; height:18px; box-shadow: 0 0 20px #ef4444; animation: ping 1.5s ease-in-out infinite;"></div>`,
              className: '', iconSize: [18, 18], iconAnchor: [9, 9]
           }));
         } else {
           targetMarkerRef.current.setIcon(L.divIcon({
              html: `<div style="background: #1d4ed8; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 0 15px rgba(29,78,216,0.8);"><span style="font-size: 20px;">🏥</span></div>`,
              className: '', iconSize: [36, 36], iconAnchor: [18, 18]
           }));
         }
       } else {
         const targetIcon = isVictim 
           ? L.divIcon({ html: `<div style="background:#ef4444; border:3px solid white; border-radius:50%; width:18px; height:18px; box-shadow: 0 0 20px #ef4444; animation: ping 1.5s ease-in-out infinite;"></div>`, className: '', iconSize: [18, 18], iconAnchor: [9, 9] })
           : L.divIcon({ html: `<div style="background: #1d4ed8; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 0 15px rgba(29,78,216,0.8);"><span style="font-size: 20px;">🏥</span></div>`, className: '', iconSize: [36, 36], iconAnchor: [18, 18] });

         targetMarkerRef.current = L.marker([targetPos.lat, targetPos.lng], { icon: targetIcon })
           .addTo(map).bindTooltip(targetLabel || 'Target', { permanent: true, direction: 'top', className: 'text-[10px] font-black' });
       }
    } else if (targetMarkerRef.current) {
       targetMarkerRef.current.remove();
       targetMarkerRef.current = null;
    }

    // ── 5. Ambulance Marker (With Dynamic VICTIM Label) ──
    if (currentPos && currentPos.lat && currentPos.lng && (currentPos.lat !== 0 || currentPos.lng !== 0)) {
      const isHospitalBound = targetLabel === 'ER UNIT';
      const ambIconHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
          ${isHospitalBound ? `
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
              z-index: 1001;
            ">
              VICTIM
              <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #e5e7eb;"></div>
              <div style="position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid white;"></div>
            </div>
          ` : ''}
          <div style="background:#3b82f6;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 0 10px #3b82f6;">🚑</div>
        </div>
      `;
      // Use iconAnchor shifted up for hospital bound to center the ambulance circle on the coordinate
      const iconAnchorY = isHospitalBound ? 45 : 16;
      const ambIcon = L.divIcon({ 
        html: ambIconHTML, 
        className: 'ambulance-glide', // Crucial: triggers the CSS transition
        iconSize: [32, 60], 
        iconAnchor: [16, iconAnchorY] 
      });

      if (ambulanceMarkerRef.current) {
         ambulanceMarkerRef.current.setLatLng([currentPos.lat, currentPos.lng]).setIcon(ambIcon);
      } else {
        ambulanceMarkerRef.current = L.marker([currentPos.lat, currentPos.lng], { icon: ambIcon, zIndexOffset: 1000 }).addTo(map);
      }

      if (coords && coords.length > 0) {
        map.panTo([currentPos.lat, currentPos.lng], { animate: true, duration: 1.5 });
      } else if (targetPos && targetPos.lat && targetPos.lng && !hasFitBoundsRef.current) {
        const bounds = L.latLngBounds([[currentPos.lat, currentPos.lng], [targetPos.lat, targetPos.lng]]);
        map.fitBounds(bounds, { padding: [50, 50] });
        hasFitBoundsRef.current = true;
      }
    }
  }, [coords, currentPos, targetPos, forceResize, signals, hospitals, targetLabel]); 

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
  const [alertTimeout, setAlertTimeout] = useState(30);
  const [livePos, setLivePos] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [signals, setSignals] = useState([]);
  const [localSignals, setLocalSignals] = useState([]); // derived locally for instant toggle
  const [hospitals, setHospitals] = useState([]);
  const audioContextRef = useRef(null);

  // 🛡️ State Refs for Socket Listeners (Prevents Stale Closures)
  const assignmentRef = useRef(null);
  const alertRef = useRef(null);
  const phaseRef = useRef('idle');
  const countdownRef = useRef(null);
  const routeIndexRef = useRef(0);      // current position along route array
  const routeAnimRef = useRef(null);    // setInterval handle for local animation
  const activeCoordsRef = useRef(null); // the route array being animated

  const [myPos, setMyPos] = useState({ lat: 12.9716, lng: 77.5946 });

  // Synchronize Refs
  useEffect(() => {
    assignmentRef.current = assignment;
    alertRef.current = alert;
    phaseRef.current = phase;
  }, [assignment, alert, phase]);

  // Derived target setup for MiniMap
  const getMapData = () => {
    if (phase === 'en_route') return {
      coords: assignment?.routeToVictim,
      target: { lat: assignment?.lat, lng: assignment?.lng },
      label: 'VICTIM'
    };
    if (phase === 'at_scene') return {
      coords: null,
      target: { lat: assignment?.lat, lng: assignment?.lng },
      label: 'AT SCENE'
    };
    if (phase === 'hospital_bound') return {
      coords: hospitalRoute?.routeCoords,
      target: { lat: hospitalRoute?.hospital?.lat, lng: hospitalRoute?.hospital?.lng },
      label: 'ER UNIT'
    };
    if (phase === 'alerted') return {
      coords: null,
      target: { lat: alert?.lat, lng: alert?.lng },
      label: 'DISPATCH SIGNAL'
    };
    return { coords: null, target: null, label: 'STATION' };
  };

  const mapData = getMapData();
  // Merge local signals with server signals — local signals used for instant visual toggle
  // Server signals take precedence if signalId matches
  const mergedSignals = (() => {
    if (localSignals.length === 0) return signals;
    const serverIds = new Set(signals.map(s => s.signalId));
    const localOnly = localSignals.filter(s => !serverIds.has(s.signalId));
    return [...signals, ...localOnly];
  })();

  const fmt = (s) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;

  // 🛠️ Mission Handlers
  const handleAlert = (data) => {
    console.log('🚨🚨🚨 [DISPATCH] INCOMING EMERGENCY ALERT:', JSON.stringify(data));
    // Always accept new alerts — reset any stale recovery state first
    stopRouteAnimation();
    setAssignment(null);
    setAlert(data);
    setPhase('alerted');
    setDriverStatus('alerted');
    setAlertTimeout(30);
    
    // Play alarming beep
    if (!audioContextRef.current) {
       audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    
    const playBeep = () => {
       const osc = ctx.createOscillator();
       const gain = ctx.createGain();
       osc.type = 'square';
       osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
       osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3); // Drop to A4
       gain.gain.setValueAtTime(0.5, ctx.currentTime);
       gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
       osc.connect(gain);
       gain.connect(ctx.destination);
       osc.start();
       osc.stop(ctx.currentTime + 0.3);
    };
    
    playBeep();
    const interval = setInterval(playBeep, 1000);
    
    // Store interval to clear it later
    alertRef.current = { ...data, audioInterval: interval };
  };

  // ── Local Route Animation (avoids straight-line movement) ──────────────
  function buildLocalSignals(coords) {
    if (!coords || coords.length === 0) return [];
    const ROAD_NAMES = [
      'MG Road', 'Brigade Road', 'Hosur Road', 'Outer Ring Road',
      'Bellary Road', 'Mysore Road', 'Old Madras Road', 'Bannerghatta Road',
    ];
    const sigs = [];
    for (let i = 10; i < coords.length - 5; i += 10) {
      sigs.push({
        signalId: `local-sig-${i}`,
        routeIndex: i,
        lat: coords[i].lat,
        lng: coords[i].lng,
        ambulanceRoadName: ROAD_NAMES[Math.floor(Math.random() * ROAD_NAMES.length)],
        crossRoadName: ROAD_NAMES[Math.floor(Math.random() * ROAD_NAMES.length)],
        vehiclesStopped: Math.floor(Math.random() * 6) + 2,
        heldFor: 0,
        status: 'held',
        ambulanceRoadSignal: 'green',
        crossRoadSignal: 'red',
      });
    }
    return sigs;
  }

  function updateLocalSignalsFromIndex(sigs, idx) {
    return sigs.map(s => {
      const cleared = idx >= s.routeIndex;
      return { ...s, status: cleared ? 'cleared' : 'held', crossRoadSignal: cleared ? 'green' : 'red' };
    });
  }

  function startRouteAnimation(coords, onComplete) {
    if (!coords || coords.length === 0) return;
    clearInterval(routeAnimRef.current);
    routeIndexRef.current = 0;
    activeCoordsRef.current = coords;
    // Build local signals for instant toggle (every 10th coord)
    const initSigs = buildLocalSignals(coords);
    setLocalSignals(initSigs);
    setLivePos({ lat: coords[0].lat, lng: coords[0].lng });
    console.log(`🗺️ [ROUTE-ANIM] Starting animation: ${coords.length} coords, ${initSigs.length} signals`);

    routeAnimRef.current = setInterval(() => {
      const idx = routeIndexRef.current;
      const route = activeCoordsRef.current;
      if (!route || idx >= route.length - 1) {
        clearInterval(routeAnimRef.current);
        console.log('🏁 [ROUTE-ANIM] Reached end of route — all signals now GREEN');
        // Clear all local signals to green when route ends
        setLocalSignals(prev => prev.map(s => ({ ...s, status: 'cleared', crossRoadSignal: 'green' })));
        if (onComplete) onComplete();
        return;
      }
      const nextIdx = Math.min(idx + 3, route.length - 1);
      routeIndexRef.current = nextIdx;
      const coord = route[nextIdx];
      setLivePos({ lat: coord.lat, lng: coord.lng });
      // ✅ Instantly toggle signals green/red based on routeIndex
      setLocalSignals(prev => updateLocalSignalsFromIndex(prev, nextIdx));
    }, 1000);
  }

  function stopRouteAnimation() {
    clearInterval(routeAnimRef.current);
    routeAnimRef.current = null;
    activeCoordsRef.current = null;
    console.log('⛔ [ROUTE-ANIM] Stopped');
  }

  const handleAssignment = ({ emergencyId, emergency, routeToVictim, etaSeconds }) => {
    console.log('✅ [MISSION] LOCKED:', emergencyId, '| route points:', routeToVictim?.length);
    if (alertRef.current?.audioInterval) clearInterval(alertRef.current.audioInterval);
    
    const flattenedEm = {
      ...emergency,
      id: emergencyId,
      lat: emergency.lat || (emergency.location?.coordinates ? emergency.location.coordinates[1] : null),
      lng: emergency.lng || (emergency.location?.coordinates ? emergency.location.coordinates[0] : null),
    };
    setAssignment({ ...flattenedEm, routeToVictim, etaToVictim: etaSeconds });
    setPhase('en_route');
    setDriverStatus('on_mission');
    setAlert(null);
    startCountdown(etaSeconds);

    // ✅ When ambulance reaches victim, auto-emit victim_picked_up
    // This triggers AI hospital dispatch + hospital_route_assigned
    startRouteAnimation(routeToVictim, () => {
      console.log('🚨 [AUTO] Victim reached — auto-emitting victim_picked_up');
      setPhase('at_scene');
      setCountdown(0);
      // Short pause at scene (2s) then auto-dispatch to hospital
      setTimeout(() => {
        const reportSnapshot = { conditions: ['conscious'], notes: 'Auto-triage: Ambulance arrived.', time: Date.now() };
        socket.emit('victim_picked_up', {
          driverId: selectedProfile.id,
          emergencyId,
          victimReport: reportSnapshot,
        });
        setSignals([]); // Clear old server signals so map is clean for new route
        setPhase('awaiting_hospital');
        console.log('🏥 [AUTO] Waiting for hospital_route_assigned...');
      }, 2000);
    });
  };

  const handleHospitalRoute = ({ hospital, routeCoords, etaSeconds, aiResult, signalCount, signals: serverSignals }) => {
    console.log('🏥 [HOSPITAL-ROUTE] Received route to', hospital?.name, '| points:', routeCoords?.length);
    setHospitalRoute({ hospital, routeCoords, etaSeconds, aiResult, signalCount });
    
    // Clear old signals from the victim route so they don't render on the map anymore
    setLocalSignals([]); 
    if (serverSignals) setSignals(serverSignals);
    
    setPhase('hospital_bound');
    startCountdown(etaSeconds);
    // ✅ Animate along hospital route with same signal logic as victim route
    // When complete, auto-mark mission complete and reset driver
    startRouteAnimation(routeCoords, () => {
      console.log('🎳 [AUTO] Hospital reached — mission complete!');
      const assignId = assignmentRef.current?.id;
      if (assignId) {
        socket.emit('mission_complete', {
          emergencyId: assignId,
          hospitalId: hospital?.id || 'h1',
        });
      }
      setTimeout(() => {
        handleArrivedComplete();
      }, 2000); // 2s pause to let "arrived" display
    });
  };

  // 📡 Socket Synchronizer
  useEffect(() => {
    if (!selectedProfile) return;

    // Register with fallback coordinates if stations aren't set
    const sLat = myPos.lat || 12.9716;
    const sLng = myPos.lng || 77.5946;

    const registerDriver = () => {
      console.log('📡 [NETWORK] Synchronizing Driver:', selectedProfile.id);
      socket.emit('driver_register', {
        driverId: selectedProfile.id,
        name: selectedProfile.name,
        ambulanceId: selectedProfile.ambulanceId,
        lat: sLat,
        lng: sLng,
      });
      setDriverStatus('available');
    };

    // ✅ Register ALL listeners FIRST — before registering with server
    // This prevents the replay race: server sends emergency_alert immediately
    // on driver_register, but listener wasn't set up yet (singleton socket).
    socket.on('connect', registerDriver);
    socket.on('emergency_alert', handleAlert);

    
    socket.on('case_assigned', (data) => {
      handleAssignment(data);
    });

    socket.on('hospital_route_assigned', handleHospitalRoute);

    // ambulance_positions is handled locally via startRouteAnimation — no listener needed

    socket.on('full_state', (data) => {
      if (data.signals) setSignals(data.signals);
      if (data.hospitalStatus) setHospitals(data.hospitalStatus);

      // Never auto-recover if driver just accepted a new alert
      if (alertRef.current) return;

      const drvId = selectedProfile.id;
      const thirtyMinAgo = Date.now() - 30 * 60 * 1000; // Only recover RECENT missions
      const ourEm = data.emergencies?.find(e =>
        e.assignedDriverId === drvId &&
        ['en_route', 'at_scene', 'hospital_bound'].includes(e.status) &&
        new Date(e.createdAt).getTime() > thirtyMinAgo // ignore stale DB missions
      );

      if (ourEm) {
        // Sync routeIndex from server so local anim stays in lock-step
        if (ourEm.routeIndex != null && activeCoordsRef.current) {
          const serverIdx = Math.min(ourEm.routeIndex, activeCoordsRef.current.length - 1);
          routeIndexRef.current = serverIdx;
          const coord = activeCoordsRef.current[serverIdx];
          if (coord) setLivePos({ lat: coord.lat, lng: coord.lng });
          console.log(`📡 [SYNC] routeIndex=${serverIdx}/${activeCoordsRef.current.length - 1}`);
        }

        // AUTO-RECOVERY: restore state after page refresh (only if not already set)
        if (!assignmentRef.current && ourEm.routeCoords?.length) {
          console.log('🔄 [RECOVERY] Restoring recent mission:', ourEm.id, ourEm.status);
          const flattened = { ...ourEm, id: ourEm.id, routeToVictim: ourEm.status === 'en_route' ? ourEm.routeCoords : null, etaToVictim: 300 };
          setAssignment(flattened);
          setDriverStatus('on_mission');
          startRouteAnimation(ourEm.routeCoords);
        }

        if (ourEm.status === 'en_route' && phaseRef.current === 'idle') setPhase('en_route');
        else if (ourEm.status === 'at_scene' && phaseRef.current === 'en_route') {
          console.log('🚨 [PHASE] at_scene — stopping route anim');
          stopRouteAnimation();
          setPhase('at_scene');
          setCountdown(0);
        } else if (ourEm.status === 'hospital_bound' && phaseRef.current !== 'hospital_bound') {
          setPhase('hospital_bound');
          if (!activeCoordsRef.current && ourEm.routeCoords?.length) {
            const hosp = data.hospitalStatus?.find(h => h.id === ourEm.selectedHospitalId);
            setHospitalRoute({ hospital: hosp || { name: 'Destination Hospital' }, routeCoords: ourEm.routeCoords, aiResult: { composite: 95 } });
            startRouteAnimation(ourEm.routeCoords);
          }
        } else if (ourEm.status === 'completed' && phaseRef.current === 'hospital_bound') {
          stopRouteAnimation();
          handleArrivedComplete();
        }
      }
    });

    socket.on('hospital_confirmed_ready', ({ message }) => setHospitalReadyMsg(message));

    socket.on('case_assigned_broadcast', ({ emergencyId, driverName }) => {
       if (alertRef.current?.emergencyId === emergencyId) {
          if (alertRef.current.audioInterval) clearInterval(alertRef.current.audioInterval);
          setCaseLocked({ message: `${driverName} took this case.` });
          setPhase('idle');
          setDriverStatus('available');
          setAlert(null);
          setTimeout(() => setCaseLocked(null), 3000);
       }
    });

    // ✅ ALL listeners registered — now safe to register with server
    // Server may immediately replay emergency_alert on driver_register;
    // we must be listening BEFORE we announce ourselves.
    registerDriver();

    return () => {
      socket.off('connect', registerDriver);
      socket.off('emergency_alert', handleAlert);
      socket.off('case_assigned');
      socket.off('full_state');
      socket.off('hospital_route_assigned');
      socket.off('ambulance_positions');
      socket.off('hospital_confirmed_ready');
      socket.off('case_assigned_broadcast');
      if (alertRef.current?.audioInterval) clearInterval(alertRef.current.audioInterval);
      stopRouteAnimation();
    };
  }, [selectedProfile]); // ONLY re-run on profile select

  function startCountdown(s) {
    setCountdown(s);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(p => { if (p <= 1) { clearInterval(countdownRef.current); return 0; } return p - 1; });
    }, 1000);
  }

  useEffect(() => {
    if (phase === 'alerted' && alertTimeout > 0) {
      const timer = setTimeout(() => setAlertTimeout(t => t - 1), 1000);
      return () => clearTimeout(timer);
    } else if (phase === 'alerted' && alertTimeout === 0) {
      // Auto-decline after 30s
      declineCase();
    }
  }, [phase, alertTimeout]);

  function acceptCase() {
    if (alertRef.current?.audioInterval) clearInterval(alertRef.current.audioInterval);
    socket.emit('driver_accept', { driverId: selectedProfile.id, emergencyId: alert.emergencyId });
  }

  function declineCase() {
    if (alertRef.current?.audioInterval) clearInterval(alertRef.current.audioInterval);
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


  if (!selectedProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-[40px] p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center">
          <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-8 shadow-lg shadow-blue-500/30">🚑</div>
          <h2 className="text-3xl font-black text-slate-900 mb-2 italic tracking-tighter">DRIVER HUB</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.3em] mb-10">Fleet Identification Required</p>
          <div className="space-y-4">
            {DRIVER_PROFILES.map(p => (
              <button key={p.id} onClick={() => setSelectedProfile(p)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:border-blue-300 hover:bg-white hover:shadow-md transition-all group relative overflow-hidden">
                <div className="absolute inset-0 bg-blue-50 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
                <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center font-black text-blue-600 z-10 shadow-sm">
                  {p.avatar}
                </div>
                <div className="text-left z-10">
                  <p className="text-slate-900 font-black text-sm">{p.name}</p>
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
    <div className="bg-slate-50 text-slate-900 font-sans flex flex-col min-h-screen">
      <style>{`
        @keyframes urgent-pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 70% { box-shadow: 0 0 0 40px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
        @keyframes slide-up { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .urgent-overlay { background: radial-gradient(circle, rgba(254, 226, 226, 0.9) 0%, rgba(255, 255, 255, 0.95) 100%); }
        .ambulance-glide { transition: all 1s linear !important; }
        .alert-card { animation: slide-up 0.35s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>

      {/* ── FULL-SCREEN ALERT OVERLAY (cannot be missed) ── */}
      {phase === 'alerted' && alert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
             style={{ background: 'rgba(15,15,15,0.82)', backdropFilter: 'blur(6px)' }}>
          <div className="alert-card bg-white rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden border-4 border-red-500">
            {/* Countdown bar */}
            <div className="h-2 bg-red-100 w-full">
              <div className="h-full bg-gradient-to-r from-red-600 to-orange-500 transition-all duration-1000"
                   style={{ width: `${(alertTimeout / 30) * 100}%` }} />
            </div>
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                <span className="text-red-600 font-black text-xs uppercase tracking-widest">{alertTimeout}s · URGENT DISPATCH</span>
              </div>
              <div className="flex items-start gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-4xl shrink-0">🚑</div>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 italic tracking-tighter leading-tight mb-1">{alert.type || 'Emergency'}</h2>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                    {alert.lat && alert.lng ? `${kmDistance(alert.lat, alert.lng, myPos.lat, myPos.lng).toFixed(1)} km away` : 'Location shared'}
                  </p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-200">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Situation</p>
                <p className="text-slate-800 text-sm font-medium italic">"{alert.description || 'Emergency assistance required immediately.'}"</p>
              </div>
              <div className="space-y-3">
                <button onClick={acceptCase}
                  className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white font-black py-5 rounded-2xl text-xl shadow-lg shadow-red-500/30 active:scale-[0.98] transition-all">
                  ✓ ACCEPT MISSION
                </button>
                <button onClick={declineCase}
                  className="w-full bg-white text-slate-500 font-bold py-4 rounded-2xl text-sm uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all">
                  ✕ DECLINE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200">
             <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[driverStatus]} animate-pulse shadow-[0_0_10px_currentColor]`} />
             <span className={`${STATUS_TEXT[driverStatus]} text-[10px] font-black uppercase tracking-[0.2em]`}>{STATUS_LABELS[driverStatus]}</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-none">ID: {selectedProfile.ambulanceId}</span>
          </div>
        </div>
        <button className="text-slate-400 hover:text-slate-900 transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
      </header>

      {/* Main Mission Control View */}
      <main className="flex-1 flex flex-col lg:flex-row relative">
        


        {/* Left Column: Mission Console (40%) */}
        <div className="lg:w-[40%] flex flex-col border-r border-slate-200 bg-slate-50/50 shrink-0">
          
          {phase === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-60">
               <div className="text-8xl mb-6 grayscale text-slate-400">📡</div>
               <h3 className="text-3xl font-black italic tracking-tighter mb-4 text-slate-900">READY FOR DISPATCH</h3>
               <p className="text-slate-500 text-sm font-bold uppercase tracking-widest leading-relaxed">Positioned at Standby Cluster<br/>Awaiting Golden Hour Signal</p>
            </div>
          )}

          {phase === 'alerted' && alert && (
            <div className="flex-1 overflow-y-auto bg-red-50 relative flex flex-col">
                 <div className="h-1.5 bg-red-200 w-full relative z-10 shrink-0">
                    <div className="h-full bg-gradient-to-r from-red-500 to-orange-500 shadow-[0_0_10px_#ef4444]" style={{ width: `${(alertTimeout / 30) * 100}%`, transition: 'width 1s linear' }} />
                 </div>
                 <div className="p-8 pb-4">
                    <div className="flex items-center gap-3 mb-6 bg-red-100/50 px-4 py-2 rounded-xl inline-flex border border-red-200">
                       <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shadow-[0_0_8px_#ef4444]" />
                       <p className="text-red-700 mx-1 font-black text-xs uppercase tracking-[0.2em]">{alertTimeout}s • URGENT DISPATCH</p>
                    </div>
                    <div className="space-y-6">
                       <div className="flex items-start gap-5">
                          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-4xl shadow-sm border border-red-100 shrink-0">🚑</div>
                          <div>
                             <h2 className="text-3xl font-black text-slate-900 italic tracking-tighter mb-1 leading-tight">{alert.type}</h2>
                             <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Est. Distance: {kmDistance(alert.lat, alert.lng, myPos.lat, myPos.lng).toFixed(1)} km</p>
                          </div>
                       </div>
                       
                       <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 border-l-4 border-l-red-500">
                          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2 block">Situation Provided</p>
                          <p className="text-slate-800 text-sm font-medium italic">"{alert.description || 'Incoming emergency request. Immediate dispatch required.'}"</p>
                       </div>
                    </div>
                 </div>

                 <div className="p-8 pt-4 mt-auto space-y-4">
                    <button onClick={acceptCase} className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-black py-5 rounded-2xl text-xl shadow-lg shadow-red-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                      ✓ ACCEPT MISSION
                    </button>
                    <button onClick={declineCase} className="w-full bg-white text-slate-500 font-bold py-4 rounded-2xl text-sm uppercase tracking-widest border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-all">
                      ✕ DECLINE
                    </button>
                 </div>
            </div>
          )}
          
          {phase !== 'idle' && phase !== 'alerted' && (
            <div className="p-8 space-y-8 animate-in fade-in duration-500 bg-white shadow-[0_0_40px_rgba(0,0,0,0.02)] min-h-full">
               {/* Mission Ident */}
               <div className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.3em] mb-1">Active Mission</p>
                        <h4 className="text-slate-900 text-3xl font-black italic tracking-tighter">#{assignment?.id || 'ALPHA-1'}</h4>
                     </div>
                     <span className="bg-blue-50 text-blue-600 border border-blue-100 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">Corridor Active</span>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100">
                     <div className="text-center flex-1 border-r border-slate-200">
                        <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">ETA</p>
                        <p className="text-slate-900 text-2xl font-black tabular-nums">{countdown !== null ? fmt(countdown) : '--'}</p>
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
                     <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 shadow-sm">
                        <p className="text-blue-600 font-black text-sm uppercase italic mb-2">Phase: 1 — Victim Intercept</p>
                        <p className="text-slate-600 text-sm leading-relaxed">Proceed at code-3 priority. Green Corridor is being established in your path.</p>
                     </div>
                     <button className="w-full bg-slate-100 text-slate-400 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest border border-slate-200 cursor-not-allowed">
                        Awaiting Victim Arrival
                     </button>
                  </div>
               )}

               {phase === 'awaiting_hospital' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-8 space-y-4 shadow-sm text-center">
                     <div className="text-5xl animate-bounce">🏥</div>
                     <h3 className="text-emerald-700 font-black text-xl italic tracking-tighter">AI Dispatching Hospital</h3>
                     <p className="text-slate-500 text-sm">Scoring hospitals by distance, beds and corridor availability...</p>
                     <div className="flex justify-center gap-2 pt-2">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                     </div>
                  </div>
               )}

               {phase === 'at_scene' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-[32px] p-8 space-y-6 shadow-md">
                     <h3 className="text-amber-600 font-black text-2xl italic tracking-tighter">🩺 FIELD TRIAGE</h3>
                     <div className="grid grid-cols-2 gap-3">
                        {VICTIM_CONDITIONS.map(c => (
                          <button key={c.id} onClick={() => toggleCondition(c.id)} className={`p-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-tight transition-all ${victimReport.conditions.includes(c.id) ? 'bg-amber-500 text-white border-amber-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 shadow-sm'}`}>
                            {c.label}
                          </button>
                        ))}
                     </div>
                     <textarea rows={2} placeholder="Symptom notes..." className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-slate-900 text-sm outline-none focus:border-amber-500 shadow-inner" value={victimReport.notes} onChange={e=>setVictimReport(v=>({...v, notes:e.target.value}))} />
                     <button onClick={handleVictimPickup} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl text-xl shadow-lg shadow-slate-900/20 active:scale-95 transition-all hover:bg-slate-800">PICKUP & DISPATCH</button>
                  </div>
               )}

               {phase === 'hospital_bound' && hospitalRoute && (
                  <div className="space-y-6">
                     <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 shadow-sm">
                        <p className="text-emerald-600 text-[10px] font-black uppercase tracking-widest mb-1">Destination Facility</p>
                        <h4 className="text-slate-900 text-2xl font-black italic tracking-tighter mb-4">{hospitalRoute.hospital.name}</h4>
                        {hospitalReadyMsg && (
                          <div className="bg-white p-4 rounded-xl border border-emerald-200 border-l-4 border-l-emerald-500 italic text-[11px] text-emerald-700 shadow-sm">
                             "{hospitalReadyMsg}"
                          </div>
                        )}
                     </div>

                     <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                        <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-3">AI Score: {hospitalRoute.aiResult?.composite}% Matching</p>
                        <div className="flex gap-1">
                           <div className="h-1 bg-blue-500 rounded-full flex-1 shadow-sm" />
                           <div className="h-1 bg-blue-500 rounded-full flex-1 shadow-sm" />
                           <div className="h-1 bg-blue-500 rounded-full flex-1 shadow-sm" />
                           <div className="h-1 bg-slate-200 rounded-full flex-1 shadow-inner" />
                        </div>
                     </div>
                  </div>
               )}

               {caseLocked && (
                 <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl p-4 text-center font-black animate-bounce shadow-sm">
                    ✅ {caseLocked.message}
                 </div>
               )}
            </div>
          )}
        </div>

        {/* Right Column: Dynamic Map (60%) */}
        <div className="lg:w-[60%] min-h-[500px] shrink-0 relative bg-slate-100">
           <MiniMap 
             coords={mapData.coords} 
             currentPos={livePos || myPos}
             targetPos={mapData.target}
             targetLabel={mapData.label}
             forceResize={phase}
             phase={phase}
             signals={mergedSignals}
             hospitals={hospitals}
           />
           
           {/* Map HUD Components */}
           <div className="absolute top-6 right-6 flex flex-col gap-3 pointer-events-none z-[1000]">
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex items-center gap-4">
                 <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 shadow-inner">🛰️</div>
                 <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Network Status</p>
                    <p className="text-xs text-slate-900 font-black">HIGH PRECISION DATA</p>
                 </div>
              </div>
           </div>
        </div>

      </main>
    </div>
  );
}
