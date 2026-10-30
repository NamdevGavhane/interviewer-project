import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import ErrorBoundary from './components/ErrorBoundary';
import SidebarLayout from './layouts/SidebarLayout';
import './index.css';

// Helper for resilient lazy imports (handles transient network drops & dev server restarts)
const lazyRetry = (importFn) =>
  lazy(() =>
    importFn().catch((err) => {
      if (typeof window !== 'undefined' && err?.message && (err.message.includes('dynamically imported module') || err.message.includes('Failed to fetch'))) {
        const key = 'chunk_reload_' + window.location.pathname;
        const lastReload = sessionStorage.getItem(key);
        if (!lastReload || Date.now() - parseInt(lastReload, 10) > 10000) {
          sessionStorage.setItem(key, String(Date.now()));
          window.location.reload();
          return new Promise(() => {});
        }
      }
      throw err;
    })
  );

// Route-level code-splitting with React.lazy
const Dashboard = lazyRetry(() => import('./pages/Dashboard'));
const Login = lazyRetry(() => import('./pages/Login'));
const Booking = lazyRetry(() => import('./pages/Booking'));
const VideoRoom = lazyRetry(() => import('./pages/VideoRoom'));
const Profile = lazyRetry(() => import('./pages/Profile'));
const FeedbackReport = lazyRetry(() => import('./pages/FeedbackReport'));
const Interviews = lazyRetry(() => import('./pages/Interviews'));
const AIInterview = lazyRetry(() => import('./pages/AIInterview'));
const AcceptInvitation = lazyRetry(() => import('./pages/AcceptInvitation'));
const ProfessionalLogin = lazyRetry(() => import('./pages/ProfessionalLogin'));
const ProfessionalSignup = lazyRetry(() => import('./pages/ProfessionalSignup'));
const Availability = lazyRetry(() => import('./pages/professional/Availability'));
const Earnings = lazyRetry(() => import('./pages/professional/Earnings'));
const PaymentHistory = lazyRetry(() => import('./pages/payment/PaymentHistory'));
const CancelBooking = lazyRetry(() => import('./pages/booking/CancelBooking'));
const AdminDashboard = lazyRetry(() => import('./pages/admin/AdminDashboard'));
const VerifyEmail = lazyRetry(() => import('./pages/VerifyEmail'));
const ResetPassword = lazyRetry(() => import('./pages/ResetPassword'));

// Premium Suspense Page Loading Fallback
const PageLoadingFallback = () => (
  <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
    <div className="relative flex items-center justify-center">
      <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
      <div className="w-6 h-6 rounded-full bg-indigo-500/10 absolute animate-pulse" />
    </div>
    <p className="mt-4 text-xs font-medium text-slate-400 tracking-wider uppercase animate-pulse">
      Loading DevSphere...
    </p>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              {/* Public Authentication Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/professional/login" element={<ProfessionalLogin />} />
              <Route path="/professional/signup" element={<ProfessionalSignup />} />
              <Route path="/accept-invite" element={<AcceptInvitation />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              
              {/* Protected Video Room */}
              <Route 
                path="/room" 
                element={
                  <ProtectedRoute>
                    <VideoRoom />
                  </ProtectedRoute>
                } 
              />
              
              {/* Protected Main Layout & Modules */}
              <Route 
                path="/" 
                element={
                  <ProtectedRoute>
                    <SidebarLayout />
                  </ProtectedRoute>
                }
              >
                {/* General Routes */}
                <Route index element={<Dashboard />} />
                <Route path="profile" element={<Profile />} />
                <Route path="interviews" element={<Interviews />} />
                <Route path="payments" element={<PaymentHistory />} />

                {/* Candidate-specific Modules */}
                <Route 
                  path="booking" 
                  element={
                    <RoleRoute allowedRoles={['candidate', 'admin']}>
                      <Booking />
                    </RoleRoute>
                  } 
                />
                <Route 
                  path="booking/cancel" 
                  element={
                    <RoleRoute allowedRoles={['candidate', 'admin']}>
                      <CancelBooking />
                    </RoleRoute>
                  } 
                />
                <Route 
                  path="ai-interview" 
                  element={
                    <RoleRoute allowedRoles={['candidate', 'admin']}>
                      <AIInterview />
                    </RoleRoute>
                  } 
                />
                <Route path="feedback" element={<FeedbackReport />} />
                <Route path="feedback-report" element={<FeedbackReport />} />
                <Route path="feedback-report/:interviewId" element={<FeedbackReport />} />

                {/* Professional-specific Modules */}
                <Route 
                  path="professional/dashboard" 
                  element={
                    <RoleRoute allowedRoles={['professional', 'admin']}>
                      <Dashboard />
                    </RoleRoute>
                  } 
                />
                <Route 
                  path="professional/availability" 
                  element={
                    <RoleRoute allowedRoles={['professional', 'admin']}>
                      <Availability />
                    </RoleRoute>
                  } 
                />
                <Route 
                  path="professional/earnings" 
                  element={
                    <RoleRoute allowedRoles={['professional', 'admin']}>
                      <Earnings />
                    </RoleRoute>
                  } 
                />

                {/* Admin Console */}
                <Route 
                  path="admin" 
                  element={
                    <RoleRoute allowedRoles={['admin']}>
                      <AdminDashboard />
                    </RoleRoute>
                  } 
                />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
