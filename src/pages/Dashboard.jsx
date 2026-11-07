import { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  DollarSign,
  Clock,
  Video,
  ArrowRight,
  Bot,
  Receipt,
  ShieldCheck,
  Download,
  Building2,
  Briefcase
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadInterviewReportPDF } from '../utils/interviewReportGenerator';
import apiClient from '../utils/apiClient';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const userId = authUser?._id || localStorage.getItem('userId');

  const [userData, setUserData] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState(null);

  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [nowTick, setNowTick] = useState(0);

  // Periodic tick every 30s to update join window status dynamically
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const [refreshCounter, setRefreshCounter] = useState(0);

  const reloadSummary = useCallback(() => {
    setRefreshCounter(prev => prev + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (authUser?.role === 'admin') {
      navigate('/admin', { replace: true });
      return;
    }
    if (!userId) return;

    const fetchData = async () => {
      try {
        const user = await apiClient.get(`/api/users/${userId}`);
        if (!isMounted) return;
        setUserData(user);

        if (user.role === 'professional') {
          setSummaryLoading(true);
          try {
            const res = await apiClient.get('/api/professional/summary');
            if (!isMounted) return;
            setSummaryData(res?.data || res);
            setSummaryError(null);
          } catch (sumErr) {
            if (isMounted) setSummaryError(sumErr.message || 'Failed to load summary');
          } finally {
            if (isMounted) setSummaryLoading(false);
          }
        } else {
          const [interviewData, profData, feedData] = await Promise.all([
            apiClient.get(`/api/interviews?userId=${userId}&role=${user.role}`),
            apiClient.get('/api/users?role=professional'),
            apiClient.get(`/api/feedbacks/candidate/${userId}`)
          ]);
          if (!isMounted) return;
          setInterviews(Array.isArray(interviewData) ? interviewData : (interviewData?.data || []));
          setInterviewers(Array.isArray(profData) ? profData : (profData?.data || []));
          setFeedbacks(Array.isArray(feedData) ? feedData : (feedData?.data || []));
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [userId, authUser?.role, navigate, refreshCounter]);

  if (loading) {
    return (
      <div className="card text-center p-12 text-muted">
        <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin mx-auto mb-3" />
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="card p-6 text-danger">
        <p className="font-bold">Error loading dashboard</p>
        <p className="text-sm mt-1">{error || 'User profile not found'}</p>
        <button onClick={loadData} className="btn btn-outline text-xs mt-3">Retry</button>
      </div>
    );
  }

  const isProfessional = userData.role === 'professional';
  const isCandidate = userData.role === 'candidate';
  const isAdmin = userData.role === 'admin';

  // Helper to format local time
  const formatLocalTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
      const dateFormatted = d.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const timeFormatted = d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit'
      });
      return `${dateFormatted} • ${timeFormatted} (${userTz})`;
    } catch {
      return isoString;
    }
  };

  // Helper to check live join window status
  const getJoinStatus = (nextInterview, joinConfig) => {
    if (!nextInterview || !nextInterview.startTime) {
      return { canJoin: false, label: 'Not Scheduled', status: 'none' };
    }
    if (!nowTick) {
      return {
        canJoin: Boolean(nextInterview.isJoinable),
        label: nextInterview.isJoinable ? 'Join Call' : 'Join Call (Pending)',
        status: nextInterview.isJoinable ? 'joinable' : 'upcoming'
      };
    }
    const currentMs = nowTick;
    const start = new Date(nextInterview.startTime).getTime();
    const end = nextInterview.endTime
      ? new Date(nextInterview.endTime).getTime()
      : start + (nextInterview.durationMinutes || 45) * 60000;

    const opensBeforeMs = (joinConfig?.joinOpensMinutesBefore ?? 10) * 60000;
    const graceAfterMs = (joinConfig?.joinGraceMinutesAfter ?? 15) * 60000;

    if (currentMs < start - opensBeforeMs) {
      const minUntilOpen = Math.ceil((start - opensBeforeMs - currentMs) / 60000);
      return {
        canJoin: false,
        label: minUntilOpen > 60
          ? `Opens ${joinConfig?.joinOpensMinutesBefore ?? 10}m before`
          : `Opens in ${minUntilOpen}m`,
        status: 'upcoming'
      };
    }
    if (currentMs > end + graceAfterMs) {
      return {
        canJoin: false,
        label: 'Session Concluded',
        status: 'ended'
      };
    }
    return {
      canJoin: true,
      label: 'Join Call',
      status: 'joinable'
    };
  };

  // Candidate interview helpers
  const uniqueScheduled = [];
  const seenScheduledSlots = new Set();
  for (const session of (interviews || []).filter(i => i && i.status === 'scheduled')) {
    const interviewerKey = session.interviewerId?._id || session.interviewerId || 'unknown';
    const key = `${interviewerKey}_${session.date || ''}_${session.timeSlot || ''}`;
    if (!seenScheduledSlots.has(key)) {
      seenScheduledSlots.add(key);
      uniqueScheduled.push(session);
    }
  }
  const upcomingInterviews = uniqueScheduled;
  const completedInterviews = (interviews || []).filter(i => i && i.status === 'completed');

  const avgFeedbackScore = (feedbacks || []).length > 0
    ? `${Math.round(feedbacks.reduce((acc, f) => acc + (f?.overallScore || 0), 0) / feedbacks.length)}/100`
    : 'No evaluations yet';

  // Professional metrics derived from summaryData
  const bookingWindowDays = summaryData?.bookingWindowDays ?? 30;
  const openSlotsCount = summaryData?.openSlotsCount ?? 0;
  const upcomingInterviewsCount = summaryData?.upcomingInterviewsCount ?? 0;
  const completedThisMonthCount = summaryData?.completedThisMonthCount ?? 0;
  const earningsAvailable = summaryData?.earningsAvailable ?? 0;
  const nextInterview = summaryData?.nextInterview ?? null;
  const joinConfig = summaryData?.joinConfig ?? null;
  const joinStatus = getJoinStatus(nextInterview, joinConfig);

  return (
    <div>
      {/* Welcome Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Hello, {userData.name} 👋</h2>
          <p className="text-muted mt-1">
            {isProfessional
              ? 'Manage your available slots, scheduled mock interviews, and earnings.'
              : isAdmin
              ? 'Oversee users, verify professionals, and monitor mock interview operations.'
              : 'Prepare, book live mock interviews, and review feedback reports to level up.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge badge-info text-sm py-1 px-3">
            {isProfessional ? '👨‍💼 Professional Interviewer' : isAdmin ? '🛡️ Administrator' : '🎓 Candidate'}
          </span>
          {isCandidate && (
            <div className="flex items-center gap-2">
              <Link to="/ai-interview">
                <button className="btn btn-outline flex items-center gap-1.5" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>
                  <Bot size={16} />
                  <span>AI Mock Interview</span>
                </button>
              </Link>
              <Link to="/booking">
                <button className="btn btn-primary">+ Book Interview</button>
              </Link>
            </div>
          )}
          {isProfessional && (
            <Link to="/professional/availability">
              <button className="btn btn-primary flex items-center gap-1.5">
                <Clock size={16} />
                <span>Manage Availability</span>
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* ================= PROFESSIONAL DASHBOARD VIEW (TASK S4) ================= */}
      {isProfessional && (
        <>
          {/* Top Row of 4 Tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            {/* Tile 1: Open slots (next N days) */}
            <div className="card flex items-center gap-4">
              <div style={{ backgroundColor: '#eff6ff', padding: '1rem', borderRadius: '50%', color: 'var(--primary)' }}>
                <Clock size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted font-medium truncate">
                  Open slots (next {bookingWindowDays} days)
                </p>
                {summaryLoading ? (
                  <div className="h-7 w-12 bg-slate-200 dark:bg-slate-700 animate-pulse rounded mt-1" />
                ) : summaryError ? (
                  <span className="text-xs text-rose-500 font-medium">Error</span>
                ) : (
                  <h3 className="text-2xl font-bold">{openSlotsCount}</h3>
                )}
              </div>
            </div>

            {/* Tile 2: Upcoming interviews */}
            <div className="card flex items-center gap-4">
              <div style={{ backgroundColor: '#f0fdf4', padding: '1rem', borderRadius: '50%', color: 'var(--success)' }}>
                <CalendarIcon size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted font-medium truncate">Upcoming interviews</p>
                {summaryLoading ? (
                  <div className="h-7 w-12 bg-slate-200 dark:bg-slate-700 animate-pulse rounded mt-1" />
                ) : summaryError ? (
                  <span className="text-xs text-rose-500 font-medium">Error</span>
                ) : (
                  <h3 className="text-2xl font-bold">{upcomingInterviewsCount}</h3>
                )}
              </div>
            </div>

            {/* Tile 3: Completed this month */}
            <div className="card flex items-center gap-4">
              <div style={{ backgroundColor: '#f5f3ff', padding: '1rem', borderRadius: '50%', color: '#8b5cf6' }}>
                <CheckCircle2 size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted font-medium truncate">Completed this month</p>
                {summaryLoading ? (
                  <div className="h-7 w-12 bg-slate-200 dark:bg-slate-700 animate-pulse rounded mt-1" />
                ) : summaryError ? (
                  <span className="text-xs text-rose-500 font-medium">Error</span>
                ) : (
                  <h3 className="text-2xl font-bold">{completedThisMonthCount}</h3>
                )}
              </div>
            </div>

            {/* Tile 4: Earnings available */}
            <div className="card flex items-center gap-4">
              <div style={{ backgroundColor: '#ecfdf5', padding: '1rem', borderRadius: '50%', color: '#059669' }}>
                <DollarSign size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted font-medium truncate">Earnings available</p>
                {summaryLoading ? (
                  <div className="h-7 w-16 bg-slate-200 dark:bg-slate-700 animate-pulse rounded mt-1" />
                ) : summaryError ? (
                  <span className="text-xs text-rose-500 font-medium">Error</span>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-bold">₹{earningsAvailable.toLocaleString()}</h3>
                    <Link to="/professional/earnings" className="text-xs text-primary font-semibold hover:underline">
                      Payout →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Prominent Card: Zero Open Slots Notice */}
          {!summaryLoading && openSlotsCount === 0 && (
            <div
              className="card p-6 border-2 mb-6"
              style={{
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.05)',
                borderRadius: '16px'
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    style={{
                      backgroundColor: '#e0e7ff',
                      color: '#4f46e5',
                      padding: '0.85rem',
                      borderRadius: '12px'
                    }}
                    className="flex-shrink-0"
                  >
                    <Clock size={28} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-foreground">
                      Add your free time so candidates can book you
                    </h4>
                    <p className="text-sm text-muted mt-1 max-w-xl">
                      You currently have no open slots available for booking. Candidates can only discover and schedule mock interviews with you once you add your available times.
                    </p>
                  </div>
                </div>
                <Link to="/professional/availability" className="flex-shrink-0">
                  <button className="btn btn-primary flex items-center gap-2 px-5 py-2.5 font-semibold shadow-sm hover:shadow transition-all">
                    <Clock size={16} />
                    <span>Add Availability</span>
                    <ArrowRight size={16} />
                  </button>
                </Link>
              </div>
            </div>
          )}

          {/* Card: Next Interview */}
          <div className="card mb-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Video size={20} className="text-primary" />
                <h3 className="font-bold text-lg">Next Interview</h3>
              </div>
              <Link to="/interviews" className="text-sm font-semibold flex items-center gap-1 text-primary hover:underline">
                <span>View all interviews</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            {summaryLoading ? (
              <div className="py-12 text-center text-muted">
                <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin mx-auto mb-3" />
                <p className="text-sm">Loading next interview details...</p>
              </div>
            ) : summaryError ? (
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm flex items-center justify-between">
                <span>Failed to load next interview: {summaryError}</span>
                <button onClick={reloadSummary} className="btn btn-outline text-xs px-3 py-1">Retry</button>
              </div>
            ) : !nextInterview ? (
              <div className="text-center py-10 px-4">
                <div style={{ backgroundColor: '#f1f5f9', width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                  <CalendarIcon size={28} className="opacity-60" />
                </div>
                <h4 className="font-bold text-base text-foreground">No upcoming interviews scheduled</h4>
                <p className="text-sm text-muted mt-1 max-w-md mx-auto">
                  When candidates book your open slots, your next confirmed interview session and live call access will appear right here.
                </p>
                {openSlotsCount === 0 && (
                  <Link to="/professional/availability">
                    <button className="btn btn-outline text-xs mt-4">Manage Availability</button>
                  </Link>
                )}
              </div>
            ) : (
              <div
                className="p-4 sm:p-5 border rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-hover, rgba(255,255,255,0.02))' }}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <Avatar
                    name={nextInterview.candidateName}
                    avatar={nextInterview.candidateAvatar}
                    size={52}
                    style={{ border: '2px solid var(--border)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-foreground truncate">
                        {nextInterview.candidateName}
                      </span>
                      <span className="badge badge-info text-xs py-0.5 px-2">
                        Candidate
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-primary mt-1 truncate">
                      {nextInterview.topic}
                    </div>

                    <div className="text-xs text-muted flex flex-wrap items-center gap-2 mt-2">
                      <span className="flex items-center gap-1">
                        📅 {formatLocalTime(nextInterview.startTime)}
                      </span>
                      <span className="badge badge-success text-[10px] py-0 px-2 font-medium">
                        Confirmed Session
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0" style={{ borderColor: 'var(--border)' }}>
                  {joinStatus.canJoin ? (
                    <Link to={`/room?interviewId=${nextInterview.id}`}>
                      <button className="btn btn-primary flex items-center gap-2 px-5 py-2.5 font-bold shadow-md hover:shadow-lg transition-all animate-pulse">
                        <Video size={18} />
                        <span>Join Call</span>
                      </button>
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="btn btn-primary opacity-50 cursor-not-allowed flex items-center gap-2 px-4 py-2 text-xs font-semibold"
                      title="Join button activates inside the join window"
                    >
                      <Video size={16} />
                      <span>{joinStatus.label}</span>
                    </button>
                  )}
                  <span className="text-[11px] text-muted">
                    Room: <span className="font-mono">{nextInterview.meetingRoomId?.slice(0, 8)}...</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ================= CANDIDATE DASHBOARD VIEW ================= */}
      {isCandidate && (
        <>
          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div className="card flex items-center gap-4">
              <div style={{ backgroundColor: '#eff6ff', padding: '1rem', borderRadius: '50%', color: 'var(--primary)' }}>
                <CalendarIcon size={24} />
              </div>
              <div>
                <p className="text-sm text-muted font-medium">Upcoming Interviews</p>
                <h3 className="text-2xl font-bold">{upcomingInterviews.length}</h3>
              </div>
            </div>

            <div className="card flex items-center gap-4">
              <div style={{ backgroundColor: '#f0fdf4', padding: '1rem', borderRadius: '50%', color: 'var(--success)' }}>
                <CheckCircle2 size={24} />
              </div>
              <div>
                <p className="text-sm text-muted font-medium">Completed Sessions</p>
                <h3 className="text-2xl font-bold">{completedInterviews.length}</h3>
              </div>
            </div>

            <div className="card flex items-center gap-4">
              <div style={{ backgroundColor: '#f5f3ff', padding: '1rem', borderRadius: '50%', color: '#8b5cf6' }}>
                <DollarSign size={24} />
              </div>
              <div>
                <p className="text-sm text-muted font-medium">Average Score</p>
                <h3 className="text-2xl font-bold">{avgFeedbackScore}</h3>
              </div>
            </div>

            <div className="card flex items-center gap-4">
              <div style={{ backgroundColor: '#ecfdf5', padding: '1rem', borderRadius: '50%', color: '#059669' }}>
                <Receipt size={24} />
              </div>
              <div>
                <p className="text-sm text-muted font-medium">Tax Invoices</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold">{interviews.length} Paid</h3>
                </div>
                <Link to="/interviews" className="text-xs text-primary font-semibold hover:underline">
                  View Receipts →
                </Link>
              </div>
            </div>
          </div>

          {/* Main Content Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem' }}>
            {/* Left Column: Scheduled Sessions */}
            <div className="flex flex-col gap-6">
              <div className="card">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg">Next Scheduled Sessions</h3>
                  <Link to="/interviews" className="text-sm font-semibold flex items-center gap-1">
                    View all ({interviews.length}) <ArrowRight size={14} />
                  </Link>
                </div>

                {upcomingInterviews.length === 0 ? (
                  <div className="text-center py-8 text-muted">
                    <CalendarIcon size={36} className="mx-auto mb-2 opacity-40" style={{ margin: '0 auto 0.5rem auto' }} />
                    <p>No upcoming interviews scheduled.</p>
                    <Link to="/booking">
                      <button className="btn btn-primary mt-4">Schedule Your First Mock Interview</button>
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {upcomingInterviews.map(session => {
                      const partner = session.interviewerId;
                      const partnerName = partner?.name || 'Interviewer';

                      return (
                        <div key={session._id} className="p-4 border rounded-xl flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={partnerName}
                              avatar={partner?.avatar}
                              size={48}
                            />
                            <div>
                              <div className="font-bold text-sm">{partnerName}</div>
                              <div className="text-xs text-muted font-medium" style={{ color: 'var(--primary)' }}>
                                {session.topic}
                              </div>
                              <div className="text-xs text-muted flex items-center gap-2 mt-1">
                                <span>📅 {session.date}</span>
                                <span>⏰ {session.timeSlot}</span>
                                <span className="badge badge-success text-[10px] py-0 px-1.5 flex items-center gap-1 font-semibold">
                                  <ShieldCheck size={10} /> Paid ₹{session.paidAmount || (session.price + 10)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <Link to={`/room?interviewId=${session._id}`}>
                            <button className="btn btn-primary flex items-center gap-1">
                              <Video size={16} />
                              Join Call
                            </button>
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* If Candidate: Show Recent Feedback */}
              {feedbacks.length > 0 && (
                <div className="card">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Latest Interview Feedback</h3>
                    <Link to="/feedback" className="text-sm font-semibold">
                      Full Report →
                    </Link>
                  </div>
                  <div className="p-4 rounded-xl border bg-gray-50 flex items-center justify-between" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
                    <div>
                      <div className="font-bold">Score: {feedbacks[0].overallScore}/100</div>
                      <div className="text-xs text-muted mt-1">Evaluated by: {feedbacks[0].interviewerId?.name || 'Senior Interviewer'}</div>
                      <div className="text-xs text-muted mt-1">
                        Strengths: {feedbacks[0].strengths?.[0] || 'Solid technical foundation'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link to={`/feedback?interviewId=${feedbacks[0].interviewId?._id || feedbacks[0].interviewId}`}>
                        <button className="btn btn-outline text-xs">View Q&A Report</button>
                      </Link>
                      <button
                        type="button"
                        className="btn btn-primary text-xs flex items-center gap-1 py-1.5 px-3"
                        onClick={() => downloadInterviewReportPDF(feedbacks[0])}
                      >
                        <Download size={13} />
                        <span>PDF</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Available Interviewers */}
            <div className="flex flex-col gap-6">
              <div className="card">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-bold text-lg">Available Interviewers</h3>
                  <span className="badge badge-info text-xs font-semibold uppercase tracking-wider">Verified Mentors</span>
                </div>
                <p className="text-sm text-muted mb-4">Book a 1-on-1 mock interview with verified industry seniors.</p>

                <div className="flex flex-col gap-3.5">
                  {interviewers.map(prof => (
                    <div
                      key={prof._id}
                      className="p-3.5 border rounded-xl flex items-center justify-between gap-3 transition-all hover:border-primary/40 hover:shadow-sm"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-hover, rgba(255,255,255,0.02))' }}
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="relative flex-shrink-0 mt-0.5">
                          <Avatar
                            name={prof.name}
                            avatar={prof.avatar}
                            size={48}
                            style={{ border: '2px solid var(--border)' }}
                          />
                          <span
                            className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2"
                            style={{ borderColor: 'var(--card-bg, #fff)' }}
                            title="Online & Available"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm text-foreground flex items-center gap-1.5 truncate">
                            <span>{prof.name}</span>
                            <CheckCircle2 size={13} className="text-primary flex-shrink-0" title="Verified Expert" />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1 truncate">
                            <Building2 size={13} className="text-primary flex-shrink-0" />
                            <span className="truncate">
                              {prof.company || 'Tech Enterprise'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5 truncate">
                            <Briefcase size={12} className="text-muted flex-shrink-0" />
                            <span className="truncate">
                              {prof.domain || prof.title || 'Technical Specialist'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              1-on-1 Session
                            </span>
                            <span className="text-[11px] text-amber-500 font-semibold flex items-center gap-0.5">
                              ★ {prof.rating || 4.98}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Link to={`/booking?interviewerId=${prof._id}`} className="flex-shrink-0">
                        <button
                          className="btn btn-primary flex items-center gap-1.5 shadow-sm hover:shadow transition-all font-semibold"
                          style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                        >
                          <CalendarIcon size={14} />
                          <span>Book</span>
                        </button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
