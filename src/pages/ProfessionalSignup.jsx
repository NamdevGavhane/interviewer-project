import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import apiClient from '../utils/apiClient';

// Define Field component OUTSIDE the page component so inputs keep focus
const Field = ({ label, required, error, children, hint }) => (
  <div style={{ marginBottom: '1.25rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {hint && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{hint}</span>}
    </div>
    {children}
    {error && (
      <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#ef4444' }}>
        {error}
      </p>
    )}
  </div>
);

const inputStyle = {
  width: '100%',
  padding: '0.8rem 1rem',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  color: '#1e293b',
  backgroundColor: '#ffffff'
};

const handleInputFocus = (e) => {
  e.target.style.borderColor = '#4f46e5';
  e.target.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.15)';
};

const handleInputBlur = (e) => {
  e.target.style.borderColor = '#cbd5e1';
  e.target.style.boxShadow = 'none';
};

const ProfessionalSignup = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    designation: '',
    experience: '',
    domain: '',
    linkedin: '',
    bio: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errors.name = 'Full name must be at least 2 characters.';
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      errors.email = 'Please provide a valid work email address.';
    }

    if (!formData.password || formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }

    if (!formData.company.trim()) {
      errors.company = 'Company is required.';
    }

    if (!formData.designation.trim()) {
      errors.designation = 'Designation is required.';
    }

    if (!formData.experience.trim()) {
      errors.experience = 'Experience is required.';
    }

    // Client-side LinkedIn check: must be https and on linkedin.com or subdomain
    if (!formData.linkedin.trim()) {
      errors.linkedin = 'LinkedIn profile URL is required.';
    } else {
      try {
        const parsed = new URL(formData.linkedin.trim());
        const host = parsed.hostname.toLowerCase();
        const isValidHost = host === 'linkedin.com' || host === 'www.linkedin.com' || host.endsWith('.linkedin.com');
        if (parsed.protocol !== 'https:' || !isValidHost) {
          errors.linkedin = 'LinkedIn URL must start with https:// and belong to linkedin.com.';
        }
      } catch {
        errors.linkedin = 'Please enter a valid URL (e.g. https://www.linkedin.com/in/username).';
      }
    }

    if (formData.bio && formData.bio.length > 500) {
      errors.bio = 'Bio cannot exceed 500 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        company: formData.company.trim(),
        designation: formData.designation.trim(),
        experience: formData.experience.trim(),
        domain: formData.domain.trim() || undefined,
        linkedin: formData.linkedin.trim(),
        bio: formData.bio.trim() || undefined
      };

      const response = await apiClient.post('/api/users/register-professional', payload);
      setSubmittedEmail(response?.data?.email || formData.email.trim().toLowerCase());
      setIsSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit application. Please review the form and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 20%, #1e1b4b 0%, #090d16 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2.5rem 1rem',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: '#ffffff',
        borderRadius: '24px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.15)'
      }}>
        {/* Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          padding: '2.5rem 2rem 2rem',
          textAlign: 'center',
          color: 'white'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.16)',
            backdropFilter: 'blur(10px)',
            padding: '6px 14px',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '14px'
          }}>
            <ShieldCheck size={16} />
            <span>Interviewer Onboarding</span>
          </div>

          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Become an Interviewer
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#e0e7ff', opacity: 0.9 }}>
            Join our expert panel to conduct mock interviews and mentor aspiring engineers.
          </p>
        </div>

        {/* Content Area */}
        <div style={{ padding: '2.25rem 2rem' }}>
          {isSubmitted ? (
            /* Confirmation Screen */
            <div style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#ecfdf5',
                color: '#059669',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem'
              }}>
                <CheckCircle2 size={36} />
              </div>

              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>
                Application Received!
              </h2>

              <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                Thank you for applying. We have registered your application under{' '}
                <strong style={{ color: '#1e293b' }}>{submittedEmail}</strong>.
              </p>

              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'left',
                marginBottom: '1.75rem',
                fontSize: '0.85rem',
                color: '#334155',
                lineHeight: 1.6
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Profile Review:</strong> An administrator will review your background, company experience, and credentials.
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Decision Notification:</strong> Our decision will be emailed to your inbox (remember to check your spam/junk folder as well).
                </div>
                <div>
                  <strong>Account Access:</strong> You will be able to sign in to the platform only after your application has been approved.
                </div>
              </div>

              <div style={{
                fontSize: '0.8rem',
                color: '#64748b',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '1.75rem',
                lineHeight: 1.5
              }}>
                <strong>Re-application hint:</strong> If you were previously rejected, you can apply again using the same email address and password once your waiting period has elapsed.
              </div>

              <Link
                to="/professional/login"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
                }}
              >
                <span>Go to Interviewer Login</span>
                <ArrowRight size={18} />
              </Link>
            </div>
          ) : (
            /* Signup Form */
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '0.85rem',
                  color: '#b91c1c',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  lineHeight: 1.4
                }}>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Full Name */}
              <Field label="Full Name" required error={fieldErrors.name}>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </Field>

              {/* Work Email */}
              <Field label="Work Email Address" required error={fieldErrors.email}>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="name@company.com"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </Field>

              {/* Password */}
              <Field label="Password" required error={fieldErrors.password} hint="Min 8 characters">
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    placeholder="Create a strong password"
                    style={{ ...inputStyle, paddingRight: '2.75rem' }}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
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
              </Field>

              {/* Company & Designation in 2-column layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Field label="Current Company" required error={fieldErrors.company}>
                  <input
                    type="text"
                    required
                    value={formData.company}
                    onChange={(e) => handleChange('company', e.target.value)}
                    placeholder="e.g. Google"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </Field>

                <Field label="Designation" required error={fieldErrors.designation}>
                  <input
                    type="text"
                    required
                    value={formData.designation}
                    onChange={(e) => handleChange('designation', e.target.value)}
                    placeholder="e.g. Staff SWE"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </Field>
              </div>

              {/* Experience & Domain */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Field label="Experience" required error={fieldErrors.experience}>
                  <input
                    type="text"
                    required
                    value={formData.experience}
                    onChange={(e) => handleChange('experience', e.target.value)}
                    placeholder="e.g. 7+ years"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </Field>

                <Field label="Domain / Tech Area" error={fieldErrors.domain} hint="Optional">
                  <input
                    type="text"
                    value={formData.domain}
                    onChange={(e) => handleChange('domain', e.target.value)}
                    placeholder="e.g. Backend, Distributed"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </Field>
              </div>

              {/* LinkedIn URL */}
              <Field label="LinkedIn Profile URL" required error={fieldErrors.linkedin} hint="Must start with https://">
                <input
                  type="url"
                  required
                  value={formData.linkedin}
                  onChange={(e) => handleChange('linkedin', e.target.value)}
                  placeholder="https://www.linkedin.com/in/username"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </Field>

              {/* Bio */}
              <Field
                label="Professional Bio"
                error={fieldErrors.bio}
                hint={`${formData.bio.length}/500`}
              >
                <textarea
                  rows={3}
                  maxLength={500}
                  value={formData.bio}
                  onChange={(e) => handleChange('bio', e.target.value)}
                  placeholder="Brief overview of your interview experience, mentoring style, or areas of expertise..."
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    minHeight: '80px',
                    fontFamily: 'inherit'
                  }}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </Field>

              {/* Re-application note */}
              <div style={{
                fontSize: '0.78rem',
                color: '#64748b',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '1.25rem'
              }}>
                <strong>Notice:</strong> Previously rejected applicants can apply again using their original password after the 30-day waiting period.
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: 'white',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
                  transition: 'transform 0.15s, opacity 0.15s',
                  opacity: loading ? 0.7 : 1
                }}
              >
                <span>{loading ? 'Submitting Application...' : 'Submit Application'}</span>
                <ArrowRight size={18} />
              </button>

              {/* Footer Links */}
              <div style={{
                marginTop: '1.5rem',
                borderTop: '1px solid #f1f5f9',
                paddingTop: '1rem',
                textAlign: 'center',
                fontSize: '0.85rem',
                color: '#64748b',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div>
                  Already have an interviewer account?{' '}
                  <Link to="/professional/login" style={{ color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}>
                    Sign In here
                  </Link>
                </div>
                <div>
                  Looking to practice interviews as a candidate?{' '}
                  <Link to="/login" style={{ color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}>
                    Candidate Portal
                  </Link>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfessionalSignup;
