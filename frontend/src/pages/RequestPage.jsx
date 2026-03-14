import API from "../config";
import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';

const EMERGENCY_TYPES = [
  { id: 'road_accident', label: 'Road Accident', icon: '🚗', color: 'border-orange-500', bg: 'bg-orange-50', textColor: 'text-orange-700' },
  { id: 'cardiac', label: 'Cardiac Arrest', icon: '❤️', color: 'border-red-500', bg: 'bg-red-50', textColor: 'text-red-700' },
  { id: 'fire_injury', label: 'Fire / Burns', icon: '🔥', color: 'border-orange-500', bg: 'bg-orange-50', textColor: 'text-orange-700' },
  { id: 'trauma', label: 'Trauma / Fall', icon: '🩹', color: 'border-purple-500', bg: 'bg-purple-50', textColor: 'text-purple-700' },
  { id: 'respiratory', label: 'Respiratory', icon: '🫁', color: 'border-cyan-500', bg: 'bg-cyan-50', textColor: 'text-cyan-700' },
  { id: 'unknown', label: 'Other Emergency', icon: '🆘', color: 'border-slate-400', bg: 'bg-slate-100', textColor: 'text-slate-700' },
];

export default function RequestPage() {
  const [step, setStep] = useState('form'); // form | submitting | assigned | tracking
  const [emergencyType, setEmergencyType] = useState('');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  const [location, setLocation] = useState(null);
  const [locError, setLocError] = useState('');
  const [emergencyId, setEmergencyId] = useState('');
  const [alertedCount, setAlertedCount] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [pulseAnim, setPulseAnim] = useState(false);
  const countdownRef = useRef(null);
  const stepRef = useRef(step);
  const emergencyIdRef = useRef(emergencyId);
  const reporterNameRef = useRef(reporterName);
  const emergencyTypeRef = useRef(emergencyType);
  const sessionIdRef = useRef(`SESS-${Math.random().toString(36).slice(2, 9).toUpperCase()}`);

  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { emergencyIdRef.current = emergencyId; }, [emergencyId]);
  useEffect(() => { reporterNameRef.current = reporterName; }, [reporterName]);
  useEffect(() => { emergencyTypeRef.current = emergencyType; }, [emergencyType]);

  // ON MOUNT: State & Context Init
  useEffect(() => {
    // DEMO MODE: Static location once per session
    const bengaluruLocations = [
      { lat: 12.9352, lng: 77.6245 }, { lat: 12.9716, lng: 77.5946 },
      { lat: 12.9551, lng: 77.6085 }, { lat: 12.9279, lng: 77.6271 },
      { lat: 12.9634, lng: 77.5855 }, { lat: 12.9778, lng: 77.6400 },
      { lat: 12.9516, lng: 77.6473 },
    ];
    const pick = bengaluruLocations[Math.floor(Math.random() * bengaluruLocations.length)];
    setLocation({
      lat: pick.lat + (Math.random() - 0.5) * 0.01,
      lng: pick.lng + (Math.random() - 0.5) * 0.01,
    });

    console.log(`🚀 [SESSION] Initialized: ${sessionIdRef.current}`);

    // STABLE LISTENERS (Single Instance)
    socket.on('connect', () => console.log('✅ [CORE] Socket Connected'));
    socket.on('disconnect', () => console.warn('❌ [CORE] Socket Disconnected'));

    socket.on('new_emergency', (em) => {
      console.log('📡 [NETWORK] Global SOS broadcast:', em.id, em.sessionId);

      // DETERMINISTIC MATCH: Use Session ID
      const isOurEmergency = (em.sessionId === sessionIdRef.current) ||
        (em.reporterName === reporterNameRef.current && stepRef.current === 'submitting');

      if (isOurEmergency) {
        console.log('✨ [SYNC] Claimed our SOS ACK:', em.id);
        setEmergencyId(em.id);
        setStep('assigned');
        setPulseAnim(true);
      }
    });

    socket.on('sos_request_failed', ({ error }) => {
      console.error('❌ SOS Request Failed:', error);
      alert(error);
      setStep('form');
    });

    socket.on('full_state', ({ emergencies }) => {
      const currentStep = stepRef.current;
      const currentId = emergencyIdRef.current;
      const mySessionId = sessionIdRef.current;

      // Fallback: If we are stuck in 'submitting' find by session OR name
      if (currentStep === 'submitting') {
        const ourEm = emergencies.find(e =>
          e.sessionId === mySessionId ||
          (e.reporterName === (reporterNameRef.current || 'Unknown Citizen') && e.status === 'pending')
        );
        if (ourEm) {
          console.log('🔦 [SYNC] Recovered SOS via full_state:', ourEm.id);
          setEmergencyId(ourEm.id);
          setStep('assigned');
          return;
        }
      }

      if (currentId) {
        const em = emergencies.find(e => e.id === currentId);
        if (em && em.assignedDriverId && em.status !== 'pending') {
          setStep('tracking');
          // Start ETA countdown only if it hasn't started
          if (em.routeCoords && !countdownRef.current_timer_active) {
            countdownRef.current_timer_active = true;
            setEtaSeconds(300);
            startCountdown(300);
          }
        }
      }
    });

    return () => {
      socket.off('new_emergency');
      socket.off('full_state');
      socket.off('sos_request_failed');
      socket.off('connect');
      socket.off('disconnect');
      clearInterval(countdownRef.current);
    };
  }, []);

  function startCountdown(seconds) {
    setCountdown(seconds);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  function handleSubmit(overrideType) {
    const typeToUse = overrideType || emergencyType;
    if (!typeToUse) return;
    if (!location) return;
    setStep('submitting');
    socket.emit('sos_request', {
      lat: location.lat,
      lng: location.lng,
      type: EMERGENCY_TYPES.find(t => t.id === typeToUse)?.label || typeToUse,
      description: description || 'Panic Button Triggered',
      reporterName: reporterName || 'Unknown Citizen',
      reporterPhone,
      sessionId: sessionIdRef.current,
    });

    // Safety timeout: If no ACK in 20s, revert to avoid infinite loading
    setTimeout(() => {
      if (stepRef.current === 'submitting') {
        console.warn('⚠️ SOS submission timed out. Reverting to form.');
        setStep('form');
        alert('Request timed out. Please check your connection and try again.');
      }
    }, 20000);
  }

  function formatEta(s) {
    if (!s && s !== 0) return '--';
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  const selectedType = EMERGENCY_TYPES.find(t => t.id === emergencyType);

  return (
    <>
      <style>{`
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:1} 100%{transform:scale(1.8);opacity:0} }
        @keyframes fade-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .fade-in { animation: fade-in 0.4s ease forwards; }
        .sos-btn {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          box-shadow: 0 10px 30px rgba(220, 38, 38, 0.3);
          color: white;
        }
        .sos-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 15px 40px rgba(220, 38, 38, 0.4);
        }
        .sos-btn:active:not(:disabled) { transform: scale(0.98); box-shadow: 0 5px 15px rgba(220, 38, 38, 0.3); }
      `}</style>

      <div className="min-h-screen bg-slate-50 flex flex-col items-center pb-12 pt-8 px-4 font-sans text-slate-900">

        {/* Header */}
        <div className="w-full max-w-4xl flex flex-col items-center gap-2 mb-8 fade-in">
          <span className="bg-red-100 text-red-700 rounded-full px-4 py-1 text-xs font-bold tracking-widest uppercase border border-red-200 shadow-sm">
            Emergency Response
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-center mx-0 mt-2 tracking-tight text-slate-900">Request Emergency Help</h1>
          <p className="text-slate-500 text-sm md:text-base text-center mx-0 font-medium">Your location will be shared automatically with the nearest ambulance</p>
        </div>

        {step === 'form' && (
          <div className="w-full max-w-4xl space-y-8">

            {/* Industry Feature: Single-Click Quick SOS */}
            <div className="bg-white/80 backdrop-blur-xl border border-red-100 shadow-[0_8px_30px_rgb(220,38,38,0.06)] rounded-3xl p-8 text-center fade-in relative overflow-hidden transition-all">
              {/* Warning Ribbon */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-400 to-red-500"></div>

              <div className="mb-8 p-4 bg-red-50 rounded-xl border border-red-100">
                <h2 className="text-red-700 font-bold text-lg mb-2 flex items-center justify-center gap-2">
                  <span>⚠️</span> IMPORTANT WARNING <span>⚠️</span>
                </h2>
                <p className="font-semibold text-slate-800 text-lg italic tracking-wide">
                  "A Single Click Can Save a Life, Or Destroy A Life. Think Before Click."
                </p>
                <p className="text-red-500/80 text-[11px] mt-2 uppercase tracking-widest font-bold">False requests divert vital ambulances.</p>
              </div>

              <button
                onClick={() => { setEmergencyType('unknown'); handleSubmit(); }}
                className="w-48 h-48 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-6xl shadow-[0_10px_40px_rgba(225,29,72,0.4)] hover:scale-105 active:scale-95 transition-all mx-auto group ring-0 hover:ring-[20px] ring-red-500/10 relative cursor-pointer"
              >
                <span className="relative z-10 drop-shadow-md">🆘</span>
                <div className="absolute inset-0 rounded-full border-[3px] border-white/30"></div>
              </button>
              <p className="mt-8 text-slate-500 text-xs font-bold uppercase tracking-widest">Single-Click Ambulance Dispatch</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Emergency Type (Takes full width on tablet, 1 column on desktop) */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm fade-in">
                <span className="text-slate-500 text-[11px] font-bold tracking-widest uppercase mb-4 block ml-1">Select Emergency Type</span>
                <div className="grid grid-cols-2 gap-3">
                  {EMERGENCY_TYPES.map(t => {
                    const isSelected = emergencyType === t.id;
                    return (
                      <button
                        key={t.id}
                        className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer text-left transition-all duration-300 transform hover:-translate-y-0.5
                          ${isSelected ? `${t.color} ${t.bg} shadow-md` : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:shadow-sm'}`}
                        onClick={() => setEmergencyType(t.id)}
                      >
                        <span className="text-2xl drop-shadow-sm">{t.icon}</span>
                        <span className={`text-sm font-bold leading-tight ${isSelected ? t.textColor : 'text-slate-700'}`}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Patient Details & Location */}
              <div className="flex flex-col gap-6 fade-in" style={{ animationDelay: '0.1s' }}>

                {/* Description */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm transition-shadow hover:shadow-md hover:border-blue-100">
                  <span className="text-slate-500 text-[11px] font-bold tracking-widest uppercase mb-4 block ml-1">Situation / Details</span>
                  <textarea
                    rows={3}
                    placeholder="e.g. 2 people injured, one unconscious..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 text-sm font-medium outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10 transition-all resize-y placeholder:text-slate-400"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                {/* Contact Info */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm transition-shadow hover:shadow-md hover:border-blue-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 text-[11px] font-bold tracking-widest uppercase mb-2 block ml-1">Name (Optional)</span>
                      <input
                        placeholder="Your name"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-slate-900 text-sm font-medium outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10 transition-all placeholder:text-slate-400"
                        value={reporterName} onChange={e => setReporterName(e.target.value)}
                      />
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] font-bold tracking-widest uppercase mb-2 block ml-1">Phone (Optional)</span>
                      <input
                        placeholder="+91 XXXXX XXXXX" type="tel"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-slate-900 text-sm font-medium outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-400/10 transition-all placeholder:text-slate-400"
                        value={reporterPhone} onChange={e => setReporterPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100 rounded-bl-full opacity-50 transition-transform group-hover:scale-110 pointer-events-none"></div>
                  <span className="text-slate-500 text-[11px] font-bold tracking-widest uppercase mb-4 block ml-1 relative z-10">Your Location</span>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center gap-3 relative z-10">
                    <span className="text-emerald-500 bg-emerald-100 p-2 rounded-xl text-lg shadow-sm">📍</span>
                    <div className="flex-1 min-w-0">
                      {location ? (
                        <span className="text-emerald-600 text-sm font-bold truncate block">
                          GPS Active — {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-amber-500 text-sm font-semibold block">Acquiring location…</span>
                      )}
                      {locError && <div className="text-amber-600 font-medium text-[11px] mt-1 truncate">{locError}</div>}
                    </div>
                    {location && <span className="text-emerald-500 text-lg font-bold">✓</span>}
                  </div>
                </div>

              </div>
            </div>

            {/* SOS Button */}
            <div className="mt-10 flex flex-col items-center">
              <button
                className={`sos-btn w-full max-w-lg rounded-full py-5 px-8 text-lg font-extrabold tracking-wide uppercase flex items-center justify-center gap-4 transition-all duration-300 ${(!emergencyType || !location) ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer'}`}
                disabled={!emergencyType || !location}
                onClick={handleSubmit}
              >
                <div className="bg-white/20 p-1.5 rounded-full drop-shadow-md">
                  <span className="text-2xl block text-white">🆘</span>
                </div>
                Request Urgent Assistance
              </button>
              {!emergencyType && (
                <p className="text-amber-600 text-sm text-center mt-4 font-bold tracking-tight bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl">
                  ⚠️ Please select an emergency type above first
                </p>
              )}
            </div>
          </div>
        )}

        {/* STATUS VIEWS */}
        <div className="w-full max-w-xl mx-auto">
          {step === 'submitting' && (
            <div className="bg-white rounded-3xl p-10 border border-amber-200 shadow-[0_8px_30px_rgb(245,158,11,0.12)] fade-in text-center mt-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-amber-500"></div>
              <div className="w-16 h-16 rounded-full border-[5px] border-amber-100 border-t-amber-500 animate-spin mx-auto mb-6" />
              <p className="text-slate-900 font-extrabold tracking-tight text-2xl mb-2">SIGNALING DISPATCH…</p>
              <p className="text-slate-500 text-sm font-medium">Alerting all nearby ambulances via priority network. Please wait...</p>
            </div>
          )}

          {step === 'assigned' && (
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-amber-200 shadow-[0_10px_40px_rgb(245,158,11,0.15)] fade-in mt-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-amber-500"></div>
              <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-6 mb-8">
                <div className="relative shrink-0">
                  <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 shadow-[0_4px_14px_0_rgba(245,158,11,0.2)] flex items-center justify-center text-4xl z-10 relative">
                    ⏳
                  </div>
                  {pulseAnim && (
                    <>
                      <div className="absolute inset-0 rounded-[2rem] border-2 border-amber-400 animate-[pulse-ring_1.5s_ease-out_infinite]" />
                      <div className="absolute inset-0 rounded-[2rem] border-2 border-amber-400 animate-[pulse-ring_1.5s_ease-out_infinite] [animation-delay:0.5s]" />
                    </>
                  )}
                </div>
                <div className="flex flex-col justify-center h-20">
                  <p className="text-slate-900 font-extrabold tracking-tight text-2xl mb-1">SOS Received — Awaiting Driver</p>
                  <p className="text-amber-600 font-bold bg-amber-50 inline-block px-3 py-1 rounded-lg border border-amber-200 self-start sm:self-auto">{alertedCount} nearby driver{alertedCount !== 1 ? 's' : ''} alerted</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                  <span className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Emergency ID</span>
                  <span className="text-blue-600 font-bold font-mono text-sm bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg shadow-sm">{emergencyId}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                  <span className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Type</span>
                  <span className="text-slate-900 text-sm font-bold bg-white px-3 py-1.5 shadow-sm rounded-lg border border-slate-200 flex items-center gap-2">{selectedType?.icon} {selectedType?.label}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Location</span>
                  <span className="text-emerald-600 text-sm font-bold bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg shadow-sm">Shared ✓</span>
                </div>
              </div>

              <p className="text-slate-500 text-sm font-medium text-center mt-8">
                Keep this screen open. A driver will be assigned shortly and ETA will be shown.
              </p>
            </div>
          )}

          {step === 'tracking' && (
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-emerald-200 shadow-[0_10px_40px_rgba(16,185,129,0.15)] fade-in mt-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 to-emerald-500 z-20"></div>

              <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-6 mb-8">
                <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 shadow-[0_4px_14px_0_rgba(16,185,129,0.2)] flex items-center justify-center text-4xl shrink-0 z-10 relative">
                  🚑
                </div>
                <div className="flex flex-col justify-center h-20">
                  <p className="text-emerald-600 font-extrabold tracking-tight text-3xl mb-1">Ambulance Assigned!</p>
                  <p className="text-slate-600 font-medium text-sm">Driver is on their way with a Green Corridor</p>
                </div>
              </div>

              {countdown !== null && (
                <div className="bg-slate-50 rounded-3xl p-8 text-center mb-8 border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute -inset-10 bg-emerald-400/5 blur-3xl rounded-full"></div>
                  <p className="text-slate-500 text-xs font-bold tracking-widest uppercase mb-4 relative z-10">Estimated Arrival</p>
                  <p className="text-slate-900 text-6xl font-black m-0 font-variant-numeric-tabular-nums tracking-tight relative z-10 drop-shadow-sm">
                    {formatEta(countdown)}
                  </p>

                  <div className="bg-slate-200/80 h-3 rounded-full mt-8 overflow-hidden relative z-10 shadow-inner">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-1000 ease-linear rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                      style={{ width: `${Math.max(0, (etaSeconds - countdown) / etaSeconds * 100 || 50)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-5 mb-6 shadow-sm hover:shadow-md transition-shadow duration-300">
                <p className="text-emerald-700 font-extrabold text-sm mb-2 flex items-center gap-2">
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 shadow-sm"></span>
                  </span>
                  Green Corridor Active
                </p>
                <p className="text-slate-600 font-medium text-xs leading-relaxed">Traffic signals along the route are being cleared automatically for a faster arrival.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-2xl p-5 text-center border border-slate-200 shadow-sm transition-transform hover:-translate-y-1 duration-300">
                  <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-2 font-bold">Case ID</p>
                  <p className="text-blue-600 font-bold text-sm font-mono bg-blue-50/50 inline-block px-2 py-1 rounded">{emergencyId}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-5 text-center border border-slate-200 shadow-sm transition-transform hover:-translate-y-1 duration-300">
                  <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-2 font-bold">Status</p>
                  <p className="text-emerald-600 font-bold text-sm bg-emerald-50/50 inline-block px-2 py-1 rounded">En Route 📍</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info footer */}
        <div className="w-full max-w-4xl text-center mt-12 mb-4">
          <p className="text-slate-400 text-xs font-semibold flex items-center justify-center gap-2">
            <span className="text-slate-400">🔒</span> Your location data is used only to dispatch emergency services dynamically
          </p>
        </div>

      </div>
    </>
  );
}
