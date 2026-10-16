import { useState, useEffect } from 'react';
import { ArrowLeft, Lock, Calendar as CalendarIcon, Clock, CheckCircle2, Download, ShieldCheck, FileText, CreditCard, Building2, Briefcase } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PaymentModal from '../components/PaymentModal';
import { downloadInvoicePDF } from '../utils/invoiceGenerator';
import { API_BASE_URL } from '../config/api';

const getAvailableDates = () => {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' });
    const formatted = `${dayLabel}, ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getFullYear()}`;
    dates.push(formatted);
  }
  return dates;
};

const getInterviewerSlots = (interviewer) => {
  if (interviewer?.availabilitySlots && interviewer.availabilitySlots.length > 0) {
    return interviewer.availabilitySlots;
  }
  return ['10:00 AM - 10:45 AM', '02:00 PM - 02:45 PM', '05:00 PM - 05:45 PM', '07:30 PM - 08:15 PM'];
};

const Booking = () => {
  const [searchParams] = useSearchParams();
  const preselectedInterviewerId = searchParams.get('interviewerId');
  const navigate = useNavigate();

  const [availableDates] = useState(getAvailableDates());
  const [interviewers, setInterviewers] = useState([]);
  const [selectedInterviewer, setSelectedInterviewer] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => getAvailableDates()[0]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [topic, setTopic] = useState('Full Stack Interview - MERN Architecture & Coding');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successBooking, setSuccessBooking] = useState(null);
  const [confirmedPayment, setConfirmedPayment] = useState(null);

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentOrderData, setPaymentOrderData] = useState(null);

  const userId = localStorage.getItem('userId');

  useEffect(() => {
    // Fetch professionals
    const fetchProfessionals = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/users?role=professional`);
        const data = await res.json();
        setInterviewers(data);

        if (data.length > 0) {
          const match = preselectedInterviewerId 
            ? data.find(u => u._id === preselectedInterviewerId) 
            : data[0];
          const chosen = match || data[0];
          setSelectedInterviewer(chosen);
          const slotsList = getInterviewerSlots(chosen);
          setSelectedSlot(slotsList[0]);
        }
      } catch (err) {
        console.error('Error fetching interviewers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfessionals();
  }, [preselectedInterviewerId]);

  const handleInterviewerChange = (interviewerId) => {
    const chosen = interviewers.find(u => u._id === interviewerId);
    if (chosen) {
      setSelectedInterviewer(chosen);
      const slotsList = getInterviewerSlots(chosen);
      setSelectedSlot(slotsList[0]);
      if (chosen.title) {
        setTopic(`${chosen.title} Mock Interview`);
      } else {
        setTopic('Technical Mock Interview');
      }
    }
  };

  const handleInitiatePayment = async (e) => {
    e.preventDefault();
    if (!userId) {
      alert('Please log in first to book an interview.');
      navigate('/login');
      return;
    }

    if (!selectedInterviewer || !selectedSlot) {
      alert('Please select an interviewer and an available time slot.');
      return;
    }

    try {
      setSubmitting(true);
      const fee = selectedInterviewer?.hourlyRate !== undefined ? Number(selectedInterviewer.hourlyRate) : 100;
      const platform = fee > 0 ? Math.round(fee * 0.1) : 0;

      // Create Payment Order in Backend
      const res = await fetch(`${API_BASE_URL}/api/payment/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: userId,
          interviewerId: selectedInterviewer._id,
          sessionFee: fee,
          platformFee: platform,
          topic,
          date: selectedDate,
          timeSlot: selectedSlot
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to initialize payment order');
      }

      const orderData = await res.json();
      
      setPaymentOrderData({
        orderId: orderData.orderId,
        sessionFee: fee,
        platformFee: platform,
        totalAmount: fee + platform,
        userId,
        interviewer: selectedInterviewer,
        selectedDate,
        selectedSlot,
        topic,
        notes
      });

      setIsPaymentModalOpen(true);
    } catch (err) {
      alert('Payment Initialization Error: ' + err.message);
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
        Loading interviewers and live schedule...
      </div>
    );
  }

  if (successBooking) {
    const feePaid = confirmedPayment?.amount || (selectedInterviewer?.hourlyRate + Math.round(selectedInterviewer?.hourlyRate * 0.1));
    const invNo = confirmedPayment?.invoiceNumber || successBooking?.invoiceNumber || `INV-${new Date().getFullYear()}-849201`;
    const payId = confirmedPayment?.paymentId || successBooking?.paymentId || 'pay_verified';
    const payMethod = confirmedPayment?.paymentMethod || 'UPI / Razorpay';

    return (
      <div className="card text-center p-8" style={{ maxWidth: '640px', margin: '2rem auto' }}>
        <div style={{ backgroundColor: 'rgba(52, 168, 83, 0.15)', color: 'var(--success)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
          <CheckCircle2 size={36} />
        </div>
        
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="badge badge-success text-xs font-bold py-1 px-3">
            ● PAYMENT VERIFIED & CAPTURED
          </span>
        </div>

        <h2 className="text-2xl font-bold mb-2">Booking & Payment Confirmed!</h2>
        <p className="text-muted mb-6 text-sm">
          Your 1-on-1 mock technical interview session with <strong>{selectedInterviewer?.name}</strong> has been secured and confirmed.
        </p>

        {/* Invoice Summary Card */}
        <div className="card bg-gray-50 text-left p-5 mb-6" style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border)' }}>
          <div className="flex justify-between items-center pb-3 mb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div>
              <span className="text-xs text-muted block uppercase tracking-wider font-semibold">Tax Invoice Number</span>
              <span className="font-mono font-bold text-sm text-primary">{invNo}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted block uppercase tracking-wider font-semibold">Payment ID</span>
              <span className="font-mono text-xs">{payId}</span>
            </div>
          </div>

          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted">Interviewer</span>
            <span className="font-semibold">{selectedInterviewer?.name} ({selectedInterviewer?.company})</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted">Focus Topic</span>
            <span className="font-semibold">{topic}</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted">Scheduled Slot</span>
            <span className="font-semibold">{selectedDate} ({selectedSlot})</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted">Payment Mode</span>
            <span className="font-semibold uppercase">{payMethod}</span>
          </div>
          <div className="flex justify-between py-1.5 text-base border-t mt-2" style={{ borderColor: 'var(--border)' }}>
            <span className="font-bold">Total Amount Paid</span>
            <span className="font-bold text-success text-lg">₹{feePaid} INR</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
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
              timeSlot: `${selectedDate} (${selectedSlot})`,
              sessionFee: selectedInterviewer?.hourlyRate,
              platformFee: Math.round(selectedInterviewer?.hourlyRate * 0.1),
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

  const sessionFee = selectedInterviewer?.hourlyRate !== undefined ? Number(selectedInterviewer.hourlyRate) : 100;
  const platformFee = sessionFee > 0 ? Math.round(sessionFee * 0.1) : 0;
  const totalAmount = sessionFee + platformFee;

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-2 text-muted mb-6 hover:text-primary transition-colors">
        <ArrowLeft size={18} />
        <span className="font-medium">Back to Dashboard</span>
      </Link>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Book Mock Interview</h2>
          <p className="text-muted mt-1">Select an expert interviewer, choose your topic and slot, and confirm.</p>
        </div>
      </div>

      <form onSubmit={handleInitiatePayment}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.1fr', gap: '2rem' }}>
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            {/* Step 1: Select Interviewer */}
            <div className="card">
              <label className="font-bold text-base mb-3 block">1. Select Interviewer</label>
              
              <div className="flex flex-col gap-3 mb-4">
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
                        <img 
                          src={prof.avatar || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80'} 
                          alt={prof.name} 
                          className="profile-avatar shadow-sm"
                          style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--border)' }}
                        />
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

                        {/* 1. Company Name */}
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1 truncate">
                          <Building2 size={13} className="text-primary flex-shrink-0" />
                          <span className="truncate">
                            {prof.name?.includes('Shushant') || prof.company?.includes('Batch 3') ? 'Cognizant' : (prof.company || 'Tech Leader')}
                          </span>
                        </div>

                        {/* 2. Domain */}
                        <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5 truncate">
                          <Briefcase size={12} className="text-muted flex-shrink-0" />
                          <span className="truncate">
                            {prof.name?.includes('Shushant') || prof.title?.includes('Batch 3') || prof.domain?.includes('Batch 3') ? 'MERN Stack Development' : (prof.domain || prof.title || 'Full Stack Engineering')}
                          </span>
                        </div>

                        <div className="text-xs font-medium mt-1 flex items-center gap-1 text-amber-500">
                          ⭐ {prof.rating || 4.9} ({prof.reviewsCount || 45} reviews)
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 pl-3">
                      <div className="font-bold text-base text-primary">₹{prof.hourlyRate}</div>
                      <div className="text-[11px] text-muted font-medium">/ session</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2: Date & Available Time Slots */}
            <div className="card">
              <label className="font-bold text-base mb-3 block">2. Select Date & Time Slot</label>
              
              <div className="mb-4">
                <label className="text-sm font-medium text-muted block mb-2">Choose Date</label>
                <div className="flex gap-2 flex-wrap">
                  {availableDates.map(d => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={`btn ${selectedDate === d ? 'btn-primary' : 'btn-outline'}`}
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                    >
                      <CalendarIcon size={14} />
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted block mb-2">Available Slots ({selectedInterviewer?.name})</label>
                <div className="flex gap-2 flex-wrap">
                  {getInterviewerSlots(selectedInterviewer).map(slot => (
                    <button
                      type="button"
                      key={slot}
                      onClick={() => setSelectedSlot(slot)}
                      className={`btn ${selectedSlot === slot ? 'btn-primary' : 'btn-outline'}`}
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                    >
                      <Clock size={14} />
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 3: Interview Topic */}
            <div className="card">
              <label className="font-bold text-base mb-3 block">3. Interview Topic & Focus</label>
              <div className="input-group">
                <label>Select Mock Interview Focus</label>
                <select 
                  className="input-field"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                >
                  <option value="Full Stack Interview - MERN Architecture & Coding">Full Stack Interview - MERN Architecture (React, Node, Express, MongoDB)</option>
                  <option value="Machine Learning & AI Engineering Interview">Machine Learning & AI Engineering (Python, PyTorch, LLMs)</option>
                </select>
              </div>

              <div className="input-group">
                <label>Special Instructions or Resume Link (Optional)</label>
                <input 
                  type="text"
                  className="input-field"
                  placeholder="e.g. Preparing for Google L4 frontend interview..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Right Column - Payment & Confirmation */}
          <div>
            <div className="card" style={{ position: 'sticky', top: '1rem' }}>
              <h3 className="font-bold text-lg mb-4">Booking Summary</h3>
              
              {selectedInterviewer && (
                <div className="p-3 border rounded-lg mb-6" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border)' }}>
                  <div className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">Interviewer</div>
                  <div className="font-bold text-sm">{selectedInterviewer.name}</div>
                  <div className="text-xs text-muted">{selectedInterviewer.title}</div>
                  <div className="mt-2 text-xs font-medium text-primary">
                    📅 {selectedDate} | ⏰ {selectedSlot}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 mb-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted">Session Fee (45 mins)</span>
                  <span className="font-medium">₹{sessionFee}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted">Platform Fee (10%)</span>
                  <span className="font-medium">₹{platformFee}</span>
                </div>
                <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '0.25rem 0' }}></div>
                <div className="flex justify-between items-center">
                  <span className="font-bold">Total Amount</span>
                  <span className="font-bold text-xl" style={{ color: 'var(--primary)' }}>₹{totalAmount}</span>
                </div>
              </div>

              <button 
                type="submit"
                className="btn btn-primary w-full py-3 text-base mb-3 font-bold flex items-center justify-center gap-2"
                disabled={submitting}
              >
                <CreditCard size={18} />
                <span>{submitting ? 'Creating Order...' : `Proceed to Payment (₹${totalAmount})`}</span>
              </button>
              
              <div className="flex flex-col gap-2 pt-2 border-t text-xs text-muted" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-1.5 text-success font-medium">
                  <ShieldCheck size={14} />
                  <span>100% Refundable & Money-Back Guaranteed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Lock size={14} />
                  <span>Razorpay & UPI 256-Bit Bank Encryption</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Interactive Payment Gateway Modal */}
      <PaymentModal 
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        bookingDetails={paymentOrderData}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
};

export default Booking;
