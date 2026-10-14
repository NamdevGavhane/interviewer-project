import { useState, useEffect } from 'react';
import { Calendar, Clock, AlertTriangle, CheckCircle, ArrowLeft, XCircle, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const CancelBooking = () => {
  const [scheduledInterviews, setScheduledInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('Schedule conflict');
  const [otherReasonText, setOtherReasonText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const navigate = useNavigate();

  const userId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole') || 'candidate';

  const fetchBookings = async () => {
    if (!userId) {
      navigate('/login');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:5000/api/interviews?userId=${userId}&role=${userRole}`);
      if (res.ok) {
        const data = await res.json();
        // Filter only scheduled interviews
        setScheduledInterviews(data.filter(i => i.status === 'scheduled'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [userId, userRole]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleConfirmCancel = async () => {
    if (!selectedBooking) return;
    try {
      setProcessing(true);
      const res = await fetch(`http://localhost:5000/api/interviews/${selectedBooking._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'cancelled',
          cancelReason: cancelReason === 'Other' ? otherReasonText : cancelReason 
        })
      });

      if (!res.ok) throw new Error('Failed to cancel booking');
      showToast('Interview session cancelled successfully.');
      setSelectedBooking(null);
      await fetchBookings();
    } catch (err) {
      alert('Error cancelling booking: ' + err.message);
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
          <h2 className="text-2xl font-bold mt-1">Cancel / Reschedule Booking</h2>
          <p className="text-muted text-sm">Review your active interview bookings and initiate a cancellation request.</p>
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
            <h4 className="font-bold text-sm" style={{ color: '#b45309' }}>InterviewPro Cancellation & Refund Policy</h4>
            <p className="text-xs mt-1" style={{ color: '#92400e' }}>
              Cancellations made at least 2 hours before the scheduled time slot qualify for an automated full refund or credit voucher to your original payment method. The slot will immediately be made available to other candidates.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-muted">Loading scheduled bookings...</div>
      ) : scheduledInterviews.length === 0 ? (
        <div className="card text-center p-12">
          <Calendar size={48} className="text-muted mx-auto mb-4" style={{ margin: '0 auto 1rem auto' }} />
          <h3 className="text-lg font-bold mb-2">No Active Bookings to Cancel</h3>
          <p className="text-muted mb-6">You do not currently have any scheduled upcoming mock interview sessions.</p>
          <Link to="/booking">
            <button className="btn btn-primary">Book New Mock Interview</button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h3 className="font-bold text-base">Your Active Scheduled Sessions ({scheduledInterviews.length})</h3>
          {scheduledInterviews.map((item) => {
            const partner = userRole === 'professional' ? item.candidateId : item.interviewerId;
            const partnerName = partner?.name || (userRole === 'professional' ? 'Candidate' : 'Interviewer');
            const partnerAvatar = partner?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100';

            return (
              <div key={item._id} className="card flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <img 
                    src={partnerAvatar} 
                    alt={partnerName} 
                    className="profile-avatar"
                    style={{ width: '52px', height: '52px' }}
                  />
                  <div>
                    <div className="font-bold text-base">{item.topic || 'Mock Interview'}</div>
                    <div className="text-xs text-muted mt-0.5">With: {partnerName}</div>
                    <div className="flex items-center gap-3 text-xs text-muted mt-1">
                      <span className="flex items-center gap-1"><Calendar size={13} /> {item.date}</span>
                      <span className="flex items-center gap-1"><Clock size={13} /> {item.timeSlot}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                  <div className="text-right mr-2">
                    <div className="font-bold">₹{item.price}</div>
                    <div className="text-xs text-success font-semibold">Paid</div>
                  </div>
                  <button 
                    className="btn btn-outline text-danger text-xs py-2 px-4"
                    style={{ borderColor: 'rgba(234, 67, 53, 0.4)' }}
                    onClick={() => setSelectedBooking(item)}
                  >
                    Cancel Booking
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {selectedBooking && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '1.75rem' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-danger flex items-center gap-2">
                <AlertTriangle size={20} />
                <span>Confirm Session Cancellation</span>
              </h3>
              <button onClick={() => setSelectedBooking(null)} className="btn btn-ghost p-1 text-muted">
                <XCircle size={20} />
              </button>
            </div>

            <p className="text-sm text-muted mb-4">
              Are you sure you want to cancel your scheduled session for <strong>{selectedBooking.date}</strong> at <strong>{selectedBooking.timeSlot}</strong>?
            </p>

            <div className="mb-4">
              <label className="text-xs font-semibold text-muted block mb-1.5">Reason for Cancellation:</label>
              <select 
                className="input-field mb-2"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              >
                <option value="Schedule conflict">Schedule conflict</option>
                <option value="Need to reschedule to another date">Need to reschedule to another date</option>
                <option value="Already prepared / Offer received">Already prepared / Offer received</option>
                <option value="Technical issues">Technical issues</option>
                <option value="Other">Other</option>
              </select>

              {cancelReason === 'Other' && (
                <input 
                  type="text" 
                  placeholder="Please specify reason..." 
                  className="input-field text-sm"
                  value={otherReasonText}
                  onChange={(e) => setOtherReasonText(e.target.value)}
                />
              )}
            </div>

            <div className="p-3 rounded-lg mb-5 text-xs" style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border)' }}>
              <div className="font-semibold text-muted mb-1">Refund Summary:</div>
              <div>Refund Amount: <strong>₹{selectedBooking.price}</strong></div>
              <div className="text-muted mt-0.5">Credited back via UPI / original mode in 2-4 business hours.</div>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                type="button" 
                className="btn btn-outline text-xs"
                onClick={() => setSelectedBooking(null)}
                disabled={processing}
              >
                Keep Booking
              </button>
              <button 
                type="button" 
                className="btn btn-primary text-xs"
                style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={handleConfirmCancel}
                disabled={processing}
              >
                {processing ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CancelBooking;
