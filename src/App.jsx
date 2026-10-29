import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import ErrorBoundary from './components/ErrorBoundary';
import SidebarLayout from './layouts/SidebarLayout';
import './index.css';

// Route-level code-splitting with React.lazy
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Booking = lazy(() => import('./pages/Booking'));
const VideoRoom = lazy(() => import('./pages/VideoRoom'));
const Profile = lazy(() => import('./pages/Profile'));
const FeedbackReport = lazy(() => import('./pages/FeedbackReport'));
const Interviews = lazy(() => import('./pages/Interviews'));
const AIInterview = lazy(() => import('./pages/AIInterview'));
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'));
const ProfessionalLogin = lazy(() => import('./pages/ProfessionalLogin'));
const ProfessionalSignup = lazy(() => import('./pages/ProfessionalSignup'));
const Availability = lazy(() => import('./pages/professional/Availability'));
const Earnings = lazy(() => import('./pages/professional/Earnings'));
const PaymentHistory = lazy(() => import('./pages/payment/PaymentHistory'));
const CancelBooking = lazy(() => import('./pages/booking/CancelBooking'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

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
