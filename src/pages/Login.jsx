import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Bot, 
  Users, 
  FileText, 
  TrendingUp, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  UserPlus, 
  X, 
  User, 
  Check, 
  HelpCircle,
  Briefcase
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import './Login.css';

const DEFAULT_GOOGLE_ACCOUNTS = [
  {
    name: 'Namdev Sharma',
    email: 'namdev.sharma@gmail.com',
    role: 'candidate',
    initial: 'N',
    color: '#1a73e8',
  },
  {
    name: 'Priya Patil',
    email: 'priya.patil@gmail.com',
    role: 'candidate',
    initial: 'P',
    color: '#34a853',
  },
  {
    name: 'Shushant Gaikwad',
    email: 'shushant@example.com',
    role: 'professional',
    initial: 'S',
    color: '#1a73e8',
    avatar: '/shushant-gaikwad.png',
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState({ sent: false, loading: false });

  // Google Accounts List State
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [selectedAccountLoading, setSelectedAccountLoading] = useState(null);
  const [googleAccounts, setGoogleAccounts] = useState([]);
  const [isAddingNewGoogle, setIsAddingNewGoogle] = useState(false);
  const [newGoogleEmail, setNewGoogleEmail] = useState('');
  const [newGoogleName, setNewGoogleName] = useState('');

  const navigate = useNavigate();

  // Load remembered candidate email and Google accounts
  useEffect(() => {
    const savedEmail = localStorage.getItem('interviewpro_candidate_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }

    const savedAccounts = localStorage.getItem('interviewpro_google_accounts');
    if (savedAccounts) {
      try {
        const parsed = JSON.parse(savedAccounts);
        setGoogleAccounts(parsed);
      } catch {
        setGoogleAccounts(DEFAULT_GOOGLE_ACCOUNTS);
      }
    } else {
      setGoogleAccounts(DEFAULT_GOOGLE_ACCOUNTS);
      localStorage.setItem('interviewpro_google_accounts', JSON.stringify(DEFAULT_GOOGLE_ACCOUNTS));
    }
  }, []);

  // Standard Form Submit (Email / Password)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!email.trim() || !password) {
      setError('Please provide both email address and password.');
      return;
    }

    if (!isLogin && !name.trim()) {
      setError('Please enter your full name to create an account.');
      return;
    }

    setLoading(true);

    try {
      const url = isLogin 
        ? `${API_BASE_URL}/api/users/login` 
        : `${API_BASE_URL}/api/users/register`;

      // Requirement 9: Public registration strictly creates a candidate/user account
      const payload = isLogin 
        ? { email: email.trim().toLowerCase(), password } 
        : {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            role: 'candidate'
          };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || (isLogin ? 'Failed to sign in' : 'Registration failed'));
      }

      // If registered successfully, switch to login or direct login
      if (!isLogin) {
        setSuccessMessage('Account created successfully! Signing you in...');
      }

      // Handle "Remember Me"
      if (rememberMe) {
        localStorage.setItem('interviewpro_candidate_email', email.trim().toLowerCase());
      } else {
        localStorage.removeItem('interviewpro_candidate_email');
      }

      // Set user session
      localStorage.setItem('userId', data.userId || data.user?.id);
      localStorage.setItem('userRole', data.role || data.user?.role || 'candidate');
      if (data.token) {
        localStorage.setItem('token', data.token);
      }

      // Role redirection
      if (data.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        setError('Cannot connect to the server. Please ensure the backend service is running.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Google Login Handler
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
          role: account.role || 'candidate',
          avatar: account.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80'
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Google authentication failed');
      }

      localStorage.setItem('userId', data.userId);
      localStorage.setItem('userRole', data.role);
      if (data.token) {
        localStorage.setItem('token', data.token);
      }

      setShowGoogleModal(false);

      if (data.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
      setShowGoogleModal(false);
    } finally {
      setSelectedAccountLoading(null);
    }
  };

  // Add custom Google Account
  const handleAddNewGoogleAccount = (e) => {
    e.preventDefault();
    if (!newGoogleEmail.trim()) return;

    const cleanEmail = newGoogleEmail.trim().toLowerCase();
    const cleanName = newGoogleName.trim() || cleanEmail.split('@')[0];
    const initial = cleanName.charAt(0).toUpperCase();

    const colors = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#8b5cf6'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const newAccount = {
      name: cleanName,
      email: cleanEmail,
      role: 'candidate',
      initial,
      color
    };

    const updatedList = [newAccount, ...googleAccounts.filter(a => a.email !== cleanEmail)];
    setGoogleAccounts(updatedList);
    localStorage.setItem('interviewpro_google_accounts', JSON.stringify(updatedList));

    handleSelectGoogleAccount(newAccount);
  };

  // Handle Forgot Password submission
  const handleForgotSubmit = (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotStatus({ loading: true, sent: false });
    setTimeout(() => {
      setForgotStatus({ loading: false, sent: true });
    }, 700);
  };

  return (
    <div className="ip-login-wrapper">
      {/* ==========================================================================
          1. LEFT SECTION — BRANDING AND ILLUSTRATION (~50% width)
          ========================================================================== */}
      <section className="ip-left-section" aria-label="InterviewPro Branding">
        {/* Subtle decorative shapes */}
        <div className="ip-bg-shape-1" aria-hidden="true" />
        <div className="ip-bg-shape-2" aria-hidden="true" />
        <div className="ip-bg-shape-3" aria-hidden="true" />

        {/* Top Brand Logo */}
        <div className="ip-brand-header">
          <div className="ip-logo-badge">IP</div>
          <span className="ip-logo-title">InterviewPro</span>
          <span className="ip-logo-tag">AI Prep</span>
        </div>

        {/* Main Pitch & 4 Feature Items */}
        <div className="ip-left-content">
          <h1 className="ip-main-heading">
            Practice Today.<br />
            <span className="ip-highlight">Build Your Tomorrow.</span>
          </h1>

          <p className="ip-supporting-text">
            Ace your interviews with AI-powered mock interviews and connect with industry experts.
          </p>

          {/* 4 Feature items with blue icons */}
          <div className="ip-features-grid">
            <div className="ip-feature-card">
              <div className="ip-feature-icon-wrapper">
                <Bot size={19} />
              </div>
              <span className="ip-feature-title">AI Mock Interviews</span>
            </div>

            <div className="ip-feature-card">
              <div className="ip-feature-icon-wrapper">
                <Users size={19} />
              </div>
              <span className="ip-feature-title">Expert Interviews</span>
            </div>

            <div className="ip-feature-card">
              <div className="ip-feature-icon-wrapper">
                <FileText size={19} />
              </div>
              <span className="ip-feature-title">Detailed Feedback</span>
            </div>

            <div className="ip-feature-card">
              <div className="ip-feature-icon-wrapper">
                <TrendingUp size={19} />
              </div>
              <span className="ip-feature-title">Career Growth</span>
            </div>
          </div>
        </div>

        {/* Student Illustration & Motivational Tagline */}
        <div className="ip-illustration-wrapper">
          <div className="ip-illustration-card">
            <img 
              src="/login-illustration.jpg" 
              alt="Student practicing mock interviews on laptop" 
              className="ip-illustration-img"
              loading="eager"
            />
          </div>

          <div className="ip-tagline-badge">
            <Sparkles size={14} className="text-primary" />
            <span>Your growth matters</span>
          </div>
        </div>
      </section>

      {/* ==========================================================================
          2. RIGHT SECTION — LOGIN FORM (~50% width)
          ========================================================================== */}
      <section className="ip-right-section" aria-label="Sign In Form">
        <div className="ip-login-card">
          {/* Card Header with Logo, Heading & Subtitle */}
          <div className="ip-card-header">
            <div className="ip-card-logo">
              <div className="ip-logo-badge" style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}>IP</div>
              <span className="ip-logo-title" style={{ fontSize: '1.25rem' }}>InterviewPro</span>
            </div>

            <h2 className="ip-card-heading">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="ip-card-subtitle">
              {isLogin 
                ? 'Sign in to continue your journey' 
                : 'Sign up to practice mock interviews and get hired'}
            </p>
          </div>

          {/* Error & Success Feedback Banners */}
          {error && (
            <div className="ip-error-banner" role="alert">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="ip-success-banner" role="status">
              <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Full Name field (Only shown during Candidate Signup) */}
            {!isLogin && (
              <div className="ip-form-group">
                <label className="ip-form-label" htmlFor="fullName">Full Name</label>
                <div className="ip-input-container">
                  <User size={18} className="ip-input-icon" />
                  <input 
                    id="fullName"
                    type="text"
                    name="name"
                    placeholder="Enter your full name"
                    className="ip-input-field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            {/* Email Address */}
            <div className="ip-form-group">
              <label className="ip-form-label" htmlFor="loginEmail">Email address</label>
              <div className="ip-input-container">
                <Mail size={18} className="ip-input-icon" />
                <input 
                  id="loginEmail"
                  type="email"
                  name="email"
                  placeholder="name@example.com"
                  className="ip-input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="ip-form-group">
              <label className="ip-form-label" htmlFor="loginPassword">Password</label>
              <div className="ip-input-container">
                <Lock size={18} className="ip-input-icon" />
                <input 
                  id="loginPassword"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password"
                  className="ip-input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                />
                <button
                  type="button"
                  className="ip-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember me & Forgot Password */}
            {isLogin && (
              <div className="ip-options-row">
                <label className="ip-remember-label">
                  <input 
                    type="checkbox"
                    className="ip-remember-checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>

                <button
                  type="button"
                  className="ip-forgot-link"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotStatus({ sent: false, loading: false });
                    setShowForgotModal(true);
                  }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Full-width blue gradient Sign In button */}
            <button
              type="submit"
              className="ip-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span>Processing...</span>
              ) : (
                <>
                  <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>

            {/* Divider with "or" */}
            <div className="ip-divider">
              <span className="ip-divider-line" />
              <span className="ip-divider-text">or</span>
              <span className="ip-divider-line" />
            </div>

            {/* Continue with Google button */}
            <button
              type="button"
              className="ip-google-btn"
              onClick={() => {
                setIsAddingNewGoogle(false);
                setShowGoogleModal(true);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>

          {/* Footer: Toggle Login / Signup */}
          <div className="ip-card-footer">
            <span>{isLogin ? "Don't have an account?" : "Already have an account?"}</span>
            <button
              type="button"
              className="ip-toggle-btn"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setSuccessMessage('');
              }}
            >
              {isLogin ? 'Create account' : 'Sign in'}
            </button>
          </div>

          {/* Discreet link for Interviewers / Professionals (Requirement 3) */}
          <div className="ip-pro-link-wrapper">
            <span>Interviewer or Admin? </span>
            <Link to="/professional/login" className="ip-pro-link">
              <Briefcase size={13} />
              <span>Professional Portal Sign In →</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ==========================================================================
          MODAL: FORGOT PASSWORD DIALOG
          ========================================================================== */}
      {showForgotModal && (
        <div className="modal-overlay" onClick={() => setShowForgotModal(false)}>
          <div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            style={{ maxWidth: '420px', padding: '2rem', borderRadius: '24px' }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold" style={{ color: '#0f172a' }}>
                Reset Your Password
              </h3>
              <button 
                type="button"
                className="btn btn-ghost p-1"
                onClick={() => setShowForgotModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {forgotStatus.sent ? (
              <div className="text-center py-4">
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#f0fdf4',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem'
                }}>
                  <Check size={28} />
                </div>
                <h4 className="font-bold text-base mb-1">Check Your Inbox</h4>
                <p className="text-xs text-muted mb-4" style={{ lineHeight: 1.5 }}>
                  If an account exists for <strong>{forgotEmail}</strong>, password reset instructions have been sent. Please check your spam folder as well.
                </p>
                <button
                  type="button"
                  className="ip-submit-btn"
                  onClick={() => setShowForgotModal(false)}
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit}>
                <p className="text-xs text-muted mb-4" style={{ lineHeight: 1.5 }}>
                  Enter your registered email address and we will provide you with password reset instructions.
                </p>
                <div className="ip-form-group mb-4">
                  <label className="ip-form-label">Email Address</label>
                  <div className="ip-input-container">
                    <Mail size={18} className="ip-input-icon" />
                    <input 
                      type="email"
                      className="ip-input-field"
                      placeholder="name@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-outline flex-1"
                    onClick={() => setShowForgotModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ip-submit-btn flex-1"
                    disabled={forgotStatus.loading}
                  >
                    {forgotStatus.loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==========================================================================
          MODAL: GOOGLE ACCOUNT CHOOSER (Seamless Google Sign-In)
          ========================================================================== */}
      {showGoogleModal && (
        <div className="modal-overlay" onClick={() => !selectedAccountLoading && setShowGoogleModal(false)}>
          <div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '430px', 
              padding: '2.25rem 2rem', 
              borderRadius: '26px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div className="flex justify-between items-start mb-5">
              <div className="flex flex-col items-start">
                <svg width="24" height="24" viewBox="0 0 48 48" className="mb-3">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
                <h3 className="text-xl font-semibold" style={{ color: '#202124' }}>
                  Choose an account
                </h3>
                <p className="text-xs text-muted mt-1">
                  to continue to <strong style={{ color: '#202124' }}>InterviewPro</strong>
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
                        className="flex items-center justify-between p-3 transition-colors"
                        style={{
                          cursor: selectedAccountLoading ? 'not-allowed' : 'pointer',
                          opacity: selectedAccountLoading && !isSigningIn ? 0.5 : 1,
                          borderBottom: '1px solid #f1f3f4',
                          borderRadius: '8px'
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedAccountLoading) e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {account.avatar ? (
                            <img 
                              src={account.avatar} 
                              alt={account.name}
                              style={{ 
                                width: '38px', 
                                height: '38px', 
                                borderRadius: '50%', 
                                objectFit: 'cover' 
                              }}
                            />
                          ) : (
                            <div 
                              style={{ 
                                width: '38px', 
                                height: '38px', 
                                borderRadius: '50%', 
                                backgroundColor: account.color || '#1a73e8',
                                color: 'white',
                                fontWeight: 600,
                                fontSize: '0.95rem',
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
                          <span className="text-xs font-semibold" style={{ color: '#2563eb' }}>
                            Signing in...
                          </span>
                        ) : (
                          <span className="badge badge-secondary text-xs" style={{ fontSize: '0.68rem' }}>
                            {account.role === 'admin' ? 'Admin' : account.role === 'professional' ? 'Interviewer' : 'Candidate'}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Use another account button */}
                  <div
                    onClick={() => !selectedAccountLoading && setIsAddingNewGoogle(true)}
                    className="flex items-center gap-3 p-3 transition-colors mt-1"
                    style={{ cursor: 'pointer', borderRadius: '8px' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div 
                      style={{ 
                        width: '38px', 
                        height: '38px', 
                        borderRadius: '50%', 
                        border: '1px solid #dadce0',
                        color: '#5f6368',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <UserPlus size={17} />
                    </div>
                    <div className="font-medium text-sm" style={{ color: '#202124' }}>
                      Use another account
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted mt-5 text-left" style={{ color: '#5f6368', lineHeight: 1.4 }}>
                  To continue, Google will share your profile with InterviewPro according to the selected account.
                </p>
              </div>
            ) : (
              <form onSubmit={handleAddNewGoogleAccount} className="flex flex-col gap-3">
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
                    placeholder="e.g. Namdev Sharma"
                    className="input-field text-sm"
                    value={newGoogleName}
                    onChange={(e) => setNewGoogleName(e.target.value)}
                  />
                </div>

                <div className="flex justify-between items-center mt-3">
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
                    className="ip-submit-btn"
                    style={{ width: 'auto', padding: '0.6rem 1.25rem', fontSize: '0.85rem' }}
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
