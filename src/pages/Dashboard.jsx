import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, CheckCircle2, DollarSign, Clock, Video, Plus, Trash2, ArrowRight, Bot, Receipt, ShieldCheck, Download, Building2, Briefcase } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadInterviewReportPDF } from '../utils/interviewReportGenerator';
import { API_BASE_URL } from '../config/api';

const Dashboard = () => {
  const [userData, setUserData] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Editable fields for Professional
  const [priceInput, setPriceInput] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceSavedToast, setPriceSavedToast] = useState(false);

  const [slotsList, setSlotsList] = useState([]);
  const [newSlotInput, setNewSlotInput] = useState('');
  const [savingSlots, setSavingSlots] = useState(false);
  const [slotsSavedToast, setSlotsSavedToast] = useState(false);

  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');

  const loadData = async () => {
    if (!userId) {
      navigate('/login');
      return;
    }

    try {
      setLoading(true);
      // Fetch user profile
      const userRes = await fetch(`${API_BASE_URL}/api/users/${userId}`);
      if (!userRes.ok) throw new Error('Failed to fetch user data');
      const user = await userRes.json();
      setUserData(user);
      setPriceInput(user.hourlyRate || 100);
      setSlotsList(user.availabilitySlots || ['10:00 AM - 10:45 AM', '02:00 PM - 02:45 PM']);

      // Fetch user's interviews
      const interviewsRes = await fetch(`${API_BASE_URL}/api/interviews?userId=${userId}&role=${user.role}`);
      if (interviewsRes.ok) {
        const interviewData = await interviewsRes.json();
        setInterviews(interviewData);
      }

      // If candidate, fetch interviewers & feedback
      if (user.role === 'candidate') {
        const profRes = await fetch(`${API_BASE_URL}/api/users?role=professional`);
        if (profRes.ok) {
          const profData = await profRes.json();
          setInterviewers(profData);
        }

        const feedRes = await fetch(`${API_BASE_URL}/api/feedbacks/candidate/${userId}`);
        if (feedRes.ok) {
          const feedData = await feedRes.json();
          setFeedbacks(feedData);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  // Handle saving new price for professional
  const handleUpdatePrice = async () => {
    if (!priceInput || isNaN(priceInput)) return;
    try {
      setSavingPrice(true);
      const res = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourlyRate: Number(priceInput) })
      });
      if (res.ok) {
        const updated = await res.json();
        setUserData(updated);
        setPriceSavedToast(true);
        setTimeout(() => setPriceSavedToast(false), 3000);
      }
    } catch (err) {
      alert('Error updating price: ' + err.message);
    } finally {
      setSavingPrice(false);
    }
  };

  // Handle saving availability slots
  const handleAddSlot = () => {
    if (!newSlotInput.trim()) return;
    setSlotsList(prev => [...prev, newSlotInput.trim()]);
    setNewSlotInput('');
  };

  const handleRemoveSlot = (indexToRemove) => {
    setSlotsList(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveSlots = async () => {
    try {
      setSavingSlots(true);
      const res = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availabilitySlots: slotsList })
      });
      if (res.ok) {
        const updated = await res.json();
        setUserData(updated);
        setSlotsSavedToast(true);
        setTimeout(() => setSlotsSavedToast(false), 3000);
      }
    } catch (err) {
      alert('Error saving slots: ' + err.message);
    } finally {
      setSavingSlots(false);
    }
  };

  if (loading) {
    return <div className="card text-center p-12 text-muted">Loading your dynamic dashboard...</div>;
  }

  if (error || !userData) {
    return <div className="card p-6 text-danger">Error: {error || 'User not found'}</div>;
  }

  // Deduplicate scheduled interviews so only 1 distinct session appears per slot
  const uniqueScheduled = [];
  const seenScheduledSlots = new Set();
  for (const session of interviews.filter(i => i.status === 'scheduled')) {
    const key = `${session.interviewerId?._id || session.interviewerId}_${session.date}_${session.timeSlot}`;
    if (!seenScheduledSlots.has(key)) {
      seenScheduledSlots.add(key);
      uniqueScheduled.push(session);
    }
  }
  const upcomingInterviews = uniqueScheduled;
  const completedInterviews = interviews.filter(i => i.status === 'completed');

  // Compute earnings dynamically from actual completed sessions
  const dynamicEarnings = completedInterviews.reduce((acc, curr) => acc + (curr.price || userData.hourlyRate || 0), 0);

  const avgFeedbackScore = feedbacks.length > 0 
    ? Math.round(feedbacks.reduce((acc, f) => acc + f.overallScore, 0) / feedbacks.length)
    : 82;

  const isProfessional = userData.role === 'professional';

  return (
    <div>
      {/* Welcome Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Hello, {userData.name} 👋</h2>
          <p className="text-muted mt-1">
            {isProfessional 
              ? 'Manage your scheduled interview sessions, rates, and candidate evaluations.' 
              : 'Prepare, book live mock interviews, and review feedback reports to level up.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge badge-info text-sm py-1 px-3">
            {isProfessional ? '👨‍💼 Professional Interviewer' : '🎓 Candidate'}
          </span>
          {!isProfessional && (
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
        </div>
      </div>

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
            <p className="text-sm text-muted font-medium">
              {isProfessional ? 'Total Earnings' : 'Average Score'}
            </p>
            <h3 className="text-2xl font-bold">
              {isProfessional ? `₹${dynamicEarnings.toLocaleString()}` : `${avgFeedbackScore}/100`}
            </h3>
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
      <div style={{ display: 'grid', gridTemplateColumns: isProfessional ? '1.4fr 1fr' : '1.4fr 1fr', gap: '1.5rem' }}>
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
                {!isProfessional && (
                  <Link to="/booking">
                    <button className="btn btn-primary mt-4">Schedule Your First Mock Interview</button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {upcomingInterviews.map(session => {
                  const partner = isProfessional ? session.candidateId : session.interviewerId;
                  const partnerName = partner?.name || (isProfessional ? 'Candidate' : 'Interviewer');
                  const partnerAvatar = partner?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80';

                  return (
                    <div key={session._id} className="p-4 border rounded-xl flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-3">
                        <img 
                          src={partnerAvatar} 
                          alt={partnerName} 
                          className="profile-avatar"
                          style={{ width: '48px', height: '48px' }}
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

                      <Link to={`/room?interviewId=${session._id}&role=${isProfessional ? 'interviewer' : 'candidate'}`}>
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
          {!isProfessional && feedbacks.length > 0 && (
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

        {/* Right Column */}
        <div className="flex flex-col gap-6">
          {isProfessional ? (
            <>
              {/* Dynamic Rate Setting */}
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={20} className="text-muted" />
                  <h3 className="text-lg font-bold">Set Your Session Price</h3>
                </div>
                <p className="text-sm text-muted mb-4">Your hourly rate charged to candidates (saved in MongoDB).</p>
                
                <div className="flex items-center gap-3 mb-4">
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold' }}>₹</span>
                    <input 
                      type="number"
                      className="input-field w-full"
                      style={{ paddingLeft: '2rem' }}
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                    />
                  </div>
                  <button 
                    className="btn btn-primary"
                    onClick={handleUpdatePrice}
                    disabled={savingPrice}
                  >
                    {savingPrice ? 'Saving...' : 'Update Price'}
                  </button>
                </div>

                {priceSavedToast && (
                  <div className="badge badge-success text-xs py-1 px-2 w-full text-center">
                    ✓ Price updated successfully in database!
                  </div>
                )}
              </div>

              {/* Dynamic Availability Management */}
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={20} className="text-muted" />
                  <h3 className="text-lg font-bold">Manage Available Slots</h3>
                </div>
                <p className="text-sm text-muted mb-4">Add or remove time slots visible to candidates for booking.</p>

                <div className="flex flex-col gap-2 mb-4">
                  {slotsList.map((slot, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 border rounded-lg text-sm" style={{ borderColor: 'var(--border)' }}>
                      <span>⏰ {slot}</span>
                      <button 
                        onClick={() => handleRemoveSlot(idx)}
                        className="text-danger hover:opacity-80 p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mb-4">
                  <input 
                    type="text" 
                    placeholder="e.g. 03:00 PM - 03:45 PM"
                    className="input-field flex-1"
                    value={newSlotInput}
                    onChange={(e) => setNewSlotInput(e.target.value)}
                  />
                  <button className="btn btn-outline" onClick={handleAddSlot}>
                    <Plus size={16} />
                  </button>
                </div>

                <button 
                  className="btn btn-primary w-full"
                  onClick={handleSaveSlots}
                  disabled={savingSlots}
                >
                  {savingSlots ? 'Saving...' : 'Save Availability Slots'}
                </button>

                {slotsSavedToast && (
                  <div className="badge badge-success text-xs py-1 px-2 w-full text-center mt-2">
                    ✓ Availability saved to database!
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Candidate: Recommended Interviewers Card */
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
                      {/* Avatar with status dot */}
                      <div className="relative flex-shrink-0 mt-0.5">
                        <img 
                          src={prof.avatar || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80'} 
                          alt={prof.name} 
                          className="profile-avatar shadow-sm"
                          style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--border)' }}
                        />
                        <span 
                          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2" 
                          style={{ borderColor: 'var(--card-bg, #fff)' }}
                          title="Online & Available"
                        />
                      </div>

                      {/* Structured Info: Name -> 1. Company Name -> 2. Domain -> Rate & Rating */}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-foreground flex items-center gap-1.5 truncate">
                          <span>{prof.name}</span>
                          <CheckCircle2 size={13} className="text-primary flex-shrink-0" title="Verified Expert" />
                        </div>

                        {/* 1. Company Name */}
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1 truncate">
                          <Building2 size={13} className="text-primary flex-shrink-0" />
                          <span className="truncate">{prof.company || 'Tech Leader'}</span>
                        </div>

                        {/* 2. Domain */}
                        <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5 truncate">
                          <Briefcase size={12} className="text-muted flex-shrink-0" />
                          <span className="truncate">{prof.domain || prof.title || 'Full Stack Engineering'}</span>
                        </div>

                        {/* Rate Tag & Rating */}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            ₹{prof.hourlyRate}/session
                          </span>
                          <span className="text-[11px] text-amber-500 font-semibold flex items-center gap-0.5">
                            ★ {prof.rating || 4.9}
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
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
