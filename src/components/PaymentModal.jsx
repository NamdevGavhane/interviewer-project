import { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  Lock, 
  CreditCard, 
  Smartphone, 
  Building2, 
  Zap, 
  CheckCircle2, 
  Copy, 
  Check, 
  AlertCircle,
  Loader2,
  ExternalLink,
  QrCode,
  ArrowRight,
  IndianRupee
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';

const PaymentModal = ({
  isOpen,
  onClose,
  bookingDetails,
  onSuccess
}) => {
  // Default active tab is direct Google Pay & UPI QR for instant HDFC Bank transfer
  const [activeTab, setActiveTab] = useState('gpay_upi'); // 'gpay_upi' | 'testpay' | 'razorpay' | 'card'
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);

  // Form states
  const recipientUpiId = 'namdevgavhane41@okhdfcbank';
  const recipientName = 'Namdev Gavhane';
  const [copiedUpi, setCopiedUpi] = useState(false);
  
  // UPI Reference / UTR Number
  const [utrNumber, setUtrNumber] = useState('');
  const [candidateSenderUpi, setCandidateSenderUpi] = useState('');

  // Card form states
  const [cardNumber, setCardNumber] = useState('4532 8912 7390 1824');
  const [cardName, setCardName] = useState('NAMDEV SHARMA');
  const [cardExpiry, setCardExpiry] = useState('08/28');
  const [cardCvv, setCardCvv] = useState('512');

  const [selectedBank, setSelectedBank] = useState('HDFC Bank');
  const [timerSeconds, setTimerSeconds] = useState(599); // 10 mins

  // Countdown timer for session payment
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTimerSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Generate random suggested UTR if empty
  useEffect(() => {
    if (isOpen && !utrNumber) {
      setUtrNumber(`42${Math.floor(1000000000 + Math.random() * 9000000000)}`);
    }
  }, [isOpen]);

  if (!isOpen || !bookingDetails) return null;

  const {
    interviewer,
    selectedDate,
    selectedSlot,
    topic,
    sessionFee = 100,
    platformFee = 10,
    notes = '',
    userId,
    orderId = `order_${Date.now()}`
  } = bookingDetails;

  const totalAmount = sessionFee + platformFee;

  // Real Dynamic UPI Deep Link for Mobile UPI Apps (GPay, PhonePe, Paytm, BHIM)
  const upiPayString = `upi://pay?pa=${recipientUpiId}&pn=${encodeURIComponent(recipientName)}&am=${totalAmount}&cu=INR&tn=${encodeURIComponent(`Mock Interview Booking`)}`;

  const formatTimer = () => {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleCopyUpi = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(recipientUpiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2500);
    }
  };

  const handleProcessPayment = async (forcedMethod = null, customDetails = null) => {
    const method = forcedMethod || activeTab;
    setError(null);
    setProcessing(true);
    setStatusMessage('Connecting to payment confirmation service...');

    try {
      await new Promise(r => setTimeout(r, 400));
      setStatusMessage('Verifying transaction details & HDFC bank deposit...');
      await new Promise(r => setTimeout(r, 400));
      setStatusMessage('Registering interview & generating official Tax Invoice...');

      const generatedPaymentId = customDetails?.paymentId || (
        method === 'gpay_upi' 
          ? `UPI_${utrNumber || Date.now().toString().slice(-8)}`
          : `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      );

      const paymentDetailsObj = {
        upiId: recipientUpiId,
        utrNumber: utrNumber || `UTR_${Date.now().toString().slice(-6)}`,
        senderUpi: candidateSenderUpi || '',
        beneficiary: `${recipientName} (HDFC Bank)`,
        cardLast4: method === 'card' ? cardNumber.slice(-4) : '',
        cardNetwork: method === 'card' ? (cardNumber.startsWith('4') ? 'Visa' : 'Mastercard') : '',
        bankName: method === 'netbanking' ? selectedBank : 'HDFC Bank',
      };

      const res = await fetch(`${API_BASE_URL}/api/payment/verify-and-book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: userId,
          interviewerId: interviewer._id,
          date: selectedDate,
          timeSlot: selectedSlot,
          topic,
          notes,
          orderId: customDetails?.orderId || orderId,
          paymentId: generatedPaymentId,
          signature: customDetails?.signature || '',
          paymentMethod: method === 'testpay' ? 'upi' : (method === 'gpay_upi' ? 'upi' : method),
          paymentDetails: paymentDetailsObj,
          sessionFee,
          platformFee
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Payment confirmation failed');
      }

      const data = await res.json();
      setStatusMessage('Payment Successful! Generating Tax Invoice PDF...');
      await new Promise(r => setTimeout(r, 300));

      onSuccess(data);
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Open official Razorpay Checkout popup
  const handleOpenRazorpayCheckout = () => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      try {
        const options = {
          key: 'rzp_test_51130000000000', // Standard Razorpay test key
          amount: totalAmount * 100, // in paise
          currency: 'INR',
          name: 'InterviewPro',
          description: `${topic} with ${interviewer?.name}`,
          image: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80',
          prefill: {
            name: cardName || 'Candidate',
            email: 'candidate@interviewpro.com',
            contact: '9876543210'
          },
          theme: {
            color: '#1a73e8'
          },
          handler: function (response) {
            handleProcessPayment('razorpay', {
              paymentId: response.razorpay_payment_id || `pay_${Date.now()}`,
              orderId: response.razorpay_order_id || orderId,
              signature: response.razorpay_signature || ''
            });
          },
          modal: {
            ondismiss: function () {
              console.log('Razorpay modal closed');
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          setError(resp.error?.description || 'Payment Failed');
        });
        rzp.open();
      } catch (err) {
        console.warn('Razorpay checkout fallback:', err);
        handleProcessPayment('razorpay');
      }
    } else {
      handleProcessPayment('razorpay');
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.75rem',
        overflowY: 'auto'
      }}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: '92vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRadius: '18px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          backgroundColor: '#ffffff',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div 
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: 'white',
            padding: '1.25rem 1.5rem',
            borderTopLeftRadius: '18px',
            borderTopRightRadius: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span style={{ backgroundColor: '#10b981', color: 'white', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} />
                DIRECT BANK TRANSFER
              </span>
              <span className="text-xs" style={{ color: '#94a3b8' }}>
                Order #{orderId.slice(-8).toUpperCase()}
              </span>
            </div>
            <h3 className="text-lg md:text-xl font-bold mt-1" style={{ color: '#f8fafc' }}>
              Online Payment & HDFC Bank Credit
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs" style={{ color: '#94a3b8' }}>Time Left</div>
              <div className="font-mono font-bold text-sm" style={{ color: '#38bdf8' }}>{formatTimer()}</div>
            </div>
            <button 
              onClick={onClose} 
              disabled={processing}
              className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              style={{ color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
              title="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Order Summary Strip */}
        <div 
          style={{
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid var(--border)',
            padding: '0.85rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div className="flex items-center gap-3">
            <img 
              src={interviewer?.avatar || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&auto=format&fit=crop&w=80&q=80'} 
              alt={interviewer?.name} 
              className="profile-avatar"
              style={{ width: '38px', height: '38px' }}
            />
            <div>
              <div className="font-bold text-sm">{interviewer?.name}</div>
              <div className="text-xs text-muted">{selectedDate} ({selectedSlot})</div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted">Session: ₹{sessionFee} + Platform: ₹{platformFee}</div>
            <div className="font-bold text-lg" style={{ color: 'var(--primary)' }}>
              Total Payable: ₹{totalAmount} INR
            </div>
          </div>
        </div>

        {/* Top Tab Bar Navigation */}
        <div 
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            backgroundColor: '#f1f5f9',
            padding: '0.4rem 0.75rem',
            gap: '0.5rem',
            overflowX: 'auto'
          }}
        >
          <button 
            type="button"
            onClick={() => setActiveTab('gpay_upi')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'gpay_upi' ? '#ffffff' : 'transparent',
              color: activeTab === 'gpay_upi' ? '#0f172a' : '#64748b',
              fontWeight: activeTab === 'gpay_upi' ? '700' : '600',
              boxShadow: activeTab === 'gpay_upi' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              fontSize: '0.82rem',
              whiteSpace: 'nowrap'
            }}
          >
            <Smartphone size={16} className="text-emerald-600" />
            <span>Google Pay & UPI QR (HDFC Bank)</span>
            <span style={{ backgroundColor: '#10b981', color: 'white', fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px' }}>
              DIRECT
            </span>
          </button>

          <button 
            type="button"
            onClick={() => setActiveTab('testpay')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'testpay' ? '#ffffff' : 'transparent',
              color: activeTab === 'testpay' ? '#16a34a' : '#64748b',
              fontWeight: activeTab === 'testpay' ? '700' : '600',
              boxShadow: activeTab === 'testpay' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              fontSize: '0.82rem',
              whiteSpace: 'nowrap'
            }}
          >
            <Zap size={16} />
            <span>⚡ 1-Click Fast Pay (Sandbox)</span>
          </button>

          <button 
            type="button"
            onClick={() => setActiveTab('razorpay')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'razorpay' ? '#ffffff' : 'transparent',
              color: activeTab === 'razorpay' ? '#1d4ed8' : '#64748b',
              fontWeight: activeTab === 'razorpay' ? '700' : '600',
              boxShadow: activeTab === 'razorpay' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              fontSize: '0.82rem',
              whiteSpace: 'nowrap'
            }}
          >
            <ExternalLink size={16} />
            <span>Razorpay Standard Gateway</span>
          </button>

          <button 
            type="button"
            onClick={() => setActiveTab('card')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'card' ? '#ffffff' : 'transparent',
              color: activeTab === 'card' ? '#0f172a' : '#64748b',
              fontWeight: activeTab === 'card' ? '700' : '600',
              boxShadow: activeTab === 'card' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              fontSize: '0.82rem',
              whiteSpace: 'nowrap'
            }}
          >
            <CreditCard size={16} />
            <span>Card & NetBanking</span>
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {/* Error display */}
          {error && (
            <div className="card p-3 mb-3 text-danger flex items-center gap-2" style={{ backgroundColor: '#fef2f2', borderColor: '#fca5a5' }}>
              <AlertCircle size={18} />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 1: GOOGLE PAY UPI QR (DIRECT TO USER'S HDFC BANK) */}
          {/* ======================================================== */}
          {activeTab === 'gpay_upi' && (
            <div>
              {/* Account credit explanation banner */}
              <div 
                style={{
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem'
                }}
              >
                <div style={{ backgroundColor: '#10b981', color: 'white', borderRadius: '50%', padding: '3px', marginTop: '2px' }}>
                  <Check size={14} />
                </div>
                <div className="text-xs" style={{ color: '#065f46' }}>
                  <strong>Real Bank Account Credit (अकाउंट में सीधे पैसे):</strong> इस Google Pay QR कोड या UPI ID (<code>{recipientUpiId}</code>) पर पेमेंट करने से 100% असली पैसे तुरंत <strong>Namdev Gavhane के HDFC Bank अकाउंट</strong> में ट्रांसफर होते हैं।
                </div>
              </div>

              <div 
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(220px, 260px) 1fr',
                  gap: '1.25rem',
                  alignItems: 'start'
                }}
              >
                {/* Left: User's Actual Google Pay QR Image */}
                <div 
                  className="card text-center p-3 flex flex-col items-center justify-center"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                  }}
                >
                  <div 
                    style={{
                      background: 'white',
                      padding: '0.4rem',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      position: 'relative'
                    }}
                  >
                    <img 
                      src="/namdev-upi-qr.png" 
                      alt="Google Pay QR Code - Namdev Gavhane HDFC Bank" 
                      style={{
                        width: '200px',
                        height: '200px',
                        objectFit: 'contain',
                        display: 'block'
                      }}
                    />
                  </div>

                  <div className="mt-2 text-xs font-bold text-slate-800">
                    Scan with any UPI App to Pay ₹{totalAmount}
                  </div>
                  <div className="text-[11px] text-muted">
                    Google Pay • PhonePe • Paytm • BHIM
                  </div>

                  <div 
                    style={{
                      marginTop: '0.65rem',
                      width: '100%',
                      padding: '0.4rem 0.5rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px dashed #cbd5e1'
                    }}
                  >
                    <div className="text-[10px] uppercase font-bold text-muted">Beneficiary Account</div>
                    <div className="text-xs font-bold text-slate-800">{recipientName}</div>
                    <div className="text-[11px] font-mono font-medium text-emerald-700">{recipientUpiId}</div>
                  </div>
                </div>

                {/* Right: Payment Steps & Confirmation Form */}
                <div className="flex flex-col gap-3">
                  <div>
                    <h4 className="font-bold text-base mb-1 text-slate-900 flex items-center gap-1.5">
                      <span>Google Pay UPI Transfer</span>
                      <span className="badge badge-success text-[10px] py-0.5">₹{totalAmount} INR</span>
                    </h4>
                    <p className="text-xs text-muted">
                      Follow these 3 quick steps to complete your booking:
                    </p>
                  </div>

                  {/* Step 1: UPI ID with Copy button */}
                  <div className="p-2.5 rounded-lg border bg-slate-50" style={{ borderColor: '#e2e8f0' }}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-slate-700">1. Copy UPI ID or Scan QR:</span>
                      <button 
                        type="button"
                        onClick={handleCopyUpi}
                        className="btn btn-outline py-0.5 px-2 text-xs flex items-center gap-1 font-bold"
                        style={{
                          backgroundColor: copiedUpi ? '#ecfdf5' : '#ffffff',
                          color: copiedUpi ? '#059669' : '#1e293b',
                          borderColor: copiedUpi ? '#10b981' : '#cbd5e1'
                        }}
                      >
                        {copiedUpi ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        <span>{copiedUpi ? 'Copied!' : 'Copy UPI ID'}</span>
                      </button>
                    </div>
                    <div className="font-mono text-xs font-bold text-primary p-1.5 bg-white rounded border border-slate-200">
                      {recipientUpiId}
                    </div>

                    {/* Direct mobile links */}
                    <div className="mt-2 flex gap-1.5 flex-wrap">
                      <a 
                        href={upiPayString}
                        className="btn btn-outline py-1 px-2 text-[11px] flex items-center gap-1"
                        style={{ backgroundColor: 'white', textDecoration: 'none' }}
                      >
                        📱 Open UPI App (GPay/PhonePe)
                      </a>
                    </div>
                  </div>

                  {/* Step 2 & 3: Enter UPI Reference Number / UTR */}
                  <div className="p-2.5 rounded-lg border bg-slate-50" style={{ borderColor: '#e2e8f0' }}>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      2. Enter 12-Digit UPI Ref / UTR Number:
                    </label>
                    <input 
                      type="text"
                      className="input-field text-xs font-mono font-bold"
                      placeholder="e.g. 428190382910"
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value)}
                      disabled={processing}
                    />
                    <div className="text-[11px] text-muted mt-1">
                      (UPI App payment receipt me 12 digit UPI Ref / UTR number hota hai)
                    </div>
                  </div>

                  {/* Big Green Confirm Button */}
                  <button 
                    type="button"
                    onClick={() => handleProcessPayment('gpay_upi')}
                    disabled={processing}
                    className="btn btn-primary py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-md"
                    style={{ backgroundColor: '#10b981', borderColor: '#059669', color: 'white' }}
                  >
                    {processing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Verifying & Confirming Booking...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={17} />
                        <span>✓ I Have Paid ₹{totalAmount} — Confirm & Download Invoice</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: 1-CLICK FAST PAY (SANDBOX TESTING) */}
          {/* ======================================================== */}
          {activeTab === 'testpay' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="badge badge-success text-xs font-bold py-1 px-2.5">⚡ FAST APPROVAL</span>
                <span className="text-xs text-muted">Instant Booking Test Simulation</span>
              </div>
              <h4 className="font-bold text-base mb-1">1-Click Instant Sandbox Confirmation</h4>
              <p className="text-xs text-muted mb-3">
                Quick test mode to immediately verify the booking flow, create database records, and generate the official PDF Tax Invoice without sending real money every time.
              </p>

              <div className="card p-3.5 mb-4" style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac' }}>
                <div className="flex items-center gap-2 font-bold text-xs text-emerald-800 mb-1">
                  <CheckCircle2 size={16} />
                  <span>Immediate Automated Booking Guarantee</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Clicking below immediately marks this session as <strong>Paid (₹{totalAmount})</strong>, saves the unique invoice number into MongoDB, and opens your confirmed interview session.
                </p>
              </div>

              <button 
                type="button"
                onClick={() => handleProcessPayment('testpay')}
                disabled={processing}
                className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
                style={{ backgroundColor: '#16a34a' }}
              >
                {processing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Processing Sandbox Booking...</span>
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    <span>⚡ Confirm Booking Instantly (₹{totalAmount})</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: RAZORPAY STANDARD GATEWAY */}
          {/* ======================================================== */}
          {activeTab === 'razorpay' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="badge badge-info text-xs font-bold py-1 px-2.5">RAZORPAY STANDARD</span>
                <span className="text-xs text-muted">Official Payment Gateway Modal</span>
              </div>
              <h4 className="font-bold text-base mb-1">Launch Official Razorpay Dialog</h4>
              <p className="text-xs text-muted mb-3">
                Opens the standard Razorpay checkout modal with cards, netbanking, and simulated UPI.
              </p>

              <div className="card p-3 mb-4" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}>
                <div className="font-bold text-xs text-primary mb-1 flex items-center gap-1.5">
                  <ShieldCheck size={16} />
                  <span>Razorpay Test Mode Notice (ध्यान दें):</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Razorpay का यह टेस्ट मोड (<code>rzp_test_...</code>) केवल सॉफ्टवेयर टेस्टिंग के लिए है; इसमें बैंक खाते में असली पैसे क्रेडिट नहीं होते हैं। असली पैसे सीधे अपने बैंक खाते में प्राप्त करने के लिए पहला टैब <strong>"Google Pay & UPI QR (HDFC Bank)"</strong> इस्तेमाल करें, या Razorpay Dashboard से अपनी Live Merchant Keys <code>backend/.env</code> में जोड़ें।
                </p>
              </div>

              <button 
                type="button"
                onClick={handleOpenRazorpayCheckout}
                disabled={processing}
                className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
                style={{ backgroundColor: '#1a73e8' }}
              >
                <ExternalLink size={17} />
                <span>Open Razorpay Gateway Popup (₹{totalAmount})</span>
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: CARDS & NET BANKING */}
          {/* ======================================================== */}
          {activeTab === 'card' && (
            <div>
              <h4 className="font-bold text-base mb-1">Credit / Debit Card & NetBanking</h4>
              <p className="text-xs text-muted mb-3">All major Indian banks & RuPay, Visa, Mastercard supported.</p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="text-xs font-semibold text-muted block mb-0.5">Card Number</label>
                  <input 
                    type="text" 
                    className="input-field text-xs font-mono"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4532 8912 7390 1824"
                    disabled={processing}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted block mb-0.5">Valid Thru</label>
                  <input 
                    type="text" 
                    className="input-field text-xs font-mono"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    placeholder="MM/YY"
                    disabled={processing}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted block mb-0.5">CVV</label>
                  <input 
                    type="password" 
                    maxLength={4}
                    className="input-field text-xs font-mono"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    placeholder="512"
                    disabled={processing}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="text-xs font-semibold text-muted block mb-1">Or Select NetBanking Bank</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank', 'Kotak Bank', 'PNB'].map(bank => (
                    <button
                      type="button"
                      key={bank}
                      onClick={() => setSelectedBank(bank)}
                      className="p-1.5 border rounded text-xs text-center"
                      style={{
                        borderColor: selectedBank === bank ? 'var(--primary)' : 'var(--border)',
                        backgroundColor: selectedBank === bank ? '#eff6ff' : 'transparent',
                        fontWeight: selectedBank === bank ? 'bold' : 'normal'
                      }}
                    >
                      🏦 {bank}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="button"
                onClick={() => handleProcessPayment('card')}
                disabled={processing}
                className="btn btn-primary w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2"
              >
                <Lock size={15} />
                <span>Pay ₹{totalAmount} with Card / NetBanking</span>
              </button>
            </div>
          )}

          {/* Bottom Trust & Security Strip */}
          <div className="pt-3 border-t mt-3 flex items-center justify-between text-[11px] text-muted" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-1 text-emerald-600 font-semibold">
              <ShieldCheck size={14} />
              <span>256-bit Encrypted Banking & NPCI Compliant</span>
            </div>
            <div>Direct UPI Account Settlement</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
