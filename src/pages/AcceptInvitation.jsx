import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, Briefcase, Building, Clock, ArrowRight, Lock, KeyRound } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

const AcceptInvitation = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [invitationData, setInvitationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Password setup form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No invitation token found in link. Please use the complete link from your invitation email.');
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`${API_BASE_URL}/api/users/invitation/${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || 'Invitation is invalid or has expired.');
        }

        setInvitationData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long for security.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter both passwords carefully.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/api/users/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to set password.');
      }

      setSubmitSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #0f172a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        background: '#ffffff',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        {/* Header Ribbon */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          padding: '2.25rem 2rem 2rem',
          color: 'white',
          textAlign: 'center',
          position: 'relative'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(8px)',
            padding: '6px 14px',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '12px'
          }}>
            <ShieldCheck size={16} />
            <span>Admin-Accredited Invitation</span>
          </div>

          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Professional Interviewer Setup
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#e0e7ff', opacity: 0.9 }}>
            InterviewPro Senior Mock Interview Panel
          </p>
        </div>

        {/* Content Body */}
        <div style={{ padding: '2rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#64748b' }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid #e2e8f0',
                borderTopColor: '#4f46e5',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 1rem'
              }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>Validating secure invitation token...</p>
            </div>
          ) : error && !invitationData ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem'
              }}>
                <AlertCircle size={30} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                Invalid or Expired Link
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                {error}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <Link to="/login" style={{
                  textDecoration: 'none',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}>
                  Return to Login
                </Link>
                <Link to="/professional/login" style={{
                  textDecoration: 'none',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '10px',
                  background: '#4f46e5',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}>
                  Professional Login
                </Link>
              </div>
            </div>
          ) : submitSuccess ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem'
              }}>
                <CheckCircle2 size={36} />
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', marginBottom: '8px' }}>
                Password Set Successfully!
              </h2>
              <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Congratulations <strong>{invitationData?.name}</strong>! Your Professional account is now fully verified and activated. You can now log in using your email and the password you just created.
              </p>

              <button
                type="button"
                onClick={() => navigate('/professional/login')}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: '12px',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                }}
              >
                <span>Proceed to Professional Login</span>
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <div>
              {/* Professional Credentials Card */}
              <div style={{
                background: '#f8fafc',
                borderRadius: '16px',
                padding: '1.25rem',
                border: '1px solid #e2e8f0',
                marginBottom: '1.5rem'
              }}>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#4f46e5',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Briefcase size={14} />
                  <span>Invited Professional Profile</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Full Name</span>
                    <strong style={{ color: '#0f172a' }}>{invitationData?.name}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Email Address</span>
                    <strong style={{ color: '#0f172a' }}>{invitationData?.email}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Company</span>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{invitationData?.company || 'N/A'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Designation</span>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{invitationData?.designation || 'Technical Interviewer'}</span>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>Experience</span>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{invitationData?.experience || 'Experienced'}</span>
                  </div>
                </div>
              </div>

              {/* Security Banner: Never send passwords via email */}
              <div style={{
                background: '#eff6ff',
                borderLeft: '4px solid #3b82f6',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '0.8rem',
                color: '#1e40af',
                lineHeight: 1.5,
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}>
                <Lock size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Security Rule:</strong> Passwords are never sent via email. Set your own confidential password below to securely activate your account.
                </span>
              </div>

              {error && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                  color: '#b91c1c',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Set Password Form */}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px'
                  }}>
                    Create Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem 2.5rem 0.75rem 0.85rem',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                      onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Stored securely using industry-standard bcrypt encryption.
                  </span>
                </div>

                <div style={{ marginBottom: '1.75rem' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#334155',
                    marginBottom: '6px'
                  }}>
                    Confirm Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem 2.5rem 0.75rem 0.85rem',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
                      onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: 'white',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                    opacity: submitting ? 0.7 : 1
                  }}
                >
                  <KeyRound size={18} />
                  <span>{submitting ? 'Encrypting & Saving...' : 'Activate Professional Account'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcceptInvitation;
