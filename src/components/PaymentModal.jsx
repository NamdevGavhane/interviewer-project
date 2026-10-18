import { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  Lock, 
  AlertCircle,
  Loader2,
  ExternalLink,
  CheckCircle2,
  IndianRupee,
  Calendar,
  Clock,
  Sparkles
} from 'lucide-react';
import apiClient from '../utils/apiClient';

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const PaymentModal = ({
  isOpen,
  onClose,
  bookingDetails,
  onSuccess
}) => {
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadRazorpayScript().then(loaded => setScriptLoaded(loaded));
    }
  }, [isOpen]);

  if (!isOpen || !bookingDetails) return null;

  const {
    interviewer,
    selectedDate,
    selectedSlot,
    slotId,
    topic,
    notes = '',
    orderId,
    keyId,
    sessionFee = 0,
    platformFee = 0,
    gstAmount = 0,
    totalAmount = 0,
    freeSession = false
  } = bookingDetails;

  const isFree = freeSession || totalAmount === 0;

  // Process free session booking
  const handleConfirmFree = async () => {
    setError(null);
    setProcessing(true);
    setStatusMessage('Confirming your free session booking...');

    try {
      const res = await apiClient.post('/api/payment/verify-and-book', {
        interviewerId: interviewer._id,
        date: selectedDate,
        timeSlot: selectedSlot,
        slotId,
        topic,
        notes,
        orderId: `FREE_${Date.now()}`,
        paymentId: `FREE_${Date.now()}`,
        signature: 'free_session',
        paymentMethod: 'free'
      });

      onSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to confirm booking.');
    } finally {
      setProcessing(false);
    }
  };

  // Process Razorpay Checkout
  const handleOpenRazorpay = async () => {
    setError(null);

    if (!keyId) {
      setError('Razorpay payment gateway is not configured on the platform. Please contact administrator.');
      return;
    }

    if (!scriptLoaded && !window.Razorpay) {
      setProcessing(true);
      const loaded = await loadRazorpayScript();
      setProcessing(false);
      if (!loaded) {
        setError('Failed to load secure Razorpay gateway script. Please check your internet connection.');
        return;
      }
    }

    setProcessing(true);
    setStatusMessage('Opening secure Razorpay payment window...');

    try {
      const options = {
        key: keyId,
        amount: Math.round(totalAmount * 100), // in paise
        currency: 'INR',
        name: 'InterviewPro',
        description: `Mock Interview: ${topic}`,
        order_id: orderId,
        theme: {
          color: '#1a73e8'
        },
        handler: async function (response) {
          setStatusMessage('Verifying payment and confirming schedule...');
          try {
            const verifyRes = await apiClient.post('/api/payment/verify-and-book', {
              interviewerId: interviewer._id,
              date: selectedDate,
              timeSlot: selectedSlot,
              slotId,
              topic,
              notes,
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              paymentMethod: 'razorpay'
            });

            onSuccess(verifyRes.data);
          } catch (verifyErr) {
            setError(verifyErr.response?.data?.message || 'Payment verification failed. Please contact support.');
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: function () {
            setProcessing(false);
            setStatusMessage('');
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setError(resp.error?.description || 'Payment was cancelled or failed.');
        setProcessing(false);
        setStatusMessage('');
      });
      rzp.open();
    } catch (err) {
      setError(err.message || 'Could not launch payment gateway.');
      setProcessing(false);
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
        padding: '1rem',
        overflowY: 'auto'
      }}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '560px',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          backgroundColor: '#ffffff',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div 
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: 'white',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div className="flex items-center gap-2.5">
            <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '0.4rem', borderRadius: '8px' }}>
              <Lock size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isFree ? 'Confirm Free Session' : 'Secure Checkout'}
              </h3>
              <p className="text-xs text-slate-400">
                {isFree ? 'Complimentary Mock Interview' : 'Official Razorpay Gateway'}
              </p>
            </div>
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

        {/* Body */}
        <div style={{ padding: '1.5rem' }}>
          {error && (
            <div className="p-3 mb-4 rounded-lg flex items-start gap-2.5 text-xs text-rose-700 bg-rose-50 border border-rose-200">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Interview Details Card */}
          <div className="p-3.5 mb-4 rounded-xl border bg-slate-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div 
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: '#e2e8f0',
                  color: '#334155',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem'
                }}
              >
                {interviewer?.name ? interviewer.name.slice(0, 2).toUpperCase() : 'IN'}
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">{interviewer?.name}</h4>
                <p className="text-xs text-slate-500">{interviewer?.title} • {interviewer?.company}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1 justify-end">
                <Calendar size={13} className="text-primary" />
                <span>{selectedDate}</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1 justify-end mt-0.5">
                <Clock size={12} />
                <span>{selectedSlot}</span>
              </div>
            </div>
          </div>

          {/* Topic */}
          <div className="mb-4 text-xs text-slate-600 bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
            <span className="font-semibold text-blue-900">Session Focus: </span>
            <span>{topic || 'General Mock Technical Interview'}</span>
          </div>

          {/* Price Breakdown */}
          {isFree ? (
            <div className="text-center p-6 bg-emerald-50 rounded-xl border border-emerald-200 mb-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <Sparkles size={24} />
              </div>
              <h4 className="font-bold text-emerald-900 text-base mb-1">Free Session (₹0)</h4>
              <p className="text-xs text-emerald-700">
                This interviewer has made this session complimentary. No payment information is required.
              </p>
            </div>
          ) : (
            <div className="p-4 mb-5 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex justify-between items-center text-xs py-1 text-slate-600">
                <span>Interviewer Session Fee</span>
                <span className="font-semibold text-slate-800">₹{sessionFee}</span>
              </div>
              {platformFee > 0 && (
                <div className="flex justify-between items-center text-xs py-1 text-slate-600">
                  <span>Platform Service Fee</span>
                  <span className="font-semibold text-slate-800">₹{platformFee}</span>
                </div>
              )}
              {gstAmount > 0 && (
                <div className="flex justify-between items-center text-xs py-1 text-slate-600">
                  <span>GST</span>
                  <span className="font-semibold text-slate-800">₹{gstAmount}</span>
                </div>
              )}
              <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-900">Total Payable</span>
                <span className="text-lg font-bold text-primary">₹{totalAmount} INR</span>
              </div>
            </div>
          )}

          {/* Action Button */}
          {isFree ? (
            <button
              type="button"
              onClick={handleConfirmFree}
              disabled={processing}
              className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: '#10b981', borderColor: '#059669' }}
            >
              {processing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{statusMessage || 'Confirming...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={17} />
                  <span>Confirm Free Booking</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenRazorpay}
              disabled={processing || !keyId}
              className="btn btn-primary w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
            >
              {processing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{statusMessage || 'Connecting to gateway...'}</span>
                </>
              ) : (
                <>
                  <ExternalLink size={16} />
                  <span>Pay ₹{totalAmount} via Razorpay Gateway</span>
                </>
              )}
            </button>
          )}

          {/* Security strip */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>256-Bit SSL Encrypted • Powered by Razorpay Standard</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
