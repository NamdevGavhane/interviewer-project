import { useState, useEffect } from 'react';
import { Calendar, Clock, AlertTriangle, CheckCircle, ArrowLeft, RefreshCw, Loader2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../utils/apiClient';

const CancelBooking = () => {
  const [scheduledInterviews, setScheduledInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('Schedule conflict');
  const [otherReasonText, setOtherReasonText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Reschedule modal state
  const [rescheduleBooking, setRescheduleBooking] = useState(null);
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [selectedNewSlotId, setSelectedNewSlotId] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);

  const navigate = useNavigate();

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/api/interviews');
      setScheduledInterviews(data.filter(i => i.status === 'scheduled'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Cancellation Handler
  const handleConfirmCancel = async () => {
    if (!selectedBooking) return;
    try {
      setProcessing(true);
      const res = await apiClient.patch(`/api/interviews/${selectedBooking._id}/status`, {
        status: 'cancelled',
        cancelReason: cancelReason === 'Other' ? otherReasonText : cancelReason
      });

      showToast('Interview session cancelled and slot released.');
      setSelectedBooking(null);
      await fetchBookings();
    } catch (err) {
      alert('Error cancelling booking: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Open Reschedule Modal and fetch available slots
  const handleOpenReschedule = async (booking) => {
    setRescheduleBooking(booking);
    setSelectedNewSlotId('');
    try {
      setLoadingSlots(true);
      const interviewerId = booking.interviewerId?._id || booking.interviewerId;
      const res = await apiClient.get(`/api/availability/${interviewerId}`);
      setRescheduleSlots(res?.data || []);
    } catch (err) {
      alert('Failed to load slots for rescheduling: ' + err.message);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Submit Reschedule
  const handleConfirmReschedule = async () => {
    if (!rescheduleBooking || !selectedNewSlotId) return;
    try {
      setProcessing(true);
      const res = await apiClient.post('/api/availability/reschedule', {
        interviewId: rescheduleBooking._id,
        newSlotId: selectedNewSlotId
      });

      showToast(res.message || 'Interview rescheduled successfully! ✅');
      setRescheduleBooking(null);
      await fetchBookings();
    } catch (err) {
      alert('Rescheduling failed: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '3rem' }}>
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#1e293b',
          color: 'white',
          padding: '0.85rem 1.5rem',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontWeight: 500
        }}>
          <CheckCircle size={18} className="text-success" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge badge-warning text-xs font-semibold uppercase">Booking Module</span>
            <span className="text-xs text-muted">Cancellation & Rescheduling</span>
          </div>
          <h2 className="text-2xl font-bold mt-1">Manage Scheduled Interviews</h2>
          <p className="text-muted text-sm">Review your scheduled mock interviews, reschedule to another slot, or cancel.</p>
        </div>
        <Link to="/booking">
          <button className="btn btn-outline text-xs">
            + Book Alternative Slot
          </button>
        </Link>
      </div>

      {/* Cancellation Policy Banner */}
      <div className="card mb-6" style={{ backgroundColor: '#fffbeb', borderColor: '#fef3c7' }}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-warning mt-0.5" />
          <div>
            <h4 className="font-bold text-sm" style={{ color: '#b45309' }}>InterviewPro Automated Refund & Release Policy</h4>
            <p className="text-xs mt-1" style={{ color: '#92400e', lineHeight: 1.5 }}>
              Cancellations made in accordance with the platform policy window automatically release the booked slot and trigger a refund. Rescheduling swaps slots atomically with zero cancellation fees.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-muted">
          <Loader2 size={24} className="animate-spin text-primary mx-auto mb-2" />
          <span>Loading scheduled bookings...</span>
        </div>
      ) : scheduledInterviews.length === 0 ? (
        <div className="card text-center p-12">
          <Calendar size={48} className="text-muted mx-auto mb-4" style={{ margin: '0 auto 1rem auto' }} />
          <h3 className="text-lg font-bold mb-2">No Active Bookings to Manage</h3>
          <p className="text-muted mb-6">You do not currently have any scheduled upcoming mock interview sessions.</p>
          <Link to="/booking">
            <button className="btn btn-primary">Book New Mock Interview</button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h3 className="font-bold text-base">Your Active Scheduled Sessions ({scheduledInterviews.length})</h3>
          {scheduledInterviews.map((item) => {
            const partner = item.interviewerId;
            const partnerName = partner?.name || 'Interviewer';

            return (
              <div key={item._id} className="card flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div 
                    style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '50%', 
                      backgroundColor: 'var(--primary)', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontWeight: 700 
                    }}
                  >
                    {partnerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-base">{item.topic || 'Mock Interview'}</div>
                    <div className="text-xs text-muted mt-0.5">With: {partnerName}</div>
                    <div className="flex items-center gap-3 text-xs text-muted mt-1">
                      <span className="flex items-center gap-1"><Calendar size={13} /> {item.date}</span>
                      <span className="flex items-center gap-1"><Clock size={13} /> {item.timeSlot}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
                  <div className="text-right mr-2">
                    <div className="font-bold">₹{item.price}</div>
                    <span className="badge badge-success text-[10px]">{item.paymentStatus || 'paid'}</span>
                  </div>
                  <button 
                    className="btn btn-outline text-xs py-2 px-3 flex items-center gap-1"
                    onClick={() => handleOpenReschedule(item)}
                  >
                    <RefreshCw size={13} />
                    <span>Reschedule</span>
                  </button>
                  <button 
                    className="btn btn-outline text-danger text-xs py-2 px-3"
                    style={{ borderColor: 'rgba(234, 67, 53, 0.4)' }}
                    onClick={() => setSelectedBooking(item)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {selectedBooking && (
        <div className="modal-overlay" onClick={() => !processing && setSelectedBooking(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <h3 className="font-bold text-lg mb-2">Confirm Cancellation</h3>
            <p className="text-xs text-muted mb-4">
              Are you sure you want to cancel your session with <strong>{selectedBooking.interviewerId?.name}</strong> on <strong>{selectedBooking.date}</strong>? The slot will be released back to the platform.
            </p>

            <div className="input-group mb-4">
              <label>Cancellation Reason</label>
              <select
                className="input-field"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              >
                <option value="Schedule conflict">Schedule conflict</option>
                <option value="Need more preparation time">Need more preparation time</option>
                <option value="Personal emergency">Personal emergency</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {cancelReason === 'Other' && (
              <div className="input-group mb-4">
                <label>Please specify</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Reason for cancellation..."
                  value={otherReasonText}
                  onChange={(e) => setOtherReasonText(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => setSelectedBooking(null)}
                disabled={processing}
              >
                Keep Booking
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={handleConfirmCancel}
                disabled={processing}
              >
                {processing ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleBooking && (
        <div className="modal-overlay" onClick={() => !processing && setRescheduleBooking(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-lg">Reschedule Interview Slot</h3>
              <button className="btn btn-ghost p-1" onClick={() => setRescheduleBooking(null)}>
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-muted mb-4">
              Select an alternative open slot with <strong>{rescheduleBooking.interviewerId?.name}</strong>:
            </p>

            {loadingSlots ? (
              <div className="p-8 text-center text-muted">
                <Loader2 size={24} className="animate-spin text-primary mx-auto mb-2" />
                <span>Checking available slots...</span>
              </div>
            ) : rescheduleSlots.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed rounded-xl text-muted text-xs">
                No alternative slots currently open for this interviewer.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto mb-4 p-1">
                {rescheduleSlots.map(slot => (
                  <div
                    key={slot._id}
                    onClick={() => setSelectedNewSlotId(slot._id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer text-sm font-medium transition-all ${
                      selectedNewSlotId === slot._id ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      <span>{slot.date} ({slot.slotLabel})</span>
                    </div>
                    {selectedNewSlotId === slot._id && <CheckCircle size={15} className="text-primary" />}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => setRescheduleBooking(null)}
                disabled={processing}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleConfirmReschedule}
                disabled={processing || !selectedNewSlotId}
              >
                {processing ? 'Rescheduling...' : 'Confirm New Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CancelBooking;
