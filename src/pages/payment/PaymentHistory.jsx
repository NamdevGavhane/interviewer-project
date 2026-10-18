import { useState, useEffect } from 'react';
import { CreditCard, Receipt, Download, ShieldCheck, CheckCircle2, Clock, Search, DollarSign, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../utils/apiClient';
import { downloadInvoicePDF } from '../../utils/invoiceGenerator';

const PaymentHistory = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) {
      navigate('/login');
      return;
    }

    const fetchPaymentRecords = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/api/payment/history');
        setPayments(res.data || []);
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Failed to fetch payment history');
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentRecords();
  }, [user, isAuthenticated, authLoading, navigate]);

  const userRole = user?.role || 'candidate';

  const filteredRecords = payments.filter(r => {
    const term = search.toLowerCase();
    const inv = r.invoiceNumber?.toLowerCase() || '';
    const payId = r.paymentId?.toLowerCase() || '';
    const candidateName = r.candidateId?.name?.toLowerCase() || '';
    const interviewerName = r.interviewerId?.name?.toLowerCase() || '';
    return inv.includes(term) || payId.includes(term) || candidateName.includes(term) || interviewerName.includes(term);
  });

  const totalSpentOrEarned = payments.reduce((sum, r) => sum + (r.amount || 0), 0);

  if (authLoading || loading) {
    return (
      <div className="card text-center p-12 text-muted flex items-center justify-center gap-2">
        <Loader2 size={20} className="animate-spin text-primary" />
        <span>Loading transaction records...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge badge-info text-xs font-semibold uppercase">
              {userRole === 'professional' ? 'Professional Module' : 'Payment Module'}
            </span>
            <span className="text-xs text-muted">
              {userRole === 'professional' ? 'Earnings & Payouts' : 'Billing & Invoices'}
            </span>
          </div>
          <h2 className="text-2xl font-bold mt-1">
            {userRole === 'professional' ? 'Earnings & Payout Statements' : 'Payment History & Tax Invoices'}
          </h2>
          <p className="text-muted text-sm">
            {userRole === 'professional' 
              ? 'Track your completed interview session earnings, download payout vouchers, and inspect settlement records.' 
              : 'Download official GST tax invoices, review transactions, and inspect payment receipts.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-danger mb-4 flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
            <span>{userRole === 'professional' ? 'Total Payout Received' : 'Total Amount Paid'}</span>
            <DollarSign size={18} className="text-success" />
          </div>
          <div className="text-2xl font-bold mt-2 text-success">₹{totalSpentOrEarned.toLocaleString()} INR</div>
          <div className="text-xs text-muted mt-1">{payments.length} verified transactions</div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
            <span>Payment Security</span>
            <ShieldCheck size={18} className="text-primary" />
          </div>
          <div className="text-sm font-bold mt-2 flex items-center gap-1.5 text-success">
            <span>Razorpay 256-Bit SSL 🟢</span>
          </div>
          <div className="text-xs text-muted mt-1">RBI Compliant & Verified</div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
            <span>Invoice Generation</span>
            <Receipt size={18} className="text-primary" />
          </div>
          <div className="text-sm font-bold mt-2">Instant PDF Ready</div>
          <div className="text-xs text-muted mt-1">
            100% Tax Compliant receipts
          </div>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="card p-0" style={{ overflow: 'hidden' }}>
        <div className="p-4 border-b flex flex-col sm:flex-row justify-between items-center gap-3" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
          <div className="font-bold text-base flex items-center gap-2">
            <Receipt size={18} className="text-primary" />
            <span>Transaction Ledger</span>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
            <input 
              type="text" 
              placeholder="Search invoice or partner..." 
              className="input-field"
              style={{ paddingLeft: '2.2rem', paddingBottom: '0.4rem', paddingTop: '0.4rem', fontSize: '0.85rem' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Transaction ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>{userRole === 'professional' ? 'Candidate' : 'Interviewer'}</th>
                <th style={{ padding: '0.75rem 1rem' }}>{userRole === 'professional' ? 'Payout Earned' : 'Amount'}</th>
                <th style={{ padding: '0.75rem 1rem' }}>Method</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Invoice Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                    No transaction records found. Once an interview session is conducted or booked, official records will appear here.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => {
                  const partner = userRole === 'professional' ? r.candidateId : r.interviewerId;
                  const partnerName = partner?.name || (userRole === 'professional' ? 'Candidate' : 'Interviewer');

                  return (
                    <tr key={r._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--primary)' }}>
                        {r.invoiceNumber}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                        {r.paymentId}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                        {partnerName}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 'bold' }}>
                        ₹{r.amount}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className="badge badge-secondary text-xs uppercase">
                          {r.paymentMethod || 'Razorpay'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${r.status === 'captured' ? 'badge-success' : 'badge-warning'} text-xs font-semibold py-0.5 px-2`}>
                          {r.status?.toUpperCase() || 'CAPTURED'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-outline text-xs py-1 px-3 inline-flex items-center gap-1.5"
                          style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                          onClick={() => downloadInvoicePDF({
                            ...r,
                            candidateName: r.candidateId?.name,
                            candidateEmail: r.candidateId?.email,
                            interviewerName: r.interviewerId?.name,
                            interviewerTitle: r.interviewerId?.title,
                            company: r.interviewerId?.company,
                            sessionFee: r.sessionFee || r.amount || 0,
                            platformFee: r.platformFee || 0,
                            gstAmount: r.gstAmount || 0,
                            paidAmount: r.amount,
                            invoiceNumber: r.invoiceNumber,
                            paymentId: r.paymentId,
                            paymentMethod: r.paymentMethod || 'Razorpay'
                          })}
                        >
                          <Download size={14} />
                          <span>Download PDF</span>
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
  );
};

export default PaymentHistory;
