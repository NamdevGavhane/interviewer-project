import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, Video, FileText, CheckCircle2, AlertCircle, XCircle, ChevronRight, User, Download, ShieldCheck, CreditCard, Receipt, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../utils/apiClient';
import { downloadInvoicePDF } from '../utils/invoiceGenerator';
import { downloadInterviewReportPDF } from '../utils/interviewReportGenerator';

const Interviews = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'past' | 'invoices'
  const [actionLoading, setActionLoading] = useState(null);
  const navigate = useNavigate();

  const userRole = user?.role || 'candidate';

  const fetchInterviews = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [resInterviews, resPayments] = await Promise.all([
        apiClient.get('/api/interviews'),
        apiClient.get('/api/payment/history').catch(() => ({ data: [] }))
      ]);

      setInterviews(resInterviews.data || []);
      setPayments(resPayments.data || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchInterviews();
  }, [user, isAuthenticated, authLoading]);

  const handleCancelInterview = async (interviewId) => {
    navigate(`/booking/cancel/${interviewId}`);
  };

  const handleDownloadReportForInterview = async (interviewItem) => {
    try {
      setActionLoading(`report_${interviewItem._id}`);
      const res = await apiClient.get(`/api/feedbacks/interview/${interviewItem._id}`);
      if (res.data && (res.data.overallScore !== undefined && res.data.overallScore !== null)) {
        downloadInterviewReportPDF(res.data);
      } else {
        alert('Feedback report has not been submitted yet by the interviewer for this session.');
      }
    } catch (err) {
      if (err.response?.status === 404) {
        alert('Evaluation feedback has not been submitted yet for this session. A report can only be generated after the evaluator submits their score and review.');
      } else {
        alert(err.response?.data?.message || err.message || 'Error downloading report');
      }
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

  if (authLoading) {
    return (
      <div className="card text-center p-12 text-muted flex items-center justify-center gap-2">
        <Loader2 size={20} className="animate-spin text-primary" />
        <span>Authenticating...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">My Interview Sessions</h2>
          <p className="text-muted mt-1">Manage scheduled sessions, live rooms, and evaluation reports.</p>
        </div>
        {userRole === 'candidate' && (
          <Link to="/booking">
            <button className="btn btn-primary">
              + Book New Interview
            </button>
          </Link>
        )}
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
          Billing & Invoices ({payments.length})
        </button>
      </div>

      {loading ? (
        <div className="card text-center p-12 text-muted flex items-center justify-center gap-2">
          <Loader2 size={20} className="animate-spin text-primary" />
          <span>Loading interview sessions from database...</span>
        </div>
      ) : error ? (
        <div className="card p-6 text-danger">
          Error: {error}
        </div>
      ) : activeTab === 'invoices' ? (
        /* BILLING & INVOICES TAB */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="text-xs text-muted uppercase font-semibold">Total Verified Invoices</div>
              <div className="text-2xl font-bold mt-1" style={{ color: 'var(--primary)' }}>
                {payments.length}
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-muted uppercase font-semibold">
                {userRole === 'professional' ? 'Total Earnings (Gross)' : 'Total Paid by Candidate'}
              </div>
              <div className="text-2xl font-bold mt-1 text-success">
                ₹{payments.reduce((acc, p) => acc + (p.amount || 0), 0).toLocaleString()} INR
              </div>
            </div>
            <div className="card">
              <div className="text-xs text-muted uppercase font-semibold">Payment Gateway Status</div>
              <div className="text-sm font-bold mt-1 flex items-center gap-1.5 text-success">
                <ShieldCheck size={18} />
                <span>Razorpay 256-Bit SSL 🟢</span>
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
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Date & Slot</th>
                    <th style={{ padding: '0.75rem 1rem' }}>{userRole === 'professional' ? 'Candidate' : 'Interviewer'}</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Method</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                        No billing or invoice records found.
                      </td>
                    </tr>
                  ) : (
                    payments.map((item, idx) => {
                      const partner = userRole === 'professional' ? item.candidateId : item.interviewerId;
                      const partnerName = partner?.name || (userRole === 'professional' ? 'Candidate' : 'Interviewer');
                      const invNo = item.invoiceNumber;
                      const feeAmount = item.amount || 0;
                      const dateStr = item.interviewId?.date || new Date(item.createdAt).toLocaleDateString('en-GB');

                      return (
                        <tr key={item._id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--primary)' }}>
                            {invNo}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div>{dateStr}</div>
                            <div className="text-xs text-muted">{item.interviewId?.timeSlot || 'Session'}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>
                            {partnerName}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 'bold' }}>
                            ₹{feeAmount}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className="badge badge-secondary text-xs uppercase">
                              {item.paymentMethod || 'Razorpay'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className="badge badge-success text-xs font-semibold py-0.5 px-2">
                              {item.status?.toUpperCase() || 'CAPTURED'}
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
                                sessionFee: item.sessionFee || item.amount || 0,
                                platformFee: item.platformFee || 0,
                                gstAmount: item.gstAmount || 0,
                                paidAmount: item.amount,
                                invoiceNumber: invNo,
                                paymentId: item.paymentId,
                                paymentMethod: item.paymentMethod || 'Razorpay'
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
      ) : displayedList.length === 0 ? (
        <div className="card text-center p-12">
          <Calendar size={48} className="text-muted mx-auto mb-4" style={{ margin: '0 auto 1rem auto' }} />
          <h3 className="text-lg font-bold mb-2">No {activeTab} interviews found</h3>
          <p className="text-muted mb-6">
            {activeTab === 'upcoming' 
              ? 'You do not have any upcoming interviews scheduled right now.' 
              : 'You have not completed any interview sessions yet.'}
          </p>
          {userRole === 'candidate' && (
            <Link to="/booking">
              <button className="btn btn-primary">Browse Interviewers</button>
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {displayedList.map(item => {
            const partner = userRole === 'professional' ? item.candidateId : item.interviewerId;
            const partnerName = partner?.name || (userRole === 'professional' ? 'Candidate' : 'Interviewer');
            const partnerSub = userRole === 'professional' 
              ? 'Candidate' 
              : (partner?.title || 'Technical Interviewer');

            return (
              <div key={item._id} className="card flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div 
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '12px',
                      backgroundColor: '#e2e8f0',
                      color: '#334155',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem'
                    }}
                  >
                    {partnerName ? partnerName.slice(0, 2).toUpperCase() : 'IN'}
                  </div>
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
                      <span>Paid ₹{item.paidAmount || item.price}</span>
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
                        sessionFee: item.price || 0,
                        platformFee: item.platformFee || 0,
                        paidAmount: item.paidAmount || item.price || 0,
                        invoiceNumber: item.invoiceNumber || 'INV-OFFICIAL',
                        paymentId: item.paymentId || 'N/A',
                        paymentMethod: item.paymentMethod || 'Razorpay'
                      })}
                    >
                      <Download size={14} />
                      <span>Invoice PDF</span>
                    </button>

                    {item.status === 'scheduled' && (
                      <>
                        <Link to={`/room?interviewId=${item._id}&role=${userRole === 'professional' ? 'interviewer' : 'candidate'}`}>
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
                          <span>{actionLoading === `report_${item._id}` ? 'Checking...' : 'Report PDF'}</span>
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
