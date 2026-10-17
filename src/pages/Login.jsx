import { Eye, X, UserPlus, ShieldCheck, Briefcase, User, CheckCircle2, Clock, AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';

const DEFAULT_GOOGLE_ACCOUNTS = [
  {
    name: 'Shushant Gaikwad',
    email: 'shushant@example.com',
    role: 'professional',
    initial: 'S',
    color: '#1a73e8',
    avatar: '/shushant-gaikwad.png',
  },
  {
    name: 'Raju Bojane',
    email: 'raju@example.com',
    role: 'professional',
    initial: 'R',
    color: '#8b5cf6',
    avatar: '/raju-bojane.png',
  },
  {
    name: 'Namdev Sharma',
    email: 'namdev.sharma@gmail.com',
    role: 'candidate',
    initial: 'N',
    color: '#1a73e8',
  },
  {
    name: 'Namdev Gavhane',
    email: 'namdevgavhane41@gmail.com',
    role: 'admin',
    initial: 'A',
    color: '#ef4444',
    avatar: '/namdev-admin.jpg'
  }
];

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [activeRoleTab, setActiveRoleTab] = useState('candidate'); // 'candidate' | 'professional' | 'admin'

  const [formData, setFormData] = useState({
    name: '',
    email: 'namdev.sharma@gmail.com',
    password: 'password123',
    role: 'candidate',
    title: '',
    company: '',
    domain: 'Full Stack MERN',
    hourlyRate: 100,
    experience: '3+ Years',
    skills: 'React, Node.js, System Design',
    bio: '',
    linkedin: ''
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Status Modals
  const [pendingModalData, setPendingModalData] = useState(null); // when professional login is pending
  const [rejectedModalData, setRejectedModalData] = useState(null); // when professional application is rejected
  const [applicationSubmittedData, setApplicationSubmittedData] = useState(null); // when professional signs up

  // Google Accounts List State
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [selectedAccountLoading, setSelectedAccountLoading] = useState(null);
  const [googleAccounts, setGoogleAccounts] = useState([]);
  
  // "Use another account" view state
  const [isAddingNewGoogle, setIsAddingNewGoogle] = useState(false);
  const [newGoogleEmail, setNewGoogleEmail] = useState('');
  const [newGoogleName, setNewGoogleName] = useState('');

  const navigate = useNavigate();

  // Load stored Google accounts from localStorage or use defaults
  useEffect(() => {
    const saved = localStorage.getItem('interviewpro_google_accounts');
    if (saved) {
      try {
        let parsed = JSON.parse(saved).filter(a => a.email !== 'rahul@example.com');
        if (!parsed.some(a => a.email === 'shushant@example.com')) {
          parsed.unshift(DEFAULT_GOOGLE_ACCOUNTS[0]);
        }
        if (!parsed.some(a => a.email === 'raju@example.com')) {
          parsed.splice(1, 0, DEFAULT_GOOGLE_ACCOUNTS[1]);
        }
        if (!parsed.some(a => a.email === 'namdev.sharma@gmail.com')) {
          parsed.push(DEFAULT_GOOGLE_ACCOUNTS[2]);
        }
        if (!parsed.some(a => a.email === 'namdevgavhane41@gmail.com')) {
          parsed.push(DEFAULT_GOOGLE_ACCOUNTS[3]);
        }
        setGoogleAccounts(parsed);
        localStorage.setItem('interviewpro_google_accounts', JSON.stringify(parsed));
      } catch {
        setGoogleAccounts(DEFAULT_GOOGLE_ACCOUNTS);
        localStorage.setItem('interviewpro_google_accounts', JSON.stringify(DEFAULT_GOOGLE_ACCOUNTS));
      }
    } else {
      setGoogleAccounts(DEFAULT_GOOGLE_ACCOUNTS);
      localStorage.setItem('interviewpro_google_accounts', JSON.stringify(DEFAULT_GOOGLE_ACCOUNTS));
    }
  }, []);

  // Sync role tab with formData.role
  const handleRoleTabChange = (role) => {
    setActiveRoleTab(role);
    setFormData(prev => ({
      ...prev,
      role: role === 'admin' ? 'admin' : role
    }));

    // Pre-fill convenient demo credentials if switching in Login mode
    if (isLogin) {
      if (role === 'candidate') {
        setFormData(prev => ({
          ...prev,
          email: 'namdev.sharma@gmail.com',
          password: 'password123',
          role: 'candidate'
        }));
      } else if (role === 'professional') {
        setFormData(prev => ({
          ...prev,
          email: 'shushant@example.com',
          password: 'password123',
          role: 'professional'
        }));
      } else if (role === 'admin') {
        setFormData(prev => ({
          ...prev,
          email: 'namdevgavhane41@gmail.com',
          password: 'Namu7654321@',
          role: 'admin'
        }));
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Standard Form Submit (email/password)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const url = isLogin 
      ? `${API_BASE_URL}/api/users/login` 
      : `${API_BASE_URL}/api/users/register`;
      
    try {
      const payload = isLogin 
        ? { email: formData.email, password: formData.password } 
        : {
            ...formData,
            role: activeRoleTab === 'professional' ? 'professional' : 'candidate'
          };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      // Handle Professional Pending Review
      if (response.status === 403 && data.pendingApproval) {
        setPendingModalData({
          name: data.name || formData.name || 'Applicant',
          email: data.email || formData.email,
          message: data.message,
          appliedAt: data.appliedAt || new Date().toISOString()
        });
        return;
      }

      // Handle Professional Rejected
      if (response.status === 403 && data.rejected) {
        setRejectedModalData({
          name: data.name || formData.name || 'Applicant',
          email: data.email || formData.email,
          message: data.message
        });
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      // When newly registered as a professional -> show application submitted card
      if (!isLogin && data.pendingApproval) {
        setApplicationSubmittedData({
          name: formData.name,
          email: formData.email,
          title: formData.title || 'Technical Interviewer',
          company: formData.company || 'Tech Company',
          domain: formData.domain || 'Software Engineering',
          hourlyRate: formData.hourlyRate || 100
        });
        return;
      }

      // Successful login or candidate registration
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('userRole', data.role);
      
      if (data.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        setError('Cannot connect to backend server. Please verify the backend API is running.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Authenticate chosen Google account with backend
  const handleSelectGoogleAccount = async (account) => {
    try {
      setSelectedAccountLoading(account.email);
      setError('');

      const response = await fetch(`${API_BASE_URL}/api/users/google-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: account.email,
          name: account.name,
          role: account.role || activeRoleTab || 'candidate',
          avatar: account.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80'
        }),
      });

      const data = await response.json();

      if (response.status === 403 && data.pendingApproval) {
        setPendingModalData({
          name: data.name || account.name,
          email: data.email || account.email,
          message: data.message
        });
        setShowGoogleModal(false);
        return;
      }

      if (response.status === 403 && data.rejected) {
        setRejectedModalData({
          name: data.name || account.name,
          email: data.email || account.email,
          message: data.message
        });
        setShowGoogleModal(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Google authentication failed');
      }

      if (data.pendingApproval) {
        setApplicationSubmittedData({
          name: data.name || account.name,
          email: data.email || account.email,
          title: 'Professional Interviewer',
          domain: 'Tech Expert'
        });
        setShowGoogleModal(false);
        return;
      }

      localStorage.setItem('userId', data.userId);
      localStorage.setItem('userRole', data.role);
      setShowGoogleModal(false);
      
      if (data.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        setError('Cannot connect to backend server. Please verify backend is running.');
      } else {
        setError(err.message);
      }
      setShowGoogleModal(false);
    } finally {
      setSelectedAccountLoading(null);
    }
  };

  // Add a new custom Gmail account to the list and log in
  const handleAddNewGoogleAccount = (e) => {
    e.preventDefault();
    if (!newGoogleEmail.trim()) return;

    const email = newGoogleEmail.trim().toLowerCase();
    const name = newGoogleName.trim() || email.split('@')[0];
    const initial = name.charAt(0).toUpperCase();

    const colors = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#8b5cf6'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const newAccount = {
      name,
      email,
      role: activeRoleTab === 'professional' ? 'professional' : 'candidate',
      initial,
      color
    };

    const updatedList = [newAccount, ...googleAccounts.filter(a => a.email !== email)];
    setGoogleAccounts(updatedList);
    localStorage.setItem('interviewpro_google_accounts', JSON.stringify(updatedList));

    handleSelectGoogleAccount(newAccount);
  };

  return (
    <div className="flex h-full w-full" style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      {/* Left side - Login / Signup Form */}
      <div className="flex-1 flex flex-col justify-center px-6 lg:px-12 py-10" style={{ backgroundColor: 'white', overflowY: 'auto' }}>
        <div style={{ maxWidth: '440px', margin: '0 auto', width: '100%' }}>
          
          {/* Logo */}
          <div className="flex items-center gap-2 mb-6">
            <div style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '0.3rem 0.6rem', borderRadius: '8px', fontWeight: 'bold' }}>IP</div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--primary)' }}>InterviewPro</h1>
            <span className="badge badge-info text-xs ml-auto" style={{ fontSize: '0.7rem' }}>Platform 2.0</span>
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-bold mb-1">
            {isLogin 
              ? (activeRoleTab === 'professional' ? 'Professional Interviewer Sign In' : activeRoleTab === 'admin' ? 'Admin Portal Sign In' : 'Candidate Welcome Back') 
              : 'Create Candidate Account'}
          </h2>
          <p className="text-muted mb-5 text-sm">
            {isLogin 
              ? (activeRoleTab === 'professional' 
                  ? 'Sign in to access your interview schedule, ratings, and payouts' 
                  : activeRoleTab === 'admin' 
                  ? 'Manage users, invite professionals, and oversee platform' 
                  : 'Sign in to practice mock interviews and access AI feedback')
              : 'Public registration creates a Candidate (User) account. Professional accounts are invitation-only.'}
          </p>

          {/* Dynamic Role Selector Tabs */}
          <div style={{
            display: 'flex',
            backgroundColor: '#f1f5f9',
            borderRadius: '12px',
            padding: '4px',
            marginBottom: '1.25rem',
            border: '1px solid #e2e8f0'
          }}>
            <button
              type="button"
              onClick={() => handleRoleTabChange('candidate')}
              style={{
                flex: 1,
                padding: '0.6rem 0.5rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                backgroundColor: activeRoleTab === 'candidate' ? 'white' : 'transparent',
                color: activeRoleTab === 'candidate' ? 'var(--primary)' : '#64748b',
                boxShadow: activeRoleTab === 'candidate' ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <User size={15} />
              <span>User (Candidate)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleRoleTabChange('professional');
                if (!isLogin) {
                  setIsLogin(true); // Professionals cannot register publicly (Requirement 9)
                }
              }}
              style={{
                flex: 1,
                padding: '0.6rem 0.5rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                backgroundColor: activeRoleTab === 'professional' ? 'white' : 'transparent',
                color: activeRoleTab === 'professional' ? '#8b5cf6' : '#64748b',
                boxShadow: activeRoleTab === 'professional' ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <Briefcase size={15} />
              <span>Professional</span>
            </button>

            {isLogin && (
              <button
                type="button"
                onClick={() => handleRoleTabChange('admin')}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  backgroundColor: activeRoleTab === 'admin' ? 'white' : 'transparent',
                  color: activeRoleTab === 'admin' ? '#ef4444' : '#64748b',
                  boxShadow: activeRoleTab === 'admin' ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s'
                }}
                title="Platform Administrator Console"
              >
                <ShieldCheck size={15} />
                <span>Admin</span>
              </button>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm flex items-start gap-2" style={{ backgroundColor: 'rgba(234, 67, 53, 0.1)', color: 'var(--danger)', border: '1px solid rgba(234, 67, 53, 0.2)' }}>
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Application Submitted Success View (After Professional Registration) */}
          {applicationSubmittedData ? (
            <div className="card p-6 text-center" style={{ border: '2px solid rgba(139, 92, 246, 0.3)', backgroundColor: '#faf5ff' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                color: '#8b5cf6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem'
              }}>
                <Clock size={28} />
              </div>

              <h3 className="text-xl font-bold mb-1" style={{ color: '#6b21a8' }}>
                Application Sent to Admin!
              </h3>
              <p className="text-xs text-muted mb-4">
                Thank you <strong>{applicationSubmittedData.name}</strong>. Your application to join as a Professional Interviewer has been routed to the <strong>Admin Console</strong> for evaluation.
              </p>

              <div className="p-3 rounded-lg text-left text-xs mb-4" style={{ backgroundColor: 'white', border: '1px solid #e9d5ff' }}>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: '#f3e8ff' }}>
                  <span className="text-muted">Account Email:</span>
                  <span className="font-semibold">{applicationSubmittedData.email}</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: '#f3e8ff' }}>
                  <span className="text-muted">Domain Expertise:</span>
                  <span className="font-semibold">{applicationSubmittedData.domain}</span>
                </div>
                <div className="flex justify-between py-1 border-b" style={{ borderColor: '#f3e8ff' }}>
                  <span className="text-muted">Hourly Rate:</span>
                  <span className="font-semibold text-success">₹{applicationSubmittedData.hourlyRate || 100} / session</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted">Current Status:</span>
                  <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Awaiting Admin Approval ⏳</span>
                </div>
              </div>

              <div className="text-xs text-muted mb-4" style={{ lineHeight: 1.5 }}>
                💡 <strong>What happens next?</strong> The administrator (Namdev) will inspect your credentials in the Admin Panel and decide whether to approve your professional account. Once approved, you can log in and conduct mock interviews.
              </div>

              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => {
                  setApplicationSubmittedData(null);
                  setIsLogin(true);
                  setActiveRoleTab('professional');
                  setFormData(prev => ({
                    ...prev,
                    email: applicationSubmittedData.email,
                    password: ''
                  }));
                }}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            /* Main Form */
            <form onSubmit={handleSubmit}>
              {!isLogin && (
                <div className="input-group">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    name="name"
                    placeholder="Enter your full name" 
                    className="input-field" 
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              )}

              {/* Informational notice when Professional tab is selected */}
              {activeRoleTab === 'professional' && isLogin && (
                <div className="p-3 rounded-xl mb-4 text-xs" style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', color: '#6b21a8' }}>
                  <div className="font-semibold flex items-center justify-between mb-1">
                    <span>👨‍💼 Verified Professional Portal</span>
                    <Link to="/professional/login" className="underline font-bold" style={{ color: '#7c3aed' }}>
                      Dedicated Page →
                    </Link>
                  </div>
                  <p className="text-muted text-[11px]" style={{ margin: 0, color: '#7e22ce' }}>
                    Professional accounts are created exclusively by Admin invitation. Enter your Email and Password below to access your dashboard.
                  </p>
                </div>
              )}

              <div className="input-group">
                <label>Email address</label>
                <input 
                  type="email" 
                  name="email"
                  placeholder="Enter your email" 
                  className="input-field" 
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="input-group mb-5">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="password" 
                    name="password"
                    placeholder="Enter your password" 
                    className="input-field w-full" 
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                  <Eye size={18} className="text-muted" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }} />
                </div>
              </div>

              <button 
                type="submit" 
                className={`btn ${activeRoleTab === 'professional' ? 'btn-primary' : activeRoleTab === 'admin' ? 'btn-danger' : 'btn-primary'} w-full mb-4`} 
                style={{ 
                  padding: '0.75rem',
                  backgroundColor: activeRoleTab === 'professional' ? '#8b5cf6' : activeRoleTab === 'admin' ? '#ef4444' : 'var(--primary)',
                  borderColor: activeRoleTab === 'professional' ? '#8b5cf6' : activeRoleTab === 'admin' ? '#ef4444' : 'var(--primary)'
                }}
                disabled={loading}
              >
                {loading ? 'Processing...' : (
                  isLogin 
                    ? `Sign In as ${activeRoleTab === 'admin' ? 'Admin' : activeRoleTab === 'professional' ? 'Professional' : 'Candidate'}` 
                    : (activeRoleTab === 'professional' ? 'Submit Professional Application' : 'Create Account')
                )}
              </button>

              {/* Quick Demo Switcher Pills in Login Mode */}
              {isLogin && (
                <div className="mb-4 p-3 rounded-xl border text-xs" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
                  <div className="text-muted font-semibold mb-2 flex items-center justify-between">
                    <span>⚡ Quick Test Login Accounts:</span>
                    <Sparkles size={13} className="text-primary" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-outline text-xs py-1 px-2 text-left"
                      style={{ fontSize: '0.7rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                      onClick={() => {
                        setActiveRoleTab('candidate');
                        setFormData(prev => ({
                          ...prev,
                          email: 'namdev.sharma@gmail.com',
                          password: 'password123',
                          role: 'candidate'
                        }));
                      }}
                    >
                      <span className="font-bold text-primary">👨‍💻 Candidate</span>
                      <span className="text-muted" style={{ fontSize: '0.65rem' }}>namdev.sharma@...</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline text-xs py-1 px-2 text-left"
                      style={{ fontSize: '0.7rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                      onClick={() => {
                        setActiveRoleTab('professional');
                        setFormData(prev => ({
                          ...prev,
                          email: 'shushant@example.com',
                          password: 'password123',
                          role: 'professional'
                        }));
                      }}
                    >
                      <span className="font-bold text-success">💼 Professional (Approved)</span>
                      <span className="text-muted" style={{ fontSize: '0.65rem' }}>shushant@example...</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline text-xs py-1 px-2 text-left"
                      style={{ fontSize: '0.7rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                      onClick={() => {
                        setActiveRoleTab('professional');
                        setFormData(prev => ({
                          ...prev,
                          email: 'pooja.deshmukh@example.com',
                          password: 'password123',
                          role: 'professional'
                        }));
                      }}
                      title="Test Pending Admin Approval behavior"
                    >
                      <span className="font-bold text-warning">⏳ Professional (Pending)</span>
                      <span className="text-muted" style={{ fontSize: '0.65rem' }}>pooja.deshmukh@...</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline text-xs py-1 px-2 text-left"
                      style={{ fontSize: '0.7rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                      onClick={() => {
                        setActiveRoleTab('admin');
                        setFormData(prev => ({
                          ...prev,
                          email: 'namdevgavhane41@gmail.com',
                          password: 'Namu7654321@',
                          role: 'admin'
                        }));
                      }}
                    >
                      <span className="font-bold text-danger">🛡️ Super Admin</span>
                      <span className="text-muted" style={{ fontSize: '0.65rem' }}>namdevgavhane41@...</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 mb-4" style={{ margin: '1.25rem 0' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
                <span className="text-muted text-xs">or continue with</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
              </div>

              {/* Working Continue with Google button */}
              <button 
                type="button" 
                className="btn btn-outline w-full flex items-center justify-center gap-3 mb-2" 
                style={{ padding: '0.75rem', fontWeight: 500, fontSize: '0.95rem' }}
                onClick={() => {
                  setIsAddingNewGoogle(false);
                  setShowGoogleModal(true);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
            </form>
          )}

          {/* Toggle between Login and Signup */}
          <p className="text-center text-sm text-muted mt-6">
            {isLogin ? "Don't have an account? " : "Already registered? "}
            <span 
              className="font-semibold" 
              style={{ color: 'var(--primary)', cursor: 'pointer' }}
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setApplicationSubmittedData(null);
              }}
            >
              {isLogin ? (activeRoleTab === 'professional' ? 'Apply as Professional' : 'Sign up') : 'Sign in'}
            </span>
          </p>
        </div>
      </div>

      {/* Right side - Dynamic Information & Illustration */}
      <div className="flex-1 hidden lg:flex flex-col items-center justify-center p-12" style={{ backgroundColor: '#f0f4f8' }}>
        <img 
          src={activeRoleTab === 'professional' 
            ? "https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
            : "https://images.unsplash.com/photo-1516321497487-e288fb19713f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"} 
          alt="Illustration" 
          style={{ maxWidth: '80%', maxHeight: '420px', objectFit: 'cover', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }} 
        />
        <div className="text-center mt-8" style={{ maxWidth: '440px' }}>
          <h2 className="text-2xl font-bold mb-3">
            {activeRoleTab === 'professional' 
              ? "Conduct Interviews.\nMonetize Your Experience." 
              : "Practice. Improve.\nLand Your Dream Offer."}
          </h2>
          <p className="text-muted text-sm" style={{ lineHeight: 1.6 }}>
            {activeRoleTab === 'professional'
              ? "Join elite engineers from Cognizant, NICE, and top tech companies. Admin manually accredits every interviewer to maintain the highest quality standards."
              : "Mock interviews with vetted industry professionals and adaptive AI simulations. Detailed feedback reports that help you get hired."}
          </p>
        </div>
      </div>

      {/* ================= MODAL 1: PENDING ADMIN APPROVAL ================= */}
      {pendingModalData && (
        <div className="modal-overlay" onClick={() => setPendingModalData(null)}>
          <div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '460px', 
              padding: '2.5rem 2rem', 
              borderRadius: '24px',
              textAlign: 'center'
            }}
          >
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem'
            }}>
              <Clock size={32} />
            </div>

            <span className="badge badge-warning text-xs font-semibold uppercase px-3 py-1 mb-2">
              Application Under Review ⏳
            </span>

            <h3 className="text-xl font-bold mt-2 mb-2">Account Pending Admin Approval</h3>
            <p className="text-muted text-xs mb-5" style={{ lineHeight: 1.5 }}>
              Hello <strong>{pendingModalData.name}</strong>, your application to conduct mock interviews on InterviewPro is currently waiting for approval from the platform Administrator.
            </p>

            <div className="p-3 rounded-xl border text-left text-xs mb-5" style={{ backgroundColor: '#fefce8', borderColor: '#fef08a' }}>
              <div className="flex justify-between py-1 border-b" style={{ borderColor: '#fef9c3' }}>
                <span className="text-muted">Registered Email:</span>
                <span className="font-semibold">{pendingModalData.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b" style={{ borderColor: '#fef9c3' }}>
                <span className="text-muted">Target Role:</span>
                <span className="font-semibold">Professional Interviewer</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted">Admin Approver:</span>
                <span className="font-semibold text-primary">Namdev Gavhane (Admin)</span>
              </div>
            </div>

            <div className="text-xs text-muted mb-6" style={{ lineHeight: 1.5 }}>
              Once the administrator decides to approve your professional status, your access will be activated immediately and you can log in to set availability slots.
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                className="btn btn-outline flex-1"
                onClick={() => setPendingModalData(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => {
                  setPendingModalData(null);
                  setActiveRoleTab('admin');
                  setFormData(prev => ({
                    ...prev,
                    email: 'namdevgavhane41@gmail.com',
                    password: 'Namu7654321@',
                    role: 'admin'
                  }));
                }}
              >
                Sign In as Admin to Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: APPLICATION REJECTED ================= */}
      {rejectedModalData && (
        <div className="modal-overlay" onClick={() => setRejectedModalData(null)}>
          <div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '440px', 
              padding: '2.5rem 2rem', 
              borderRadius: '24px',
              textAlign: 'center'
            }}
          >
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem'
            }}>
              <X size={32} />
            </div>

            <span className="badge badge-danger text-xs font-semibold uppercase px-3 py-1 mb-2">
              Application Decision: Not Approved ⚠️
            </span>

            <h3 className="text-xl font-bold mt-2 mb-2">Professional Application Not Approved</h3>
            <p className="text-muted text-xs mb-5" style={{ lineHeight: 1.5 }}>
              {rejectedModalData.message || 'Your professional interviewer application was evaluated by the platform administrator and not approved at this time.'}
            </p>

            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => setRejectedModalData(null)}
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: GOOGLE AUTH CHOOSER ================= */}
      {showGoogleModal && (
        <div className="modal-overlay" onClick={() => !selectedAccountLoading && setShowGoogleModal(false)}>
          <div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '440px', 
              padding: '2.5rem 2rem', 
              borderRadius: '28px',
              boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
              border: '1px solid rgba(0,0,0,0.08)'
            }}
          >
            {/* Top Close Button & Google Logo */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex flex-col items-start">
                <svg width="24" height="24" viewBox="0 0 48 48" className="mb-4">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
                <h3 className="text-xl font-medium" style={{ color: '#202124', letterSpacing: '-0.2px' }}>
                  Choose an account
                </h3>
                <p className="text-sm mt-1" style={{ color: '#5f6368' }}>
                  to continue to <span className="font-semibold" style={{ color: '#202124' }}>InterviewPro</span>
                </p>
              </div>
              <button 
                onClick={() => !selectedAccountLoading && setShowGoogleModal(false)}
                className="btn btn-ghost p-1"
                style={{ borderRadius: '50%', color: '#5f6368' }}
              >
                <X size={20} />
              </button>
            </div>

            {!isAddingNewGoogle ? (
              <div>
                <div className="flex flex-col">
                  {googleAccounts.map((account) => {
                    const isSigningIn = selectedAccountLoading === account.email;

                    return (
                      <div
                        key={account.email}
                        onClick={() => !selectedAccountLoading && handleSelectGoogleAccount(account)}
                        className="flex items-center justify-between p-3.5 transition-colors"
                        style={{
                          cursor: selectedAccountLoading ? 'not-allowed' : 'pointer',
                          opacity: selectedAccountLoading && !isSigningIn ? 0.5 : 1,
                          borderBottom: '1px solid #f1f3f4'
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedAccountLoading) e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div className="flex items-center gap-3.5">
                          {account.avatar ? (
                            <img 
                              src={account.avatar} 
                              alt={account.name}
                              style={{ 
                                width: '40px', 
                                height: '40px', 
                                borderRadius: '50%', 
                                objectFit: 'cover' 
                              }}
                            />
                          ) : (
                            <div 
                              style={{ 
                                width: '40px', 
                                height: '40px', 
                                borderRadius: '50%', 
                                backgroundColor: account.color || '#1a73e8',
                                color: 'white',
                                fontWeight: 500,
                                fontSize: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              {account.initial || account.name.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="text-left">
                            <div className="font-semibold text-sm" style={{ color: '#202124' }}>
                              {account.name}
                            </div>
                            <div className="text-xs" style={{ color: '#5f6368' }}>
                              {account.email}
                            </div>
                          </div>
                        </div>

                        {isSigningIn ? (
                          <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                            Signing in...
                          </span>
                        ) : (
                          <span className="badge badge-secondary text-xs" style={{ fontSize: '0.7rem' }}>
                            {account.role === 'admin' ? 'Admin' : account.role === 'professional' ? 'Interviewer' : 'Candidate'}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* "+ Use another account" Row */}
                  <div
                    onClick={() => !selectedAccountLoading && setIsAddingNewGoogle(true)}
                    className="flex items-center gap-3.5 p-3.5 transition-colors"
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid #e0e0e0'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div 
                      style={{ 
                        width: '40px', 
                        height: '40px', 
                        borderRadius: '50%', 
                        border: '1px solid #dadce0',
                        color: '#5f6368',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <UserPlus size={18} />
                    </div>
                    <div className="font-semibold text-sm" style={{ color: '#202124' }}>
                      Use another account
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted mt-6 text-left" style={{ color: '#5f6368', lineHeight: 1.4 }}>
                  To continue, Google will share your profile with InterviewPro according to the selected role.
                </p>
              </div>
            ) : (
              <form onSubmit={handleAddNewGoogleAccount} className="flex flex-col gap-4">
                <p className="text-sm font-medium" style={{ color: '#202124' }}>
                  Sign in with your Google Account
                </p>

                <div className="input-group">
                  <label className="text-xs font-medium">Email address</label>
                  <input 
                    type="email" 
                    placeholder="Enter your Gmail address"
                    className="input-field text-sm"
                    value={newGoogleEmail}
                    onChange={(e) => setNewGoogleEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="input-group">
                  <label className="text-xs font-medium">Your Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Priya Patil"
                    className="input-field text-sm"
                    value={newGoogleName}
                    onChange={(e) => setNewGoogleName(e.target.value)}
                  />
                </div>

                <div className="flex justify-between items-center mt-4">
                  <button 
                    type="button" 
                    className="btn btn-ghost text-sm font-semibold"
                    style={{ color: '#1a73e8' }}
                    onClick={() => setIsAddingNewGoogle(false)}
                  >
                    Back to accounts
                  </button>

                  <button 
                    type="submit" 
                    className="btn btn-primary text-sm px-6 py-2"
                    style={{ borderRadius: '20px' }}
                  >
                    Continue
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
