import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';

const EMERGENCY_TYPES = [
  { id: 'road_accident', label: 'Road Accident', icon: '🚗', color: 'border-orange-500', bg: 'bg-orange-500/20', textColor: 'text-orange-500' },
  { id: 'cardiac', label: 'Cardiac Arrest', icon: '❤️', color: 'border-red-500', bg: 'bg-red-500/20', textColor: 'text-red-500' },
  { id: 'fire_injury', label: 'Fire / Burns', icon: '🔥', color: 'border-orange-500', bg: 'bg-orange-500/20', textColor: 'text-orange-500' },
  { id: 'trauma', label: 'Trauma / Fall', icon: '🩹', color: 'border-purple-500', bg: 'bg-purple-500/20', textColor: 'text-purple-500' },
  { id: 'respiratory', label: 'Respiratory', icon: '🫁', color: 'border-cyan-500', bg: 'bg-cyan-500/20', textColor: 'text-cyan-500' },
  { id: 'unknown', label: 'Other Emergency', icon: '🆘', color: 'border-slate-500', bg: 'bg-slate-500/20', textColor: 'text-slate-500' },
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

  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { emergencyIdRef.current = emergencyId; }, [emergencyId]);

  useEffect(() => {
    // Get GPS on load
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          // Fallback to random Bengaluru location
          setLocation({ lat: 12.88 + Math.random() * 0.18, lng: 77.50 + Math.random() * 0.22 });
          setLocError('GPS unavailable — using approximate location');
        }
      );
    } else {
      setLocation({ lat: 12.9716, lng: 77.5946 });
    }

    socket.on('new_emergency', (em) => {
      console.log('📡 [NETWORK] SOS ACK received:', em.id);
      if (stepRef.current === 'submitting') {
        setEmergencyId(em.id);
        setStep('assigned');
        setPulseAnim(true);
      }
    });

    socket.on('full_state', ({ emergencies }) => {
      if (!emergencyIdRef.current) {
        const ourEm = emergencies.find(e => e.reporterName === (reporterName || 'Unknown Citizen') && e.status === 'pending');
        if (ourEm) setEmergencyId(ourEm.id);
      } else {
        const em = emergencies.find(e => e.id === emergencyIdRef.current);
        if (em && em.assignedDriverId && em.status !== 'pending') {
          setStep('tracking');
          if (em.routeCoords && etaSeconds === null) {
            setEtaSeconds(300); 
            startCountdown(300);
          }
        }
      }
    });

    return () => {
      socket.off('new_emergency');
      socket.off('full_state');
      clearInterval(countdownRef.current);
    };
  }, [emergencyId, etaSeconds]);

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
    });
    // The server will respond via 'new_emergency' or 'full_state'
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
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          box-shadow: 0 0 30px rgba(220, 38, 38, 0.4);
        }
        .sos-btn:hover:not(:disabled) {
          transform: scale(1.02);
          box-shadow: 0 0 50px rgba(220, 38, 38, 0.6);
        }
        .sos-btn:active:not(:disabled) { transform: scale(0.98); }
      `}</style>

      <div className="min-h-screen bg-slate-900 flex flex-col items-center pb-12 pt-8 px-4 font-sans text-white">
        
        {/* Header */}
        <div className="w-full max-w-4xl flex flex-col items-center gap-2 mb-8 fade-in">
          <span className="bg-red-600 text-white rounded-full px-4 py-1 text-xs font-bold tracking-widest uppercase">
            Emergency Response
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-center mx-0 mt-2">Request Emergency Help</h1>
          <p className="text-slate-400 text-sm md:text-base text-center mx-0">Your location will be shared automatically with the nearest ambulance</p>
        </div>

        {step === 'form' && (
          <div className="w-full max-w-4xl space-y-8">
            
            {/* Industry Feature: Single-Click Quick SOS */}
            <div className="bg-red-600/10 border-2 border-dashed border-red-500 rounded-[40px] p-8 text-center fade-in">
               <h3 className="text-red-500 font-black text-xl mb-6 tracking-tighter uppercase italic">Institutional Panic Trigger</h3>
               <button 
                onClick={() => { setEmergencyType('unknown'); handleSubmit(); }}
                className="w-40 h-40 rounded-full bg-red-600 border-8 border-red-400/30 flex items-center justify-center text-5xl shadow-[0_0_60px_rgba(220,38,38,0.5)] hover:scale-105 active:scale-95 transition-all mx-auto group ring-0 hover:ring-[20px] ring-red-500/10"
               >
                 🆘
               </button>
               <p className="mt-8 text-slate-400 text-sm font-bold uppercase tracking-widest">Single-Click Ambulance Dispatch</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Emergency Type (Takes full width on tablet, 1 column on desktop) */}
              <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 fade-in">
                <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase mb-4 block">Select Emergency Type</span>
                <div className="grid grid-cols-2 gap-3">
                  {EMERGENCY_TYPES.map(t => {
                    const isSelected = emergencyType === t.id;
                    return (
                      <button 
                        key={t.id} 
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer text-left transition-all duration-200
                          ${isSelected ? `${t.color} ${t.bg} text-white` : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500'}`}
                        onClick={() => setEmergencyType(t.id)}
                      >
                        <span className="text-2xl">{t.icon}</span>
                        <span className="text-sm font-semibold leading-tight">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Patient Details & Location */}
              <div className="flex flex-col gap-6 fade-in" style={{ animationDelay: '0.1s' }}>
                
                {/* Description */}
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                  <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase mb-4 block">Situation / Details</span>
                  <textarea 
                    rows={3} 
                    placeholder="e.g. 2 people injured, one unconscious..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500 transition-colors resize-y"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                {/* Contact Info */}
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase mb-2 block">Name (Optional)</span>
                      <input 
                        placeholder="Your name"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                        value={reporterName} onChange={e => setReporterName(e.target.value)}
                      />
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase mb-2 block">Phone (Optional)</span>
                      <input 
                        placeholder="+91 XXXXX XXXXX" type="tel"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                        value={reporterPhone} onChange={e => setReporterPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                  <span className="text-slate-400 text-xs font-semibold tracking-widest uppercase mb-4 block">Your Location</span>
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
                    <span className="text-xl">📍</span>
                    <div className="flex-1 min-w-0">
                      {location ? (
                        <span className="text-green-500 text-sm font-semibold truncate block">
                          GPS Active — {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-amber-500 text-sm block">Acquiring location…</span>
                      )}
                      {locError && <div className="text-amber-500 text-xs mt-1 truncate">{locError}</div>}
                    </div>
                    {location && <span className="text-green-500 text-lg">✓</span>}
                  </div>
                </div>

              </div>
            </div>

            {/* SOS Button */}
            <div className="mt-8 flex flex-col items-center">
              <button 
                className={`sos-btn w-full max-w-lg rounded-2xl p-5 text-xl font-extrabold flex items-center justify-center gap-3 transition-all duration-200 ${(!emergencyType || !location) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                disabled={!emergencyType || !location} 
                onClick={handleSubmit}
              >
                <span className="text-3xl">🆘</span>
                REQUEST URGENT ASSISTANCE
              </button>
              {!emergencyType && (
                <p className="text-amber-500 text-sm text-center mt-3 font-medium">
                  Please select an emergency type above first
                </p>
              )}
            </div>
          </div>
        )}

        {/* STATUS VIEWS */}
        <div className="w-full max-w-lg mx-auto">
          {step === 'submitting' && (
            <div className="bg-slate-800 rounded-2xl p-8 border-2 border-amber-500 fade-in text-center mt-8">
              <div className="w-16 h-16 rounded-full border-4 border-amber-500 border-t-transparent animate-spin mx-auto mb-6"/>
              <p className="text-white font-bold text-xl mb-2">SIGNALING DISPATCH…</p>
              <p className="text-slate-400 text-sm">Alerting all nearby ambulances via priority network. Please wait...</p>
            </div>
          )}

          {step === 'assigned' && (
            <div className="bg-slate-800 rounded-2xl p-8 border-2 border-amber-500 fade-in mt-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-6 mb-6">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center text-3xl z-10 relative">
                    ⏳
                  </div>
                  {pulseAnim && (
                    <>
                      <div className="absolute inset-0 rounded-full border-2 border-amber-500 animate-[pulse-ring_1.5s_ease-out_infinite]" />
                      <div className="absolute inset-0 rounded-full border-2 border-amber-500 animate-[pulse-ring_1.5s_ease-out_infinite] [animation-delay:0.5s]" />
                    </>
                  )}
                </div>
                <div>
                  <p className="text-white font-bold text-xl mb-1">SOS Received — Awaiting Driver</p>
                  <p className="text-amber-500 font-medium">{alertedCount} nearby driver{alertedCount !== 1 ? 's' : ''} alerted</p>
                </div>
              </div>
              
              <div className="bg-slate-900 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Emergency ID</span>
                  <span className="text-sky-400 font-bold font-mono text-sm bg-sky-400/10 px-2 py-1 rounded">{emergencyId}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Type</span>
                  <span className="text-white text-sm font-medium">{selectedType?.icon} {selectedType?.label}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Location</span>
                  <span className="text-green-500 text-sm font-medium">Shared ✓</span>
                </div>
              </div>
              
              <p className="text-slate-400 text-sm text-center mt-6">
                Keep this screen open. A driver will be assigned shortly and ETA will be shown.
              </p>
            </div>
          )}

          {step === 'tracking' && (
            <div className="bg-slate-800 rounded-2xl p-6 sm:p-8 border-2 border-green-500 fade-in mt-8 shadow-[0_0_30px_rgba(34,197,94,0.15)]">
               <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-5 mb-8">
                <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center text-3xl shrink-0">
                  🚑
                </div>
                <div>
                  <p className="text-green-500 font-bold text-2xl mb-1">Ambulance Assigned!</p>
                  <p className="text-slate-300 text-sm">Driver is on their way with a Green Corridor</p>
                </div>
              </div>

              {countdown !== null && (
                <div className="bg-slate-900 rounded-2xl p-6 text-center mb-6 border border-slate-700">
                  <p className="text-slate-400 text-xs font-bold tracking-widest uppercase mb-2">Estimated Arrival</p>
                  <p className="text-white text-5xl font-extrabold m-0 font-variant-numeric-tabular-nums tracking-tight">
                    {formatEta(countdown)}
                  </p>
                  
                  <div className="bg-slate-800 h-2 rounded-full mt-6 overflow-hidden">
                    <div 
                      className="bg-green-500 h-full transition-all duration-1000 ease-linear"
                      style={{ width: `${Math.max(0, (etaSeconds - countdown) / etaSeconds * 100 || 50)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-4 mb-4">
                <p className="text-green-400 font-bold text-sm mb-1 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  Green Corridor Active
                </p>
                <p className="text-slate-300 text-xs">Traffic signals along the route are being cleared automatically for a faster arrival.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900 rounded-xl p-4 text-center border border-slate-700">
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1 font-semibold">Case ID</p>
                  <p className="text-sky-400 font-bold text-sm font-mono">{emergencyId}</p>
                </div>
                <div className="bg-slate-900 rounded-xl p-4 text-center border border-slate-700">
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1 font-semibold">Status</p>
                  <p className="text-green-500 font-bold text-sm">En Route 📍</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info footer */}
        <div className="w-full max-w-4xl text-center mt-12 mb-4">
          <p className="text-slate-500 text-xs font-medium">
            🔒 Your location data is used only to dispatch emergency services dynamically
          </p>
        </div>

      </div>
    </>
  );
}
