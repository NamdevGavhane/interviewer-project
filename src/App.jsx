import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SidebarLayout from './layouts/SidebarLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Booking from './pages/Booking';
import VideoRoom from './pages/VideoRoom';
import Profile from './pages/Profile';
import FeedbackReport from './pages/FeedbackReport';
import Interviews from './pages/Interviews';
import AIInterview from './pages/AIInterview';
import Availability from './pages/professional/Availability';
import Earnings from './pages/professional/Earnings';
import PaymentHistory from './pages/payment/PaymentHistory';
import CancelBooking from './pages/booking/CancelBooking';
import AdminDashboard from './pages/admin/AdminDashboard';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/room" element={<VideoRoom />} />
        
        {/* Protected routes with sidebar */}
        <Route path="/" element={<SidebarLayout />}>
          {/* User Module */}
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="interviews" element={<Interviews />} />

          {/* Professional Module */}
          <Route path="professional/availability" element={<Availability />} />
          <Route path="professional/earnings" element={<Earnings />} />

          {/* Interview Module */}
          <Route path="ai-interview" element={<AIInterview />} />
          <Route path="feedback" element={<FeedbackReport />} />
          <Route path="feedback-report" element={<FeedbackReport />} />
          <Route path="feedback-report/:interviewId" element={<FeedbackReport />} />

          {/* Booking Module */}
          <Route path="booking" element={<Booking />} />
          <Route path="booking/cancel" element={<CancelBooking />} />

          {/* Payment Module */}
          <Route path="payments" element={<PaymentHistory />} />

          {/* Admin Module */}
          <Route path="admin" element={<AdminDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
