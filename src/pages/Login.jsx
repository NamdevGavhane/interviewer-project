import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Bot, 
  Users, 
  BarChart3, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  X, 
  User, 
  Check, 
  Loader2
} from 'lucide-react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import apiClient from '../utils/apiClient';
import './Login.css';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Clean official 4-color Google G icon
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

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
    const savedEmail = localStorage.getItem('devsphere_candidate_email') || localStorage.getItem('interviewpro_candidate_email');
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
        localStorage.setItem('devsphere_candidate_email', email.trim().toLowerCase());
      } else {
        localStorage.removeItem('devsphere_candidate_email');
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
    <div className="ip-page-container">
      {/* Subtle organic background glow / blob */}
      <div className="ip-bg-glow-bottom" />
      <div className="ip-bg-glow-top" />

      {/* Top Header Bar */}
      <header className="ip-top-nav">
        <div className="ip-logo-group">
          <div className="ip-logo-icon">
            <User size={20} className="ip-logo-user-svg" />
          </div>
          <span className="ip-logo-title">
            Dev<span className="ip-logo-title-accent">Sphere</span>
          </span>
        </div>

        <Link 
          to="/professional/login" 
          className="ip-candidates-badge"
          title="Candidate Portal (Click to switch to Interviewer Portal)"
        >
          <User size={15} />
          <span>Only for Candidates</span>
        </Link>
      </header>

      {/* Main Split Section */}
      <main className="ip-main-wrapper">
        <div className="ip-layout-grid">
          {/* LEFT SIDE: Value proposition & features */}
          <section className="ip-left-col" aria-label="Why Choose DevSphere">
            <h1 className="ip-hero-headline">
              Level Up Your<br />Interview Skills
            </h1>

            <p className="ip-hero-description">
              Practice with AI, get expert feedback,<br />and land your dream job.
            </p>

            <div className="ip-features-stack">
              <div className="ip-feature-item">
                <div className="ip-feature-icon-container">
                  <Bot size={22} />
                </div>
                <span className="ip-feature-label">AI Mock Interviews</span>
              </div>

              <div className="ip-feature-item">
                <div className="ip-feature-icon-container">
                  <Users size={22} />
                </div>
                <span className="ip-feature-label">Expert Guidance</span>
              </div>

              <div className="ip-feature-item">
                <div className="ip-feature-icon-container">
                  <BarChart3 size={22} />
                </div>
                <span className="ip-feature-label">Detailed Feedback</span>
              </div>

              <div className="ip-feature-item">
                <div className="ip-feature-icon-container">
                  <TrendingUp size={22} />
                </div>
                <span className="ip-feature-label">Career Progress</span>
              </div>
            </div>

            {/* Handwritten cursive tagline with underline */}
            <div className="ip-handwritten-note">
              <span className="ip-cursive-text">Your growth matters</span>
              <svg 
                className="ip-cursive-underline" 
                viewBox="0 0 150 20" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path 
                  d="M 5 11 Q 75 18 145 7" 
                  stroke="#2563eb" 
                  strokeWidth="2.4" 
                  strokeLinecap="round" 
                />
              </svg>
            </div>
          </section>

          {/* RIGHT SIDE: Authentication Form Card */}
          <section className="ip-right-col" aria-label="Sign In Area">
            <div className="ip-card">
              <div className="ip-card-header">
                <h2 className="ip-card-title">
                  {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="ip-card-subtitle">
                  {isLogin 
                    ? 'Sign in to continue your journey' 
                    : 'Sign up to continue your journey'}
                </p>
              </div>

              {error && (
                <div className="ip-alert ip-alert-error" role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={16} className="ip-alert-icon" />
                    <span>{error}</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setError('')} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '2px', display: 'flex', alignItems: 'center' }}
                    title="Dismiss"
                    aria-label="Dismiss message"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {successMessage && (
                <div className="ip-alert ip-alert-success" role="status">
                  <CheckCircle2 size={16} className="ip-alert-icon" />
                  <span>{successMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="ip-form">
                {!isLogin && (
                  <div className="ip-form-group">
                    <label className="ip-label" htmlFor="fullName">Full Name</label>
                    <div className="ip-input-box">
                      <User size={18} className="ip-input-leading-icon" />
                      <input 
                        id="fullName"
                        type="text"
                        name="name"
                        placeholder="Enter your full name"
                        className="ip-text-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="ip-form-group">
                  <label className="ip-label" htmlFor="emailAddress">Email address</label>
                  <div className="ip-input-box">
                    <Mail size={18} className="ip-input-leading-icon" />
                    <input 
                      id="emailAddress"
                      type="email"
                      name="email"
                      placeholder="Enter your email address"
                      className="ip-text-input"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="ip-form-group">
                  <label className="ip-label" htmlFor="password">Password</label>
                  <div className="ip-input-box">
                    <Lock size={18} className="ip-input-leading-icon" />
                    <input 
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      placeholder="Enter your password"
                      className="ip-text-input ip-text-input-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError('');
                      }}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      required
                    />
                    <button
                      type="button"
                      className="ip-eye-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {isLogin && (
                  <div className="ip-remember-row">
                    <label className="ip-checkbox-container">
                      <input 
                        type="checkbox"
                        className="ip-real-checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span className="ip-remember-text">Remember me</span>
                    </label>

                    <button
                      type="button"
                      className="ip-forgot-password-link"
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
                  className="ip-btn-submit"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="ip-loading-content">
                      <Loader2 size={18} className="ip-spin" />
                      <span>Processing...</span>
                    </span>
                  ) : (
                    <>
                      <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>

                <div className="ip-or-separator">
                  <span className="ip-separator-line" />
                  <span className="ip-separator-text">or</span>
                  <span className="ip-separator-line" />
                </div>

                {/* Google Sign-in */}
                {googleClientId ? (
                  <div className="ip-google-container">
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
                  <button
                    type="button"
                    className="ip-google-button"
                    onClick={(e) => {
                      if (email.trim() && password) {
                        handleSubmit(e);
                      } else {
                        setError('Please enter your email and password above to sign in.');
                        setTimeout(() => setError(''), 4000);
                      }
                    }}
                  >
                    <GoogleIcon />
                    <span>Continue with Google</span>
                  </button>
                )}
              </form>

              <div className="ip-switch-auth-row">
                <span>{isLogin ? "Don't have an account?" : "Already have an account?"}</span>
                <button
                  type="button"
                  className="ip-switch-action-btn"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError('');
                    setSuccessMessage('');
                  }}
                >
                  {isLogin ? 'Create account' : 'Sign in'}
                </button>
              </div>

              <div className="ip-pro-interviewer-sublink">
                <span>Interviewer or Admin? </span>
                <Link to="/professional/login" className="ip-pro-sublink-anchor">
                  Professional Portal Sign In →
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Forgot Password Modal */}
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
                  className="ip-btn-submit"
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
                  <label className="ip-label">Email Address</label>
                  <div className="ip-input-box">
                    <Mail size={18} className="ip-input-leading-icon" />
                    <input 
                      type="email" 
                      className="ip-text-input" 
                      placeholder="Enter your email address"
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
                    className="ip-btn-submit flex-1"
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
