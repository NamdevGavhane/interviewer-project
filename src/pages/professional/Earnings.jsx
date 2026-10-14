import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, CheckCircle, Clock, Calendar, Download, ShieldCheck, Receipt, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { downloadInvoicePDF } from '../../utils/invoiceGenerator';
import { API_BASE_URL } from '../../config/api';

const Earnings = () => {
  const [earningsData, setEarningsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const userId = localStorage.getItem('userId');

  useEffect(() => {
    if (!userId) {
      navigate('/login');
      return;
    }

    const fetchEarnings = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/users/${userId}/earnings`);
        if (!res.ok) throw new Error('Failed to load earnings report');
        const data = await res.json();
        setEarningsData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchEarnings();
  }, [userId, navigate]);

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

      {loading ? (
        <div className="card p-12 text-center text-muted">Loading earnings data...</div>
      ) : error ? (
        <div className="card p-6 text-danger">Error: {error}</div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Top Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div className="card">
              <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
                <span>Total Earned (Gross)</span>
                <DollarSign size={18} className="text-success" />
              </div>
              <div className="text-3xl font-bold mt-2 text-success">
                ₹{earningsData.stats.totalEarned.toLocaleString()}
              </div>
              <div className="text-xs text-muted mt-1">From {earningsData.stats.completedSessions} completed sessions</div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
                <span>Pending Revenue</span>
                <Clock size={18} className="text-primary" />
              </div>
              <div className="text-3xl font-bold mt-2" style={{ color: 'var(--primary)' }}>
                ₹{earningsData.stats.pendingEarnings.toLocaleString()}
              </div>
              <div className="text-xs text-muted mt-1">{earningsData.stats.scheduledSessions} upcoming scheduled sessions</div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
                <span>Completed Interviews</span>
                <CheckCircle size={18} className="text-success" />
              </div>
              <div className="text-3xl font-bold mt-2">
                {earningsData.stats.completedSessions}
              </div>
              <div className="text-xs text-muted mt-1">Out of {earningsData.stats.totalSessions} total bookings</div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
                <span>Rate Per 45-Min Session</span>
                <TrendingUp size={18} className="text-primary" />
              </div>
              <div className="text-3xl font-bold mt-2">
                ₹{earningsData.professional.hourlyRate}
              </div>
              <div className="text-xs text-success font-semibold mt-1">
                {earningsData.professional.isVerified ? 'Verified Expert Badge Active 🟢' : 'Standard Rate'}
              </div>
            </div>
          </div>

          {/* Sessions Ledger Table */}
          <div className="card p-0" style={{ overflow: 'hidden' }}>
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
              <div className="font-bold text-base flex items-center gap-2">
                <Receipt size={18} className="text-primary" />
                <span>Session Payout History</span>
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
                  {earningsData.sessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                        No session earnings records yet. Once candidates book mock interviews with you, they will appear here.
                      </td>
                    </tr>
                  ) : (
                    earningsData.sessions.map((item, idx) => {
                      const candidate = item.candidateId;
                      const payout = item.price || 100;
                      const invNo = item.invoiceNumber || `INV-2026-${(item._id || '').slice(-6).toUpperCase()}`;

                      return (
                        <tr key={item._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div className="flex items-center gap-2.5">
                              <img 
                                src={candidate?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'} 
                                alt={candidate?.name} 
                                className="profile-avatar"
                                style={{ width: '32px', height: '32px' }}
                              />
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
                                interviewerName: earningsData.professional.name,
                                sessionFee: payout,
                                platformFee: 10,
                                paidAmount: payout + 10,
                                invoiceNumber: invNo,
                                paymentId: item.paymentId || `pay_${(item._id || '').slice(-8)}`,
                                paymentMethod: item.paymentMethod || 'Razorpay UPI'
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
      )}
    </div>
  );
};

export default Earnings;
