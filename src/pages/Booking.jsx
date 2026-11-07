import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ArrowLeft, 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle2, 
  Download, 
  Building2, 
  AlertCircle,
  Loader2,
  CalendarCheck,
  Globe
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import PaymentModal from '../components/PaymentModal';
import { downloadInvoicePDF } from '../utils/invoiceGenerator';
import apiClient from '../utils/apiClient';

/**
 * Format date string into readable heading (e.g. "Fri, Nov 6, 2026")
 */
const formatReadableDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return dt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  } catch {
    return dateStr;
  }
};

const Booking = () => {
  const [searchParams] = useSearchParams();
  const preselectedInterviewerId = searchParams.get('interviewerId');

  // Candidate detected timezone
  const candidateTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }, []);

  const [interviewers, setInterviewers] = useState([]);
  const [selectedInterviewer, setSelectedInterviewer] = useState(null);
  const [publicConfig, setPublicConfig] = useState(null);
  
  // Dynamic slots
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlotObj, setSelectedSlotObj] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [topic, setTopic] = useState('Full Stack Mock Technical Interview');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [holdExpiredMessage, setHoldExpiredMessage] = useState('');
  const [slotConflictMessage, setSlotConflictMessage] = useState('');
  const [successBooking, setSuccessBooking] = useState(null);
  const [confirmedPayment, setConfirmedPayment] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Toast notification state
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, []);

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentOrderData, setPaymentOrderData] = useState(null);

  // Dynamic session price from public config
  const sessionPrice = publicConfig?.mockSessionPricePaise != null
    ? (publicConfig.mockSessionPricePaise / 100)
    : null;

  // Fetch slots for an interviewer and set processed slots
  const fetchInterviewerSlots = useCallback(async (interviewerId) => {
    if (!interviewerId) return [];
    try {
      setLoadingSlots(true);
      setSlotConflictMessage('');
      const res = await apiClient.get(`/api/availability/${interviewerId}`);
      const rawSlots = Array.isArray(res) 
        ? res 
        : Array.isArray(res?.data) 
        ? res.data 
        : [];
      setAvailableSlots(rawSlots);
      return rawSlots;
    } catch (err) {
      console.warn('Error fetching availability:', err.message);
      setAvailableSlots([]);
      return [];
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  // 1. Fetch public config and professionals with availability status on mount
  useEffect(() => {
    let ignore = false;
    const initData = async () => {
      try {
        const [configData, usersData, activeInterviewersRes] = await Promise.all([
          apiClient.get('/api/config/public').catch(() => null),
          apiClient.get('/api/users?role=professional&limit=50').catch(() => []),
          apiClient.get('/api/availability/active-interviewers').catch(() => ({ data: {} }))
        ]);

        if (ignore) return;
        if (configData) setPublicConfig(configData);

        const profList = Array.isArray(usersData) 
          ? usersData 
          : Array.isArray(usersData?.data) 
          ? usersData.data 
          : [];

        const activeMap = activeInterviewersRes?.data || activeInterviewersRes || {};

        // Merge professional profiles with pre-aggregated active slot counts (O(1) lookup, no 50-request waterfall)
        const profsWithSlots = profList.map((prof) => {
          const slotMeta = activeMap[String(prof._id)] || null;
          const hasSlots = Boolean(slotMeta?.hasSlots);
          let nextAvailableDateFormatted = null;
          const firstSlotTime = slotMeta?.nextSlotStart || null;

          if (hasSlots && slotMeta.nextSlotStart) {
            try {
              const candDate = new Date(slotMeta.nextSlotStart);
              nextAvailableDateFormatted = candDate.toLocaleDateString('en-US', {
                timeZone: candidateTimezone,
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              });
            } catch {
              nextAvailableDateFormatted = slotMeta.nextSlotDate || null;
            }
          }

          return {
            ...prof,
            hasSlots,
            slotsCount: slotMeta?.openCount || 0,
            nextAvailableDateFormatted,
            firstSlotTime
          };
        });

        if (ignore) return;

        // Interviewers with open slots come first
        const sorted = [...profsWithSlots].sort((a, b) => {
          if (a.hasSlots && !b.hasSlots) return -1;
          if (!a.hasSlots && b.hasSlots) return 1;
          if (a.hasSlots && b.hasSlots && a.firstSlotTime && b.firstSlotTime) {
            return new Date(a.firstSlotTime) - new Date(b.firstSlotTime);
          }
          return (b.rating || 0) - (a.rating || 0);
        });

        setInterviewers(sorted);

        // Select initial interviewer: prefer preselected if has slots, else first with slots
        let chosen = null;
        if (preselectedInterviewerId) {
          chosen = sorted.find(p => p._id === preselectedInterviewerId && p.hasSlots);
        }
        if (!chosen) {
          chosen = sorted.find(p => p.hasSlots) || sorted[0] || null;
        }

        setSelectedInterviewer(chosen);
        if (chosen) {
          if (chosen.domain || chosen.title) {
            setTopic(`${chosen.domain || chosen.title} Technical Mock Interview`);
          }
          if (chosen._id) {
            fetchInterviewerSlots(chosen._id);
          }
        }
      } catch (err) {
        if (!ignore) {
          setError('Error loading booking data: ' + err.message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    initData();
    return () => { ignore = true; };
  }, [candidateTimezone, preselectedInterviewerId, fetchInterviewerSlots]);

  // Process available slots into candidate timezone and compute candidate dates
  const processedSlots = useMemo(() => {
    const currentMs = nowTick;
    // 10-minute grace window for active sessions
    const graceThresholdMs = currentMs - 10 * 60 * 1000;

    return (availableSlots || []).map(slot => {
      if (!slot?.startTime || !slot?.endTime) return null;
      try {
        const startMs = new Date(slot.startTime).getTime();
        const endMs = new Date(slot.endTime).getTime();

        // Discard slots that have already concluded or started more than 10 minutes ago
        if (endMs <= currentMs || startMs < graceThresholdMs) {
          return null;
        }

        const startUtc = new Date(slot.startTime);
        const endUtc = new Date(slot.endTime);

        // Format date in candidate's timezone: YYYY-MM-DD
        const candidateDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: candidateTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(startUtc);

        // Format start & end time in candidate's timezone
        const startTimeStr = startUtc.toLocaleTimeString('en-US', {
          timeZone: candidateTimezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        const endTimeStr = endUtc.toLocaleTimeString('en-US', {
          timeZone: candidateTimezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        const candidateSlotLabel = `${startTimeStr} - ${endTimeStr}`;

        return {
          ...slot,
          candidateDate,
          candidateSlotLabel
        };
      } catch {
        return {
          ...slot,
          candidateDate: slot.date,
          candidateSlotLabel: slot.slotLabel
        };
      }
    }).filter(Boolean);
  }, [availableSlots, candidateTimezone]);

  // Unique dates that actually have open slots
  const uniqueDates = useMemo(() => {
    return Array.from(new Set(processedSlots.map(s => s.candidateDate))).sort();
  }, [processedSlots]);

  // Derive effective active date and slot cleanly without cascading effect setState
  const activeDate = useMemo(() => {
    if (selectedDate && uniqueDates.includes(selectedDate)) {
      return selectedDate;
    }
    return uniqueDates[0] || '';
  }, [selectedDate, uniqueDates]);

  const activeSlotObj = useMemo(() => {
    if (selectedSlotObj && selectedSlotObj.candidateDate === activeDate) {
      const exists = processedSlots.find(s => s._id === selectedSlotObj._id);
      if (exists) return exists;
    }
    const matching = processedSlots.filter(s => s.candidateDate === activeDate);
    return matching[0] || null;
  }, [selectedSlotObj, activeDate, processedSlots]);

  // Slots for currently selected date
  const slotsForSelectedDate = useMemo(() => {
    return processedSlots.filter(s => s.candidateDate === activeDate);
  }, [processedSlots, activeDate]);

  // Month label for date strip
  const monthLabel = useMemo(() => {
    if (!activeDate && uniqueDates.length === 0) return 'Available Dates';
    const activeDateStr = activeDate || uniqueDates[0];
    try {
      const [y, m, d] = activeDateStr.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch {
      return 'Available Dates';
    }
  }, [activeDate, uniqueDates]);

  // Interviewer Selection Handler
  const handleInterviewerChange = async (interviewerId) => {
    const chosen = (interviewers || []).find(u => u && u._id === interviewerId);
    if (!chosen) return;
    if (!chosen.hasSlots) {
      showToast('This interviewer has no open slots yet.', 'error');
      return;
    }

    setSelectedInterviewer(chosen);
    setSelectedSlotObj(null);
    setSlotConflictMessage('');
    if (chosen.domain || chosen.title) {
      setTopic(`${chosen.domain || chosen.title} Mock Interview`);
    }

    await fetchInterviewerSlots(chosen._id);
  };

  // Initiate Booking / Payment Flow
  const handleInitiateBooking = async (e) => {
    e.preventDefault();
    setHoldExpiredMessage('');
    setSlotConflictMessage('');

    if (!selectedInterviewer || !activeSlotObj) {
      showToast('Please select an interviewer and an available time slot.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const orderRes = await apiClient.post('/api/payment/create-order', {
        interviewerId: selectedInterviewer._id,
        slotId: activeSlotObj._id,
        topic,
        notes
      });

      const orderData = orderRes?.data || orderRes;
      const holdMinutes = orderData.holdMinutes || publicConfig?.pendingPaymentMinutes || 10;

      setPaymentOrderData({
        orderId: orderData.orderId,
        sessionFee: orderData.sessionFee ?? sessionPrice,
        platformFee: 0,
        gstAmount: 0,
        totalAmount: orderData.amount ?? sessionPrice,
        amountPaise: orderData.amountPaise,
        freeSession: Boolean(orderData.freeSession || orderData.amountPaise === 0),
        holdMinutes,
        keyId: orderData.keyId,
        isSimulated: Boolean(orderData.isSimulated),
        interviewer: selectedInterviewer,
        selectedDate: activeSlotObj.candidateDate || activeSlotObj.date || activeDate,
        selectedSlot: activeSlotObj.candidateSlotLabel || activeSlotObj.slotLabel,
        slotId: activeSlotObj._id,
        topic,
        notes,
        createdAt: Date.now()
      });

      setIsPaymentModalOpen(true);
    } catch (err) {
      const isConflict = err.status === 409 || 
        (err.message && (
          err.message.includes('taken') || 
          err.message.includes('booked') || 
          err.message.includes('reserved') ||
          err.message.includes('Slot not available')
        ));

      if (isConflict) {
        const conflictNotice = 'That slot was just taken, please pick another';
        setSlotConflictMessage(conflictNotice);
        showToast(conflictNotice, 'error');
        setSelectedSlotObj(null);
        if (selectedInterviewer?._id) {
          await fetchInterviewerSlots(selectedInterviewer._id);
        }
      } else {
        const errMsg = err.data?.message || err.message || 'Payment initialization error';
        showToast(errMsg, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleHoldExpired = () => {
    setIsPaymentModalOpen(false);
    setPaymentOrderData(null);
    setSelectedSlotObj(null);
    setHoldExpiredMessage('Time expired, slot released. Please select a slot again to book.');
    if (selectedInterviewer?._id) {
      fetchInterviewerSlots(selectedInterviewer._id);
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
      <div style={{ maxWidth: '640px', margin: '2rem auto' }} className="card p-6">
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
            <span className="text-muted">Date & Time ({candidateTimezone})</span>
            <span className="font-semibold">{paymentOrderData?.selectedDate || activeDate} ({paymentOrderData?.selectedSlot || activeSlotObj?.candidateSlotLabel || activeSlotObj?.slotLabel})</span>
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
                timeSlot: `${paymentOrderData?.selectedDate || activeDate} (${paymentOrderData?.selectedSlot || activeSlotObj?.candidateSlotLabel || activeSlotObj?.slotLabel})`,
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
            <Link to={`/room?interviewId=${successBooking._id}`} className="flex-1">
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

  return (
    <div className="max-w-6xl mx-auto pb-28 lg:pb-12">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#1e293b',
            color: 'white',
            padding: '0.85rem 1.5rem',
            borderRadius: '10px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 500
          }}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={18} className="text-red-400" />
          ) : (
            <CheckCircle2 size={18} className="text-success" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Breadcrumb */}
      <Link to="/" className="inline-flex items-center gap-2 text-muted mb-4 hover:text-primary transition-colors text-sm">
        <ArrowLeft size={16} />
        <span className="font-medium">Back to Dashboard</span>
      </Link>
      
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Book Mock Interview</h1>
        <p className="text-muted text-sm mt-1">Select an expert interviewer, choose your date and slot, and confirm.</p>
      </div>

      {error && (
        <div className="card p-4 text-danger mb-6 flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {holdExpiredMessage && (
        <div className="card p-4 mb-6 flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
          <span>{holdExpiredMessage}</span>
        </div>
      )}

      {slotConflictMessage && (
        <div className="card p-4 mb-6 flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
          <span className="font-semibold">{slotConflictMessage}</span>
        </div>
      )}

      <form onSubmit={handleInitiateBooking}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form Steps (cols 12 on mobile, 8 on lg) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Step 1: Select Interviewer */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <label className="font-bold text-base block">1. Select Interviewer</label>
                <span className="text-xs text-muted">Interviewers with open slots shown first</span>
              </div>
              
              <div className="flex flex-col gap-3">
                {(interviewers || []).filter(Boolean).map(prof => {
                  const isSelected = selectedInterviewer?._id === prof._id;
                  const canSelect = prof.hasSlots;

                  return (
                    <div 
                      key={prof._id}
                      onClick={() => {
                        if (canSelect) {
                          handleInterviewerChange(prof._id);
                        }
                      }}
                      className={`p-4 border rounded-xl transition-all ${
                        !canSelect
                          ? 'opacity-60 bg-slate-50/60 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 cursor-not-allowed'
                          : isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm cursor-pointer'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          {/* Avatar */}
                          <div className="relative flex-shrink-0 mt-0.5">
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
                                  justifyContent: 'center',
                                  fontSize: '1.1rem'
                                }}
                              >
                                {prof.name?.charAt(0).toUpperCase()}
                              </div>
                            )}
                            {prof.hasSlots && (
                              <span 
                                className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2" 
                                style={{ borderColor: 'var(--card-bg, #fff)' }}
                                title="Has open bookable slots"
                              />
                            )}
                          </div>

                          {/* Profile Information */}
                          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                            {/* Name with Verified Badge */}
                            <div className="font-bold text-sm flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-slate-900 dark:text-slate-100">{prof.name}</span>
                              <span className="badge badge-info text-[10px] py-0.5 px-1.5 inline-flex items-center gap-1">
                                <CheckCircle2 size={11} /> Verified
                              </span>
                              {isSelected && (
                                <span className="badge badge-success text-[10px] py-0.5 px-1.5">Selected</span>
                              )}
                            </div>

                            {/* Designation on its own separate line */}
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                              {prof.designation || prof.title || 'Professional Interviewer'}
                            </div>

                            {/* Company on its own separate line */}
                            <div className="text-xs text-muted flex items-center gap-1 truncate">
                              <Building2 size={12} className="flex-shrink-0 text-muted" />
                              <span className="truncate">{prof.company || 'Tech Leader'}</span>
                            </div>

                            {/* Domain Chip & Rating row */}
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {prof.domain && (
                                <span className="badge badge-secondary text-[11px] py-0.5 px-2 font-medium">
                                  {prof.domain}
                                </span>
                              )}
                              {prof.reviewsCount > 0 ? (
                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                  ★ {prof.rating.toFixed(1)} <span className="text-muted">({prof.reviewsCount})</span>
                                </span>
                              ) : (
                                <span className="badge badge-secondary text-[11px] py-0.5 px-2 font-normal text-muted">
                                  New
                                </span>
                              )}
                            </div>

                            {/* Next Available Date OR "No open slots yet" */}
                            <div className="mt-1.5 text-xs">
                              {prof.hasSlots ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                                  <CalendarIcon size={12} /> Next: {prof.nextAvailableDateFormatted}
                                </span>
                              ) : (
                                <span className="text-muted font-medium inline-flex items-center gap-1">
                                  <AlertCircle size={12} /> No open slots yet
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Price Column */}
                        <div className="text-right flex-shrink-0 pl-2">
                          <div className="font-bold text-base text-primary">
                            {sessionPrice != null ? `₹${sessionPrice}` : '...'}
                          </div>
                          <div className="text-[11px] text-muted font-medium">/ session</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Real Dynamic Date & Time Slot Picker */}
            <div className="card p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <label className="font-bold text-base block">2. Select Date & Bookable Slot</label>
                <div className="text-xs text-muted flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">
                  <Globe size={13} className="text-primary" />
                  <span>Times shown in <strong>{candidateTimezone}</strong></span>
                </div>
              </div>
              
              {loadingSlots ? (
                <div className="p-8 text-center text-muted">
                  <Loader2 size={24} className="animate-spin text-primary mx-auto mb-2" />
                  <span>Checking live interviewer availability...</span>
                </div>
              ) : uniqueDates.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed rounded-xl text-muted">
                  <CalendarCheck size={36} className="mx-auto mb-2 text-muted opacity-40" />
                  <p className="font-semibold text-sm">No Open Slots Available</p>
                  <p className="text-xs mt-1">
                    {selectedInterviewer 
                      ? `${selectedInterviewer.name} has no open slots currently. Please check back later or choose another interviewer.`
                      : 'Select an interviewer above to check available slots.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Date Selector Header with Month Label */}
                  <div className="mb-4">
                    <div className="flex items-center gap-1.5 font-bold text-sm text-slate-800 dark:text-slate-200 mb-2">
                      <CalendarIcon size={15} className="text-primary" />
                      <span>{monthLabel}</span>
                    </div>

                    {/* Horizontal scroll date strip */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1 scrollbar-thin">
                      {uniqueDates.map(dateStr => {
                        const isSelected = activeDate === dateStr;
                        const [y, m, d] = dateStr.split('-').map(Number);
                        const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
                        const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
                        const dayNum = dateObj.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' });
                        const monthShort = dateObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

                        return (
                          <button
                            type="button"
                            key={dateStr}
                            onClick={() => {
                              setSelectedDate(dateStr);
                              setSelectedSlotObj(null);
                              setSlotConflictMessage('');
                            }}
                            className={`flex flex-col items-center justify-center min-w-[72px] px-3 py-2 rounded-xl border text-xs font-medium transition-all flex-shrink-0 ${
                              isSelected
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/50 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="text-[11px] uppercase opacity-80">{weekday}</span>
                            <span className="text-base font-bold my-0.5">{dayNum}</span>
                            <span className="text-[10px] opacity-80">{monthShort}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Slots for Selected Date */}
                  <div className="mt-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-2.5">
                      Available Slots on {formatReadableDate(activeDate)}
                    </label>
                    <div className="flex flex-wrap gap-2.5">
                      {slotsForSelectedDate.map(slot => {
                        const isSelected = activeSlotObj?._id === slot._id;
                        return (
                          <button
                            type="button"
                            key={slot._id}
                            onClick={() => {
                              setSelectedSlotObj(slot);
                              setSlotConflictMessage('');
                            }}
                            className={`btn flex items-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                              isSelected ? 'btn-primary shadow-sm' : 'btn-outline'
                            }`}
                          >
                            <Clock size={14} />
                            <span>{slot.candidateSlotLabel || slot.slotLabel}</span>
                            {isSelected && <CheckCircle2 size={13} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Step 3: Interview Focus Topic */}
            <div className="card p-6">
              <label className="font-bold text-base mb-4 block pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                3. Interview Topic & Focus
              </label>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-1.5">
                    Focus Topic
                  </label>
                  <input 
                    type="text"
                    className="input text-sm w-full"
                    placeholder="e.g. Full Stack System Design, React & Node.js, ML Algorithms"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-1.5">
                    Preparation Notes / Target Role (Optional)
                  </label>
                  <input 
                    type="text"
                    className="input text-sm w-full"
                    placeholder="e.g. Preparing for Senior Software Engineer interview..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Desktop Booking Summary Side Panel (cols 4 on lg, min-w 280px) */}
          <div className="lg:col-span-4 hidden lg:block">
            <div className="card p-5 sticky top-6 min-w-[280px] shadow-sm">
              <h3 className="font-bold text-lg mb-4 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                Booking Summary
              </h3>
              
              {selectedInterviewer && (
                <div className="p-3.5 border rounded-xl mb-5 bg-slate-50 dark:bg-slate-900/50" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[11px] text-muted uppercase tracking-wider font-bold mb-1">
                    Interviewer
                  </div>
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {selectedInterviewer.name}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {selectedInterviewer.designation || selectedInterviewer.title || selectedInterviewer.company}
                  </div>
                  
                  {activeSlotObj && (
                    <div className="mt-3 pt-2.5 border-t text-xs font-semibold text-primary flex items-center gap-1.5" style={{ borderColor: 'var(--border)' }}>
                      <Clock size={14} className="flex-shrink-0" />
                      <span>{activeDate} • {activeSlotObj.candidateSlotLabel || activeSlotObj.slotLabel}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2.5 mb-6 text-sm">
                <div className="flex justify-between text-muted">
                  <span>Session Rate</span>
                  <span>{sessionPrice != null ? `₹${sessionPrice}` : '...'}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span>Total Payable</span>
                  <span className="text-primary">{sessionPrice != null ? `₹${sessionPrice} INR` : '...'}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !activeSlotObj || sessionPrice == null}
                className="btn btn-primary w-full py-3 font-bold flex items-center justify-center gap-2 shadow-md"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Processing Booking...</span>
                  </>
                ) : (
                  <span>Proceed to Pay {sessionPrice != null ? `₹${sessionPrice}` : ''}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Sticky Bottom Bar (visible on phones only) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl z-40 flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Total Payable</span>
            <span className="font-bold text-base text-primary">₹{sessionPrice || 0} INR</span>
            {activeSlotObj && (
              <span className="text-[11px] text-muted truncate max-w-[150px]">
                {activeSlotObj.candidateSlotLabel || activeSlotObj.slotLabel}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting || !activeSlotObj || sessionPrice == null}
            className="btn btn-primary py-2.5 px-6 font-bold text-sm flex items-center justify-center gap-2 shadow-md flex-shrink-0"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>Proceed to Pay</span>
            )}
          </button>
        </div>
      </form>

      {/* Payment Gateway Modal */}
      {isPaymentModalOpen && paymentOrderData && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          bookingDetails={paymentOrderData}
          onSuccess={handlePaymentSuccess}
          onHoldExpired={handleHoldExpired}
        />
      )}
    </div>
  );
};

export default Booking;
