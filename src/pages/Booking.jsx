import { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle2, 
  Download, 
  Building2, 
  Briefcase,
  AlertCircle,
  Loader2,
  CalendarCheck
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PaymentModal from '../components/PaymentModal';
import { downloadInvoicePDF } from '../utils/invoiceGenerator';
import apiClient from '../utils/apiClient';

const Booking = () => {
  const [searchParams] = useSearchParams();
  const preselectedInterviewerId = searchParams.get('interviewerId');
  const navigate = useNavigate();

  const [interviewers, setInterviewers] = useState([]);
  const [selectedInterviewer, setSelectedInterviewer] = useState(null);
  
  // Real dynamic availability
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlotObj, setSelectedSlotObj] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [topic, setTopic] = useState('Full Stack Mock Technical Interview');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successBooking, setSuccessBooking] = useState(null);
  const [confirmedPayment, setConfirmedPayment] = useState(null);

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentOrderData, setPaymentOrderData] = useState(null);

  // 1. Fetch professionals on mount
  useEffect(() => {
    const fetchProfessionals = async () => {
      try {
        setLoading(true);
        const data = await apiClient.get('/api/users?role=professional');
        setInterviewers(data);

        if (data.length > 0) {
          const match = preselectedInterviewerId 
            ? data.find(u => u._id === preselectedInterviewerId) 
            : data[0];
          const chosen = match || data[0];
          setSelectedInterviewer(chosen);
          if (chosen.title || chosen.domain) {
            setTopic(`${chosen.domain || chosen.title} Technical Mock Interview`);
          }
        }
      } catch (err) {
        setError('Error loading interviewers: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfessionals();
  }, [preselectedInterviewerId]);

  // 2. Fetch real dynamic availability whenever selectedInterviewer changes
  useEffect(() => {
    if (!selectedInterviewer?._id) return;

    const fetchSlots = async () => {
      try {
        setLoadingSlots(true);
        setSelectedSlotObj(null);
        const res = await apiClient.get(`/api/availability/${selectedInterviewer._id}`);
        const slots = res?.data || [];
        setAvailableSlots(slots);

        if (slots.length > 0) {
          // Select first available date by default
          const firstDate = slots[0].date;
          setSelectedDate(firstDate);
          setSelectedSlotObj(slots[0]);
        } else {
          setSelectedDate('');
          setSelectedSlotObj(null);
        }
      } catch (err) {
        console.warn('Error fetching availability:', err.message);
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedInterviewer]);

  const handleInterviewerChange = (interviewerId) => {
    const chosen = interviewers.find(u => u._id === interviewerId);
    if (chosen) {
      setSelectedInterviewer(chosen);
      if (chosen.domain || chosen.title) {
        setTopic(`${chosen.domain || chosen.title} Mock Interview`);
      }
    }
  };

  // Unique dates with available slots
  const uniqueDates = Array.from(new Set(availableSlots.map(s => s.date))).sort();

  // Slots for currently selected date
  const slotsForSelectedDate = availableSlots.filter(s => s.date === selectedDate);

  // Initiate Booking / Payment Flow
  const handleInitiateBooking = async (e) => {
    e.preventDefault();

    if (!selectedInterviewer || !selectedSlotObj) {
      alert('Please select an interviewer and an available time slot.');
      return;
    }

    const fee = selectedInterviewer.hourlyRate !== undefined && selectedInterviewer.hourlyRate !== null 
      ? Number(selectedInterviewer.hourlyRate) 
      : 0;

    // Handle Free Session (hourlyRate === 0) directly without payment gateway
    if (fee === 0) {
      try {
        setSubmitting(true);
        const freeBooking = await apiClient.post('/api/interviews', {
          interviewerId: selectedInterviewer._id,
          date: selectedSlotObj.date,
          timeSlot: selectedSlotObj.slotLabel,
          slotId: selectedSlotObj._id,
          topic,
          notes
        });

        setSuccessBooking(freeBooking);
        setConfirmedPayment({
          amount: 0,
          invoiceNumber: freeBooking.invoiceNumber || `INV-FREE-${freeBooking._id.slice(-6).toUpperCase()}`,
          paymentId: 'FREE_SESSION',
          paymentMethod: 'Free Community Session'
        });
      } catch (err) {
        alert('Booking failed: ' + err.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Paid Session: Initialize Razorpay Order via Backend with atomic slot reservation (P2, P7)
    try {
      setSubmitting(true);
      const orderRes = await apiClient.post('/api/payment/create-order', {
        interviewerId: selectedInterviewer._id,
        slotId: selectedSlotObj._id,
        topic,
        notes
      });

      const orderData = orderRes?.data || orderRes;

      setPaymentOrderData({
        orderId: orderData.orderId,
        sessionFee: orderData.sessionFee || fee,
        platformFee: orderData.platformFee || 0,
        gstAmount: orderData.gstAmount || 0,
        totalAmount: orderData.amount || fee,
        keyId: orderData.keyId,
        interviewer: selectedInterviewer,
        selectedDate: selectedSlotObj.date,
        selectedSlot: selectedSlotObj.slotLabel,
        slotId: selectedSlotObj._id,
        topic,
        notes
      });

      setIsPaymentModalOpen(true);
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Payment initialization error';
      alert('Booking Error: ' + errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = (result) => {
    setIsPaymentModalOpen(false);
    setSuccessBooking(result.interview);
    setConfirmedPayment(result.payment);
  };

  if (loading) {
    return (
      <div className="card text-center p-12 text-muted">
        <Loader2 className="animate-spin text-primary mx-auto mb-3" size={32} />
        <span>Loading verified professional interviewers...</span>
      </div>
    );
  }

  // Success Confirmation Screen
  if (successBooking) {
    const feePaid = confirmedPayment?.amount !== undefined ? confirmedPayment.amount : (successBooking.paidAmount || 0);
    const invNo = confirmedPayment?.invoiceNumber || successBooking?.invoiceNumber || 'INV-PENDING';
    const payId = confirmedPayment?.paymentId || successBooking?.paymentId || 'COMPLETED';
    const payMethod = confirmedPayment?.paymentMethod || 'Razorpay Gateway';

    return (
      <div style={{ maxWidth: '640px', margin: '2rem auto' }} className="card">
        <div className="text-center mb-6">
          <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)', marginBottom: '1rem' }}>
            <CheckCircle2 size={44} />
          </div>
          <h2 className="text-2xl font-bold">Interview Booking Confirmed!</h2>
          <p className="text-muted text-sm mt-1">Your mock technical interview session is officially scheduled.</p>
        </div>

        <div className="p-4 rounded-xl border mb-6" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border)' }}>
          <div className="flex justify-between items-center pb-3 border-b mb-3" style={{ borderColor: 'var(--border)' }}>
            <div>
              <span className="text-xs text-muted block uppercase tracking-wider font-semibold">Invoice Number</span>
              <span className="font-mono font-bold text-sm text-primary">{invNo}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted block uppercase tracking-wider font-semibold">Transaction ID</span>
              <span className="font-mono text-xs">{payId}</span>
            </div>
          </div>

          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted">Interviewer</span>
            <span className="font-semibold">{selectedInterviewer?.name} ({selectedInterviewer?.company || 'Verified'})</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted">Topic</span>
            <span className="font-semibold">{topic}</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted">Date & Time</span>
            <span className="font-semibold">{selectedDate} ({selectedSlotObj?.slotLabel})</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted">Payment Mode</span>
            <span className="font-semibold uppercase">{payMethod}</span>
          </div>
          <div className="flex justify-between py-1.5 text-base border-t mt-2" style={{ borderColor: 'var(--border)' }}>
            <span className="font-bold">Total Amount</span>
            <span className="font-bold text-success text-lg">₹{feePaid} INR</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {feePaid > 0 && (
            <button 
              type="button"
              onClick={() => downloadInvoicePDF({
                ...confirmedPayment,
                ...successBooking,
                candidateName: successBooking?.candidateId?.name,
                candidateEmail: successBooking?.candidateId?.email,
                interviewerName: selectedInterviewer?.name,
                interviewerTitle: selectedInterviewer?.title,
                company: selectedInterviewer?.company,
                topic,
                timeSlot: `${selectedDate} (${selectedSlotObj?.slotLabel})`,
                sessionFee: feePaid,
                platformFee: 0,
                paidAmount: feePaid,
                invoiceNumber: invNo,
                paymentId: payId,
                paymentMethod: payMethod
              })}
              className="btn btn-outline py-2.5 font-bold flex items-center justify-center gap-2"
              style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
            >
              <Download size={18} />
              <span>Download Official Tax Invoice (PDF)</span>
            </button>
          )}

          <div className="flex gap-3 justify-center">
            <Link to={`/room?interviewId=${successBooking._id}&role=candidate`} className="flex-1">
              <button className="btn btn-primary w-full py-2.5">
                Go to Video Room
              </button>
            </Link>
            <Link to="/interviews" className="flex-1">
              <button className="btn btn-outline w-full py-2.5">
                View My Interviews
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const sessionFee = selectedInterviewer?.hourlyRate !== undefined && selectedInterviewer?.hourlyRate !== null 
    ? Number(selectedInterviewer.hourlyRate) 
    : 0;

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-2 text-muted mb-6 hover:text-primary transition-colors">
        <ArrowLeft size={18} />
        <span className="font-medium">Back to Dashboard</span>
      </Link>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Book Mock Interview</h2>
          <p className="text-muted mt-1">Select an expert interviewer, choose your date and slot, and confirm.</p>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-danger mb-6 flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleInitiateBooking}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.1fr', gap: '2rem' }}>
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            {/* Step 1: Select Interviewer */}
            <div className="card">
              <label className="font-bold text-base mb-3 block">1. Select Interviewer</label>
              
              <div className="flex flex-col gap-3 mb-2">
                {interviewers.map(prof => (
                  <div 
                    key={prof._id}
                    onClick={() => handleInterviewerChange(prof._id)}
                    className="flex items-center justify-between p-3 border rounded-lg transition-all"
                    style={{
                      cursor: 'pointer',
                      borderColor: selectedInterviewer?._id === prof._id ? 'var(--primary)' : 'var(--border)',
                      backgroundColor: selectedInterviewer?._id === prof._id ? 'rgba(26, 115, 232, 0.04)' : 'transparent',
                      borderWidth: selectedInterviewer?._id === prof._id ? '2px' : '1px'
                    }}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative flex-shrink-0">
                        {prof.avatar ? (
                          <img 
                            src={prof.avatar} 
                            alt={prof.name} 
                            className="profile-avatar shadow-sm"
                            style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--border)' }}
                          />
                        ) : (
                          <div 
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {prof.name?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span 
                          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2" 
                          style={{ borderColor: 'var(--card-bg, #fff)' }}
                          title="Available for booking"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm flex items-center gap-2">
                          <span className="truncate">{prof.name}</span>
                          <CheckCircle2 size={13} className="text-primary flex-shrink-0" />
                          {selectedInterviewer?._id === prof._id && (
                            <span className="badge badge-info text-xs">Selected</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1 truncate">
                          <Building2 size={13} className="text-primary flex-shrink-0" />
                          <span className="truncate">{prof.company || 'Tech Leader'}</span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5 truncate">
                          <Briefcase size={12} className="text-muted flex-shrink-0" />
                          <span className="truncate">{prof.domain || prof.title || 'Technical Specialist'}</span>
                        </div>

                        {prof.reviewsCount > 0 && (
                          <div className="text-xs font-medium mt-1 flex items-center gap-1 text-amber-500">
                            ⭐ {prof.rating.toFixed(1)} ({prof.reviewsCount} reviews)
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 pl-3">
                      <div className="font-bold text-base text-primary">
                        {prof.hourlyRate ? `₹${prof.hourlyRate}` : 'Free'}
                      </div>
                      <div className="text-[11px] text-muted font-medium">/ session</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2: Real Dynamic Date & Time Slot Picker */}
            <div className="card">
              <label className="font-bold text-base mb-3 block">2. Select Date & Bookable Slot</label>
              
              {loadingSlots ? (
                <div className="p-8 text-center text-muted">
                  <Loader2 size={24} className="animate-spin text-primary mx-auto mb-2" />
                  <span>Checking live interviewer availability...</span>
                </div>
              ) : uniqueDates.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed rounded-xl text-muted">
                  <CalendarCheck size={36} className="mx-auto mb-2 text-muted" />
                  <p className="font-semibold text-sm">No Open Slots Available</p>
                  <p className="text-xs mt-1">This interviewer currently has no published availability for the upcoming window.</p>
                </div>
              ) : (
                <>
                  {/* Date Selector */}
                  <div className="mb-4">
                    <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-2">Available Dates</label>
                    <div className="flex gap-2 flex-wrap">
                      {uniqueDates.map(dateStr => (
                        <button
                          type="button"
                          key={dateStr}
                          onClick={() => {
                            setSelectedDate(dateStr);
                            const matching = availableSlots.filter(s => s.date === dateStr);
                            if (matching.length > 0) setSelectedSlotObj(matching[0]);
                          }}
                          className={`btn ${selectedDate === dateStr ? 'btn-primary' : 'btn-outline'}`}
                          style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
                        >
                          <CalendarIcon size={14} />
                          <span>{new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Slots for Selected Date */}
                  <div>
                    <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-2">
                      Available Slots on {selectedDate}
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {slotsForSelectedDate.map(slot => (
                        <button
                          type="button"
                          key={slot._id}
                          onClick={() => setSelectedSlotObj(slot)}
                          className={`btn ${selectedSlotObj?._id === slot._id ? 'btn-primary' : 'btn-outline'}`}
                          style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
                        >
                          <Clock size={14} />
                          <span>{slot.slotLabel}</span>
                          {selectedSlotObj?._id === slot._id && <CheckCircle2 size={13} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Step 3: Interview Focus Topic */}
            <div className="card">
              <label className="font-bold text-base mb-3 block">3. Interview Topic & Focus</label>
              <div className="input-group">
                <label>Focus Topic</label>
                <input 
                  type="text"
                  className="input-field"
                  placeholder="e.g. Full Stack System Design, React & Node.js, ML Algorithms"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label>Preparation Notes / Target Role (Optional)</label>
                <input 
                  type="text"
                  className="input-field"
                  placeholder="e.g. Preparing for Senior Software Engineer interview..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Right Column - Booking Summary */}
          <div>
            <div className="card" style={{ position: 'sticky', top: '1rem' }}>
              <h3 className="font-bold text-lg mb-4">Booking Summary</h3>
              
              {selectedInterviewer && (
                <div className="p-3 border rounded-lg mb-5" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border)' }}>
                  <div className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Interviewer</div>
                  <div className="font-bold text-sm">{selectedInterviewer.name}</div>
                  <div className="text-xs text-muted">{selectedInterviewer.title || selectedInterviewer.company}</div>
                  
                  {selectedSlotObj && (
                    <div className="mt-2.5 text-xs font-semibold text-primary flex items-center gap-1.5">
                      <Clock size={14} />
                      <span>{selectedDate} | {selectedSlotObj.slotLabel}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 mb-6 text-sm">
                <div className="flex justify-between text-muted">
                  <span>Session Rate</span>
                  <span>{sessionFee === 0 ? 'Free' : `₹${sessionFee}`}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Platform Fee</span>
                  <span>₹0</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span>Total Payable</span>
                  <span className="text-primary">{sessionFee === 0 ? 'Free' : `₹${sessionFee} INR`}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !selectedSlotObj}
                className="btn btn-primary w-full py-3 font-bold flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Processing Booking...</span>
                  </>
                ) : (
                  <span>{sessionFee === 0 ? 'Confirm Free Booking' : `Proceed to Pay ₹${sessionFee}`}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Payment Gateway Modal (Phase 3) */}
      {isPaymentModalOpen && paymentOrderData && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          bookingDetails={paymentOrderData}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
};

export default Booking;
