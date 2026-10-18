import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';

import SidebarLayout from './layouts/SidebarLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Booking from './pages/Booking';
import VideoRoom from './pages/VideoRoom';
import Profile from './pages/Profile';
import FeedbackReport from './pages/FeedbackReport';
import Interviews from './pages/Interviews';
import AIInterview from './pages/AIInterview';
import AcceptInvitation from './pages/AcceptInvitation';
import ProfessionalLogin from './pages/ProfessionalLogin';
import Availability from './pages/professional/Availability';
import Earnings from './pages/professional/Earnings';
import PaymentHistory from './pages/payment/PaymentHistory';
import CancelBooking from './pages/booking/CancelBooking';
import AdminDashboard from './pages/admin/AdminDashboard';
import VerifyEmail from './pages/VerifyEmail';
import ResetPassword from './pages/ResetPassword';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/professional/login" element={<ProfessionalLogin />} />
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
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
