import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, Mail } from 'lucide-react';
import apiClient from '../utils/apiClient';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ success: false, message: '' });

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setStatus({ success: false, message: 'Missing verification token in link.' });
      return;
    }

    const verify = async () => {
      try {
        const res = await apiClient.get(`/api/users/verify-email/${token}`);
        setStatus({ success: true, message: res.message || 'Email successfully verified!' });
      } catch (err) {
        setStatus({ success: false, message: err.message || 'Verification token invalid or expired.' });
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-color)', padding: '1.5rem' }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '2.5rem' }}>
        <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', backgroundColor: status.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(79, 70, 229, 0.1)', marginBottom: '1.5rem' }}>
          {loading ? (
            <Loader2 className="animate-spin text-primary" size={40} />
          ) : status.success ? (
            <CheckCircle2 className="text-success" size={40} />
          ) : (
            <AlertCircle className="text-danger" size={40} />
          )}
        </div>

        <h2 className="text-2xl font-bold mb-2">
          {loading ? 'Verifying Email...' : status.success ? 'Email Verified!' : 'Verification Failed'}
        </h2>

        <p className="text-muted text-sm mb-6">
          {loading ? 'Validating your verification token with our servers...' : status.message}
        </p>

        {!loading && (
          <Link to="/login" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}>
            Continue to Sign In
          </Link>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
