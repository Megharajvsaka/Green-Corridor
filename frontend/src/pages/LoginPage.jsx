import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Ambulance, Building2, Shield, Settings } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const roles = [
    { id: 'driver', name: 'Ambulance Driver', icon: Ambulance, color: 'text-blue-600', bg: 'bg-white', border: 'border-blue-100', hover: 'hover:border-blue-300 hover:bg-blue-50 hover:shadow-lg hover:-translate-y-1' },
    { id: 'hospital', name: 'Hospital Admin', icon: Building2, color: 'text-emerald-600', bg: 'bg-white', border: 'border-emerald-100', hover: 'hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-lg hover:-translate-y-1' },
    { id: 'police', name: 'Traffic Police', icon: Shield, color: 'text-amber-600', bg: 'bg-white', border: 'border-amber-100', hover: 'hover:border-amber-300 hover:bg-amber-50 hover:shadow-lg hover:-translate-y-1' },
    { id: 'admin', name: 'Command Center', icon: Settings, color: 'text-purple-600', bg: 'bg-white', border: 'border-purple-100', hover: 'hover:border-purple-300 hover:bg-purple-50 hover:shadow-lg hover:-translate-y-1' }
  ];

  const handleLogin = (roleId) => {
    setLoading(true);
    // Simulate API call for login
    setTimeout(() => {
      login(roleId, `user-${Math.floor(Math.random() * 1000)}`, `Demo ${roleId.charAt(0).toUpperCase() + roleId.slice(1)}`);
      navigate(`/${roleId === 'admin' ? '' : roleId}`); // Admin goes to roots, others go to their paths
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background aesthetics */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-400/10 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-400/10 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-md animate-in bg-white/70 backdrop-blur-xl p-8 rounded-3xl relative z-10 border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-6 border border-blue-200 shadow-[0_4px_14px_0_rgba(59,130,246,0.2)]">
            <ShieldAlert className="w-8 h-8 text-blue-600 animate-pulse" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-2">Green Corridor System</h1>
          <p className="text-slate-500 text-sm text-center font-medium">Secure authentication required for emergency personnel access.</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
             <div className="w-12 h-12 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin mb-4"></div>
             <p className="text-slate-500 animate-pulse font-medium">Authenticating securely...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 ml-1">Select Personnel Role</div>
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <button
                  key={role.id}
                  onClick={() => handleLogin(role.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border ${role.border} ${role.bg} ${role.hover} transition-all duration-300 group shadow-sm`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl bg-${role.color.split('-')[1]}-50 shadow-sm border ${role.border} group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className={`w-5 h-5 ${role.color}`} />
                    </div>
                    <span className="font-semibold text-slate-700 tracking-tight">{role.name}</span>
                  </div>
                  <div className={`w-8 h-8 rounded-full bg-${role.color.split('-')[1]}-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0 duration-300`}>
                    <span className={`text-${role.color.split('-')[1]}-600 font-bold text-lg leading-none`}>→</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-slate-100 text-center">
            <p className="text-[13px] text-slate-500 mb-4 font-medium">Are you a citizen facing a medical emergency?</p>
            <button 
              onClick={() => navigate('/citizen')}
              className="w-full rounded-2xl py-3.5 px-4 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white font-semibold tracking-wide shadow-[0_8px_20px_rgba(225,29,72,0.25)] hover:shadow-[0_12px_25px_rgba(225,29,72,0.35)] hover:-translate-y-0.5 flex items-center justify-center gap-2 transition-all duration-300"
            >
              <ShieldAlert className="w-5 h-5" />
              Emergency SOS Interface
            </button>
        </div>
      </div>
    </div>
  );
}
