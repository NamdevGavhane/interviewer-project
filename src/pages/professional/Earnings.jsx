import { useState, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  Download, 
  Receipt, 
  ArrowUpRight,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../utils/apiClient';
import { downloadInvoicePDF } from '../../utils/invoiceGenerator';

const Earnings = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [earningsData, setEarningsData] = useState(null);
  const [payoutsData, setPayoutsData] = useState(null);
  const [publicConfig, setPublicConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfscCode, setBankIfscCode] = useState('');
  const [bankBeneficiaryName, setBankBeneficiaryName] = useState(user?.name || '');
  const [payoutMsg, setPayoutMsg] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) {
      navigate('/login');
      return;
    }

    const fetchEarningsAndPayouts = async () => {
      try {
        setLoading(true);
        const [earningsRes, payoutsRes, configRes] = await Promise.all([
          apiClient.get(`/api/users/${user._id}/earnings`),
          apiClient.get('/api/payment/payouts').catch(() => ({ data: { stats: {}, payouts: [] } })),
          apiClient.get('/api/config/public').catch(() => null)
        ]);

        setEarningsData(earningsRes.data || earningsRes);
        setPayoutsData(payoutsRes.data || payoutsRes);
        if (configRes) setPublicConfig(configRes);
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Failed to load earnings report');
      } finally {
        setLoading(false);
      }
    };

    fetchEarningsAndPayouts();
  }, [user, isAuthenticated, authLoading, navigate]);

  const handleRequestPayout = async (e) => {
    e.preventDefault();
    setPayoutMsg(null);
    const amt = Number(payoutAmount);
    if (!amt || amt <= 0) return;

    const minPayoutThreshold = payoutsData?.stats?.minPayout ?? earningsData?.stats?.minPayout ?? (publicConfig?.minPayoutPaise ? publicConfig.minPayoutPaise / 100 : 0);
    if (minPayoutThreshold > 0 && amt < minPayoutThreshold) {
      setPayoutMsg({ type: 'error', text: `Minimum payout request is ₹${minPayoutThreshold}.` });
      return;
    }

    if (!bankAccountNumber.trim() || !bankIfscCode.trim()) {
      setPayoutMsg({ type: 'error', text: 'Bank Account Number and IFSC Code are required for payout disbursement.' });
      return;
    }

    try {
      setRequestingPayout(true);
      const res = await apiClient.post('/api/payment/payouts/request', {
        amount: amt,
        payoutMethod: 'bank_transfer',
        bankDetails: {
          accountNumber: bankAccountNumber.trim(),
          ifscCode: bankIfscCode.trim().toUpperCase(),
          beneficiaryName: bankBeneficiaryName.trim() || user?.name || ''
        }
      });
      setPayoutMsg({ type: 'success', text: res.data.message || 'Payout requested successfully!' });
      setPayoutAmount('');
      // Refresh payouts data
      const payoutsRes = await apiClient.get('/api/payment/payouts');
      setPayoutsData(payoutsRes.data);
    } catch (err) {
      setPayoutMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setRequestingPayout(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="card text-center p-12 text-muted flex items-center justify-center gap-2">
        <Loader2 size={20} className="animate-spin text-primary" />
        <span>Loading earnings & payout records...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 text-danger flex items-center gap-2">
        <AlertCircle size={20} />
        <span>Error: {error}</span>
      </div>
    );
  }

  const availableBalance = payoutsData?.stats?.availableBalance ?? (earningsData?.stats?.totalEarned || 0);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge badge-info text-xs font-semibold uppercase">Professional Module</span>
            <span className="text-xs text-muted">Payout & Revenue</span>
          </div>
          <h2 className="text-2xl font-bold mt-1">Interviewer Earnings & Ledger</h2>
          <p className="text-muted text-sm">Track your mock interview earnings, completed sessions, and platform payouts.</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Top Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <div className="card">
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Total Earned (Gross)</span>
              <DollarSign size={18} className="text-success" />
            </div>
            <div className="text-3xl font-bold mt-2 text-success">
              ₹{(earningsData?.stats?.totalEarned || 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted mt-1">From {earningsData?.stats?.completedSessions || 0} completed sessions</div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Available for Payout</span>
              <ArrowUpRight size={18} className="text-primary" />
            </div>
            <div className="text-3xl font-bold mt-2 text-primary">
              ₹{availableBalance.toLocaleString()}
            </div>
            <div className="text-xs text-muted mt-1">Net earnings ready to withdraw</div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Pending Revenue</span>
              <Clock size={18} className="text-warning" />
            </div>
            <div className="text-3xl font-bold mt-2 text-amber-600">
              ₹{(earningsData?.stats?.pendingEarnings || 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted mt-1">{earningsData?.stats?.scheduledSessions || 0} scheduled sessions</div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Earning Per Session</span>
              <TrendingUp size={18} className="text-primary" />
            </div>
            <div className="text-3xl font-bold mt-2">
              {publicConfig?.mockSessionPricePaise != null
                ? `₹${(publicConfig.mockSessionPricePaise / 100) * ((publicConfig.interviewerSharePercent ?? 70) / 100)}`
                : '...'}
            </div>
            <div className="text-xs text-success font-semibold mt-1">
              Interviewer Share ({publicConfig?.interviewerSharePercent ?? 70}%)
            </div>
          </div>
        </div>

        {/* Payout Withdrawal Card */}
        {payoutsData?.stats?.onHoldEarned > 0 && (
          <div className="card p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
            <Clock size={16} className="text-amber-600 shrink-0" />
            <span>
              <strong>Clearance Hold:</strong> ₹{payoutsData.stats.onHoldEarned.toLocaleString()} from recent sessions is in the standard {payoutsData.stats.payoutHoldDays || 3}-day fraud prevention clearance window and will unlock automatically.
            </span>
          </div>
        )}

        {availableBalance > 0 && (
          <div className="card p-4 bg-slate-50 border">
            <div>
              <h4 className="font-bold text-sm text-slate-800">Request Payout Disbursement</h4>
              <p className="text-xs text-muted">
                Withdraw cleared earnings directly to your verified bank account.
                {payoutsData?.stats?.minPayout ? ` Minimum withdrawal: ₹${payoutsData.stats.minPayout}.` : ''}
              </p>
            </div>
            <form onSubmit={handleRequestPayout} className="mt-3 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">Account Number *</label>
                  <input
                    type="text"
                    placeholder="Bank Account Number"
                    className="input-field text-xs py-1.5 px-3 w-full"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">IFSC Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC0001234"
                    className="input-field text-xs py-1.5 px-3 w-full uppercase"
                    value={bankIfscCode}
                    onChange={(e) => setBankIfscCode(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">Beneficiary Name</label>
                  <input
                    type="text"
                    placeholder="Account Holder Name"
                    className="input-field text-xs py-1.5 px-3 w-full"
                    value={bankBeneficiaryName}
                    onChange={(e) => setBankBeneficiaryName(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  min={payoutsData?.stats?.minPayout || 1}
                  max={availableBalance}
                  placeholder={`Amount (min ₹${payoutsData?.stats?.minPayout || 0}, max ₹${availableBalance})`}
                  className="input-field text-xs py-1.5 px-3 w-56"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  required
                />
                <button 
                  type="submit" 
                  disabled={requestingPayout || !payoutAmount}
                  className="btn btn-primary text-xs py-1.5 px-4 font-bold flex items-center gap-1.5"
                >
                  {requestingPayout ? <Loader2 size={13} className="animate-spin" /> : null}
                  <span>Submit Withdrawal Request</span>
                </button>
              </div>
            </form>
            {payoutMsg && (
              <div className={`mt-2 text-xs font-semibold ${payoutMsg.type === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>
                {payoutMsg.text}
              </div>
            )}
          </div>
        )}

        {/* Sessions Ledger Table */}
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div className="font-bold text-base flex items-center gap-2">
              <Receipt size={18} className="text-primary" />
              <span>Session History & Receipts</span>
            </div>
            <span className="text-xs text-muted">All interviews conducted or scheduled with you</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Candidate</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Session Topic</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Date & Slot</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Payout</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {(!earningsData?.sessions || earningsData.sessions.length === 0) ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      No session earnings records yet. Once candidates book mock interviews with you, they will appear here.
                    </td>
                  </tr>
                ) : (
                  earningsData.sessions.map((item, idx) => {
                    const candidate = item.candidateId;
                    const payout = item.price || 0;
                    const invNo = item.invoiceNumber || `INV-${(item._id || '').slice(-6).toUpperCase()}`;

                    return (
                      <tr key={item._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div className="flex items-center gap-2.5">
                            <div 
                              style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                backgroundColor: '#e2e8f0',
                                color: '#475569',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                fontSize: '0.75rem'
                              }}
                            >
                              {candidate?.name ? candidate.name.slice(0, 2).toUpperCase() : 'CA'}
                            </div>
                            <div>
                              <div className="font-semibold">{candidate?.name || 'Candidate'}</div>
                              <div className="text-xs text-muted">{candidate?.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div className="font-medium">{item.topic}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div>{item.date}</div>
                          <div className="text-xs text-muted">{item.timeSlot}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 'bold' }}>
                          <span className={item.status === 'completed' ? 'text-success' : ''}>
                            ₹{payout}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className={`badge ${
                            item.status === 'completed' ? 'badge-success' : 
                            item.status === 'scheduled' ? 'badge-info' : 'badge-warning'
                          } text-xs font-semibold py-0.5 px-2`}>
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-outline text-xs py-1 px-2.5 inline-flex items-center gap-1"
                            onClick={() => downloadInvoicePDF({
                              ...item,
                              candidateName: candidate?.name,
                              candidateEmail: candidate?.email,
                              interviewerName: earningsData.professional?.name || user.name,
                              sessionFee: payout,
                              platformFee: item.platformFee || 0,
                              paidAmount: item.paidAmount || payout,
                              invoiceNumber: invNo,
                              paymentId: item.paymentId || 'N/A',
                              paymentMethod: item.paymentMethod || 'Razorpay'
                            })}
                          >
                            <Download size={13} />
                            <span>Receipt</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Earnings;
