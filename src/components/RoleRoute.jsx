import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';

const RoleRoute = ({ allowedRoles = [], children }) => {
  const { user, role, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
        <Loader2 className="animate-spin text-primary" size={36} />
        <span className="text-sm text-muted">Checking role permissions...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '2rem', textAlign: 'center' }} className="card">
        <ShieldAlert size={48} className="text-danger" style={{ margin: '0 auto 1rem' }} />
        <h2 className="text-xl font-bold mb-2">Access Restricted</h2>
        <p className="text-muted text-sm mb-4">
          This section requires <strong>{allowedRoles.join(' or ')}</strong> privileges. Your current account role is <strong>{role}</strong>.
        </p>
        <button onClick={() => window.location.href = '/'} className="btn btn-primary" style={{ margin: '0 auto' }}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  return children;
};

export default RoleRoute;
