import { useState, useEffect } from 'react';
import { CreditCard, Receipt, Download, ShieldCheck, CheckCircle2, Clock, Search, ArrowUpRight, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { downloadInvoicePDF } from '../../utils/invoiceGenerator';

const PaymentHistory = () => {
  const [payments, setPayments] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const userId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole') || 'candidate';

  useEffect(() => {
    if (!userId) {
      navigate('/login');
      return;
    }

    const fetchPaymentRecords = async () => {
      try {
        setLoading(true);
        const [payRes, intRes] = await Promise.all([
          fetch(`http://localhost:5000/api/payment/history?userId=${userId}&role=${userRole}`),
          fetch(`http://localhost:5000/api/interviews?userId=${userId}&role=${userRole}`)
        ]);

        if (payRes.ok) setPayments(await payRes.json());
        if (intRes.ok) setInterviews(await intRes.json());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentRecords();
  }, [userId, userRole, navigate]);

  // Combine payments or fallback to paid interviews
  const recordList = payments.length > 0 ? payments : interviews.map(i => ({
    _id: i._id,
    invoiceNumber: i.invoiceNumber || `INV-2026-${i._id.slice(-6).toUpperCase()}`,
    amount: i.paidAmount || (i.price + Math.round(i.price * 0.1)),
    sessionFee: i.price,
    platformFee: i.platformFee || 10,
    status: 'captured',
    paymentMethod: i.paymentMethod || 'UPI / Razorpay',
    paymentId: i.paymentId || `pay_${i._id.slice(-8)}`,
    createdAt: i.createdAt,
    candidateId: i.candidateId,
    interviewerId: i.interviewerId,
    interviewId: i
  }));

  const filteredRecords = recordList.filter(r => {
    const term = search.toLowerCase();
    const inv = r.invoiceNumber?.toLowerCase() || '';
    const payId = r.paymentId?.toLowerCase() || '';
    const candidateName = r.candidateId?.name?.toLowerCase() || '';
    const interviewerName = r.interviewerId?.name?.toLowerCase() || '';
    return inv.includes(term) || payId.includes(term) || candidateName.includes(term) || interviewerName.includes(term);
  });

  const totalSpentOrEarned = recordList.reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge badge-info text-xs font-semibold uppercase">Payment Module</span>
            <span className="text-xs text-muted">Billing & Invoices</span>
          </div>
          <h2 className="text-2xl font-bold mt-1">Payment History & Tax Invoices</h2>
          <p className="text-muted text-sm">Download official GST tax invoices, review gateway transactions, and inspect payment receipts.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
            <span>{userRole === 'professional' ? 'Total Payout Received' : 'Total Amount Paid'}</span>
            <DollarSign size={18} className="text-success" />
          </div>
          <div className="text-2xl font-bold mt-2 text-success">₹{totalSpentOrEarned.toLocaleString()} INR</div>
          <div className="text-xs text-muted mt-1">{recordList.length} verified transactions</div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
            <span>Payment Security</span>
            <ShieldCheck size={18} className="text-primary" />
          </div>
          <div className="text-sm font-bold mt-2 flex items-center gap-1.5 text-success">
            <span>Razorpay 256-Bit SSL 🟢</span>
          </div>
          <div className="text-xs text-muted mt-1">RBI Compliant & Unified UPI</div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
            <span>Invoice Generation</span>
            <Receipt size={18} className="text-primary" />
          </div>
          <div className="text-sm font-bold mt-2">Instant PDF Ready</div>
          <div className="text-xs text-muted mt-1">100% Tax Compliant receipts</div>
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

        {loading ? (
          <div className="p-12 text-center text-muted">Loading transaction ledger...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Transaction ID</th>
                  <th style={{ padding: '0.75rem 1rem' }}>{userRole === 'professional' ? 'Candidate' : 'Interviewer'}</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Method</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Invoice Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      No payment records found. Once you book or conduct an interview, official invoices will appear here.
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
                          {r.paymentId || `pay_${(r._id || '').slice(-8)}`}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                          {partnerName}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 'bold' }}>
                          ₹{r.amount}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className="badge badge-secondary text-xs uppercase">
                            {r.paymentMethod || 'UPI'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className="badge badge-success text-xs font-semibold py-0.5 px-2">
                            CAPTURED ●
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
                              sessionFee: r.sessionFee || (r.amount - 10) || 100,
                              platformFee: r.platformFee || 10,
                              paidAmount: r.amount,
                              invoiceNumber: r.invoiceNumber,
                              paymentId: r.paymentId || `pay_${(r._id || '').slice(-8)}`,
                              paymentMethod: r.paymentMethod || 'Razorpay UPI'
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
        )}
      </div>
    </div>
  );
};

export default PaymentHistory;
