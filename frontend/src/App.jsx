import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LogOut } from 'lucide-react';

// Pages
import LoginPage from './pages/LoginPage.jsx';
import RequestPage from './pages/RequestPage.jsx';
import DriverPage from './pages/DriverPage.jsx';
import PolicePage from './pages/PolicePage.jsx';
import HospitalPage from './pages/HospitalPage.jsx';
import AdminDashboardPage from './pages/AdminDashboardPage.jsx';

// Protected Route Wrapper
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to their own dashboard if they try to access another role's page
    return <Navigate to={`/${user.role === 'admin' ? '' : user.role}`} replace />;
  }

  return children;
};

// Global Logout Button (can be styled better later per page)
const LogoutButton = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  
  // Don't show on login or citizen page
  if (!user || location.pathname === '/login' || location.pathname === '/citizen') return null;

  return (
    <button 
      onClick={logout}
      className="fixed top-4 right-4 z-[9999] bg-white hover:bg-slate-50 text-red-600 p-2 rounded-full border border-slate-200 shadow-sm transition-all group flex items-center gap-2 pr-4"
    >
      <div className="bg-red-50 p-1.5 rounded-full">
        <LogOut className="w-4 h-4 text-red-500" />
      </div>
      <span className="text-sm font-bold text-slate-700">Log out</span>
    </button>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen box-border bg-slate-50 text-slate-900 font-sans">
          <LogoutButton />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            
            {/* Citizen page is public, doesn't need login */}
            <Route path="/citizen" element={<RequestPage />} />
            {/* Keeping /request working to avoid breaking links temporarily, though we use /citizen */}
            <Route path="/request" element={<Navigate to="/citizen" replace />} />
            
            {/* Protected Routes */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/driver" 
              element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <DriverPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/police" 
              element={
                <ProtectedRoute allowedRoles={['police', 'admin']}>
                  <PolicePage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/hospital" 
              element={
                <ProtectedRoute allowedRoles={['hospital', 'admin']}>
                  <HospitalPage />
                </ProtectedRoute>
              } 
            />
            
            {/* Fallback to login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}