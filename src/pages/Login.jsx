import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
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
  X, 
  User, 
  Check, 
  Briefcase,
  Loader2,
  Info
} from 'lucide-react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import apiClient from '../utils/apiClient';
import './Login.css';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

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

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, loginWithGoogle, register, isAuthenticated, role } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      if (role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    }
  }, [isAuthenticated, role, navigate]);

  // Notice for expired session
  useEffect(() => {
    if (searchParams.get('expired')) {
      setError('Your session has expired. Please sign in again.');
    }
  }, [searchParams]);

  // Load remembered candidate email
  useEffect(() => {
    const savedEmail = localStorage.getItem('interviewpro_candidate_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
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
      if (rememberMe) {
        localStorage.setItem('interviewpro_candidate_email', email.trim().toLowerCase());
      } else {
        localStorage.removeItem('interviewpro_candidate_email');
      }

      if (isLogin) {
        const res = await login(email.trim().toLowerCase(), password);
        const userRole = res?.data?.user?.role;
        if (userRole === 'admin') {
          navigate('/admin');
        } else {
          navigate('/');
        }
      } else {
        const res = await register({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password
        });
        setSuccessMessage(res.message || 'Account created successfully! Signing in...');
        const userRole = res?.data?.user?.role;
        if (userRole === 'admin') {
          navigate('/admin');
        } else {
          navigate('/');
        }
      }
    } catch (err) {
      setError(err.message || (isLogin ? 'Failed to sign in' : 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  // Real Google OAuth Success Handler
  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    try {
      setLoading(true);
      if (!credentialResponse?.credential) {
        throw new Error('No credential received from Google.');
      }
      const res = await loginWithGoogle(credentialResponse.credential);
      const userRole = res?.data?.user?.role;
      if (userRole === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleFailure = () => {
    setError('Google Sign-In failed or was cancelled. Please try again or use standard credentials.');
  };

  // Forgot Password Submit
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotStatus({ sent: false, loading: true });
    try {
      await apiClient.post('/api/users/forgot-password', { email: forgotEmail.trim().toLowerCase() });
      setForgotStatus({ sent: true, loading: false });
    } catch (err) {
      setError(err.message || 'Failed to request password reset link.');
      setForgotStatus({ sent: false, loading: false });
      setShowForgotModal(false);
    }
  };

  return (
    <div className="ip-login-page">
      {/* 1. LEFT HERO SECTION */}
      <section className="ip-left-section" aria-label="Platform Highlights">
        <div className="ip-left-content">
          <div className="ip-brand-row">
            <div className="ip-brand-icon">
              <Bot size={22} />
            </div>
            <span className="ip-brand-name">InterviewPro</span>
          </div>

          <h1 className="ip-hero-heading">
            Master Technical Interviews with Confidence
          </h1>

          <p className="ip-supporting-text">
            Ace your interviews with AI-powered mock interviews and connect with industry experts.
          </p>

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

      {/* 2. RIGHT FORM SECTION */}
      <section className="ip-right-section" aria-label="Sign In Form">
        <div className="ip-login-card">
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

          <form onSubmit={handleSubmit} noValidate>
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

            <div className="ip-form-group">
              <label className="ip-form-label" htmlFor="loginPassword">Password</label>
              <div className="ip-input-container">
                <Lock size={18} className="ip-input-icon" />
                <input 
                  id="loginPassword"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password (min 8 characters)"
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

            <button
              type="submit"
              className="ip-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <Loader2 size={18} className="animate-spin" />
                  <span>Processing...</span>
                </span>
              ) : (
                <>
                  <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>

            <div className="ip-divider">
              <span className="ip-divider-line" />
              <span className="ip-divider-text">or</span>
              <span className="ip-divider-line" />
            </div>

            {/* Real Google OAuth Login */}
            {googleClientId ? (
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '0.25rem' }}>
                <GoogleOAuthProvider clientId={googleClientId}>
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleFailure}
                    theme="outline"
                    size="large"
                    shape="rectangular"
                    text={isLogin ? "signin_with" : "signup_with"}
                    width="100%"
                  />
                </GoogleOAuthProvider>
              </div>
            ) : (
              <div style={{
                background: '#f8fafc',
                border: '1px dashed #cbd5e1',
                padding: '0.65rem 1rem',
                borderRadius: '10px',
                fontSize: '0.75rem',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                lineHeight: 1.4
              }}>
                <Info size={16} className="text-primary flex-shrink-0" />
                <span>Google OAuth requires <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code>. Sign in with email above.</span>
              </div>
            )}
          </form>

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

          <div className="ip-pro-link-wrapper">
            <span>Interviewer or Admin? </span>
            <Link to="/professional/login" className="ip-pro-link">
              <Briefcase size={13} />
              <span>Professional Portal Sign In →</span>
            </Link>
          </div>
        </div>
      </section>

      {/* MODAL: FORGOT PASSWORD */}
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
                  If an account exists for <strong>{forgotEmail}</strong>, password reset instructions have been dispatched.
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
                  Enter your registered email address and we will provide you with a secure password reset link.
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
    </div>
  );
};

export default Login;
