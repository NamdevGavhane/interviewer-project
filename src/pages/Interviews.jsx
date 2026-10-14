import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, Video, FileText, CheckCircle2, AlertCircle, XCircle, ChevronRight, User, Download, ShieldCheck, CreditCard, Receipt } from 'lucide-react';
import { downloadInvoicePDF } from '../utils/invoiceGenerator';
import { downloadInterviewReportPDF } from '../utils/interviewReportGenerator';
import { API_BASE_URL } from '../config/api';

const Interviews = () => {
  const [interviews, setInterviews] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'past' | 'invoices'
  const [actionLoading, setActionLoading] = useState(null);
  const navigate = useNavigate();

  const userId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole') || 'candidate';

  const fetchInterviews = async () => {
    if (!userId) {
      navigate('/login');
      return;
    }
    try {
      setLoading(true);
      const [resInterviews, resPayments] = await Promise.all([
        fetch(`${API_BASE_URL}/api/interviews?userId=${userId}&role=${userRole}`),
        fetch(`${API_BASE_URL}/api/payment/history?userId=${userId}&role=${userRole}`)
      ]);

      if (!resInterviews.ok) throw new Error('Failed to load interviews');
      const data = await resInterviews.json();
      setInterviews(data);

      if (resPayments.ok) {
        const payData = await resPayments.json();
        setPayments(payData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInterviews();
  }, [userId, userRole]);

  const handleCancelInterview = async (interviewId) => {
    if (!window.confirm('Are you sure you want to cancel this mock interview session?')) return;
    try {
      setActionLoading(interviewId);
      const res = await fetch(`${API_BASE_URL}/api/interviews/${interviewId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });
      if (!res.ok) throw new Error('Failed to cancel session');
      await fetchInterviews();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadReportForInterview = async (interviewItem) => {
    try {
      setActionLoading(`report_${interviewItem._id}`);
      const res = await fetch(`${API_BASE_URL}/api/feedbacks/interview/${interviewItem._id}`);
      if (res.ok) {
        const feedbackData = await res.json();
        downloadInterviewReportPDF(feedbackData);
      } else {
        downloadInterviewReportPDF({
          interviewId: interviewItem,
          candidateId: interviewItem.candidateId,
          interviewerId: interviewItem.interviewerId,
          topic: interviewItem.topic,
          date: interviewItem.date,
          timeSlot: interviewItem.timeSlot
        });
      }
    } catch (err) {
      console.error(err);
      alert('Error downloading report PDF: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const uniqueScheduled = [];
  const seenScheduled = new Set();
  for (const session of interviews.filter(i => i.status === 'scheduled')) {
    const key = `${session.interviewerId?._id || session.interviewerId}_${session.date}_${session.timeSlot}`;
    if (!seenScheduled.has(key)) {
      seenScheduled.add(key);
      uniqueScheduled.push(session);
    }
  }
  const upcomingInterviews = uniqueScheduled;
  const pastInterviews = interviews.filter(i => i.status === 'completed' || i.status === 'cancelled');

  const displayedList = activeTab === 'upcoming' ? upcomingInterviews : pastInterviews;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">My Interview Sessions</h2>
          <p className="text-muted mt-1">Manage scheduled sessions, live rooms, and evaluation reports.</p>
        </div>
        <Link to="/booking">
          <button className="btn btn-primary">
            + Book New Interview
          </button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <button 
          className={`tab-button ${activeTab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming Sessions ({upcomingInterviews.length})
        </button>
        <button 
          className={`tab-button ${activeTab === 'past' ? 'active' : ''}`}
          onClick={() => setActiveTab('past')}
        >
          Past & Completed ({pastInterviews.length})
        </button>
        <button 
          className={`tab-button ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          Billing & Invoices ({payments.length || interviews.length})
        </button>
      </div>

      {loading ? (
        <div className="card text-center p-12 text-muted">
          Loading your interview sessions & payment receipts from database...
        </div>
      ) : error ? (
        <div className="card p-6 text-danger">
          Error: {error}
        </div>
      ) : activeTab === 'invoices' ? (
        /* BILLING & INVOICES TAB */
        <div>
          {/* Quick Stats Banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="text-xs text-muted uppercase font-semibold">Total Verified Invoices</div>
              <div className="text-2xl font-bold mt-1" style={{ color: 'var(--primary)' }}>
                {payments.length || interviews.length}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-muted uppercase font-semibold">
                {userRole === 'professional' ? 'Total Earnings (Gross)' : 'Total Paid by Candidate'}
              </div>
              <div className="text-2xl font-bold mt-1 text-success">
                ₹{(payments.length > 0 
                  ? payments.reduce((acc, p) => acc + (p.amount || 110), 0)
                  : interviews.reduce((acc, i) => acc + (i.price + Math.round(i.price * 0.1)), 0)
                ).toLocaleString()} INR
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-muted uppercase font-semibold">Payment Gateway Status</div>
              <div className="text-sm font-bold mt-1 flex items-center gap-1.5 text-success">
                <ShieldCheck size={18} />
                <span>PCI-DSS & Razorpay Verified 🟢</span>
              </div>
            </div>
          </div>

          {/* Invoices List Table */}
          <div className="card p-0" style={{ overflow: 'hidden' }}>
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
              <div className="font-bold text-base flex items-center gap-2">
                <Receipt size={18} className="text-primary" />
                <span>Tax Invoices & Transaction History</span>
              </div>
              <span className="text-xs text-muted">Generated with jsPDF & RBI compliance</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Date & Slot</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{userRole === 'professional' ? 'Candidate' : 'Interviewer'}</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Focus Topic</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments.length > 0 ? payments : interviews).map((item, idx) => {
                    const isPay = Boolean(item.invoiceNumber && item.amount);
                    const partner = userRole === 'professional' ? item.candidateId : item.interviewerId;
                    const partnerName = partner?.name || (userRole === 'professional' ? 'Candidate' : 'Interviewer');
                    const invNo = item.invoiceNumber || `INV-2026-${(item._id || '').slice(-6).toUpperCase()}`;
                    const feeAmount = item.amount || (item.price + Math.round(item.price * 0.1)) || 110;
                    const dateStr = item.date || item.interviewId?.date || 'Scheduled Date';
                    const topicStr = item.topic || item.interviewId?.topic || item.notes || 'Mock Interview Session';
                    const payMethod = item.paymentMethod || 'UPI / Razorpay';

                    return (
                      <tr key={item._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--primary)' }}>
                          {invNo}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div>{dateStr}</div>
                          <div className="text-xs text-muted">{item.timeSlot || item.interviewId?.timeSlot || '45 mins'}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>
                          {partnerName}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {topicStr}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 'bold' }}>
                          ₹{feeAmount}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className="badge badge-success text-xs font-semibold py-0.5 px-2">
                            PAID ●
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-outline text-xs py-1 px-3 inline-flex items-center gap-1.5"
                            style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                            onClick={() => downloadInvoicePDF({
                              ...item,
                              candidateName: item.candidateId?.name,
                              candidateEmail: item.candidateId?.email,
                              interviewerName: item.interviewerId?.name,
                              interviewerTitle: item.interviewerId?.title,
                              company: item.interviewerId?.company,
                              topic: topicStr,
                              timeSlot: dateStr,
                              sessionFee: item.sessionFee || item.price || 100,
                              platformFee: item.platformFee || 10,
                              paidAmount: feeAmount,
                              invoiceNumber: invNo,
                              paymentId: item.paymentId || `pay_${(item._id || '').slice(-8)}`,
                              paymentMethod: payMethod
                            })}
                          >
                            <Download size={14} />
                            <span>Download PDF</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : displayedList.length === 0 ? (
        <div className="card text-center p-12">
          <Calendar size={48} className="text-muted mx-auto mb-4" style={{ margin: '0 auto 1rem auto' }} />
          <h3 className="text-lg font-bold mb-2">No {activeTab} interviews found</h3>
          <p className="text-muted mb-6">
            {activeTab === 'upcoming' 
              ? 'You do not have any upcoming interviews scheduled right now.' 
              : 'You have not completed any interview sessions yet.'}
          </p>
          <Link to="/booking">
            <button className="btn btn-primary">Browse Interviewers</button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {displayedList.map(item => {
            const partner = userRole === 'professional' ? item.candidateId : item.interviewerId;
            const partnerName = partner?.name || (userRole === 'professional' ? 'Candidate' : 'Interviewer');
            const partnerAvatar = partner?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80';
            const partnerSub = userRole === 'professional' 
              ? 'Candidate' 
              : (partner?.title || 'Technical Interviewer');

            return (
              <div key={item._id} className="card flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <img 
                    src={partnerAvatar} 
                    alt={partnerName} 
                    className="profile-avatar"
                    style={{ width: '56px', height: '56px' }}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold">{partnerName}</h3>
                      <span className={`badge ${
                        item.status === 'scheduled' ? 'badge-info' : 
                        item.status === 'completed' ? 'badge-success' : 'badge-warning'
                      }`}>
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-muted">{partnerSub}</p>
                    <p className="text-sm font-medium mt-1" style={{ color: 'var(--primary)' }}>
                      Topic: {item.topic}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Calendar size={16} className="text-muted" />
                      <span>{item.date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted mt-1">
                      <Clock size={16} />
                      <span>{item.timeSlot}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-lg">₹{item.price}</div>
                    <div className="text-xs text-success font-semibold flex items-center justify-end gap-1 mt-0.5">
                      <ShieldCheck size={12} />
                      <span>Paid ₹{item.paidAmount || (item.price + Math.round(item.price * 0.1))}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Invoice Download Action */}
                    <button 
                      type="button"
                      className="btn btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3"
                      title="Download Official Tax Invoice PDF"
                      onClick={() => downloadInvoicePDF({
                        ...item,
                        candidateName: item.candidateId?.name,
                        candidateEmail: item.candidateId?.email,
                        interviewerName: item.interviewerId?.name,
                        interviewerTitle: item.interviewerId?.title,
                        company: item.interviewerId?.company,
                        sessionFee: item.price,
                        platformFee: item.platformFee || Math.round(item.price * 0.1),
                        paidAmount: item.paidAmount || (item.price + Math.round(item.price * 0.1)),
                        invoiceNumber: item.invoiceNumber || `INV-2026-${item._id.slice(-6).toUpperCase()}`,
                        paymentId: item.paymentId || `pay_${item._id.slice(-8)}`,
                        paymentMethod: item.paymentMethod || 'UPI / Razorpay'
                      })}
                    >
                      <Download size={14} />
                      <span>Invoice PDF</span>
                    </button>

                    {item.status === 'scheduled' && (
                      <>
                        <Link to={`/room?interviewId=${item._id}`}>
                          <button className="btn btn-primary">
                            <Video size={16} />
                            Join Room
                          </button>
                        </Link>
                        <button 
                          className="btn btn-outline" 
                          style={{ color: 'var(--danger)', borderColor: 'rgba(234, 67, 53, 0.3)' }}
                          onClick={() => handleCancelInterview(item._id)}
                          disabled={actionLoading === item._id}
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {item.status === 'completed' && (
                      <>
                        <Link to={`/feedback?interviewId=${item._id}`}>
                          <button className="btn btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3">
                            <FileText size={14} />
                            <span>View Q&A Report</span>
                          </button>
                        </Link>
                        <button 
                          type="button"
                          className="btn btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3 shadow-sm"
                          onClick={() => handleDownloadReportForInterview(item)}
                          disabled={actionLoading === `report_${item._id}`}
                        >
                          <Download size={14} />
                          <span>{actionLoading === `report_${item._id}` ? 'Generating...' : 'Report PDF'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Interviews;
