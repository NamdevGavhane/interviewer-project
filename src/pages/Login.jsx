import { Eye, X, UserPlus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const DEFAULT_GOOGLE_ACCOUNTS = [
  {
    name: 'Shushant Gaikwad',
    email: 'shushant@example.com',
    role: 'professional',
    initial: 'S',
    color: '#1a73e8', // Google Blue
    avatar: '/shushant-gaikwad.png',
  },
  {
    name: 'Raju Bojane',
    email: 'raju@example.com',
    role: 'professional',
    initial: 'R',
    color: '#8b5cf6', // Purple
    avatar: '/raju-bojane.png',
  },
  {
    name: 'Namdev Sharma',
    email: 'namdev.sharma@gmail.com',
    role: 'candidate',
    initial: 'N',
    color: '#1a73e8', // Google Blue
  },
  {
    name: 'Namdev Gavhane',
    email: 'namdevgavhane41@gmail.com',
    role: 'admin',
    initial: 'A',
    color: '#ef4444', // Admin Red
    avatar: '/namdev-admin.jpg'
  }
];

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: 'namdev.sharma@gmail.com',
    password: 'password123',
    role: 'candidate'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      ? 'http://localhost:5000/api/users/login' 
      : 'http://localhost:5000/api/users/register';
      
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(isLogin ? {
          email: formData.email,
          password: formData.password
        } : formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }

      localStorage.setItem('userId', data.userId);
      localStorage.setItem('userRole', data.role);
      if (data.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        setError('Cannot connect to backend server. Please verify the backend is running on port 5000 (run: cd backend && npm run dev).');
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

      const response = await fetch('http://localhost:5000/api/users/google-login', {
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
      setShowGoogleModal(false);
      navigate('/');
    } catch (err) {
      if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
        setError('Cannot connect to backend server. Please verify the backend is running on port 5000 (run: cd backend && npm run dev).');
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
      role: 'candidate',
      initial,
      color
    };

    // Update state and localStorage
    const updatedList = [newAccount, ...googleAccounts.filter(a => a.email !== email)];
    setGoogleAccounts(updatedList);
    localStorage.setItem('interviewpro_google_accounts', JSON.stringify(updatedList));

    // Sign in immediately
    handleSelectGoogleAccount(newAccount);
  };

  return (
    <div className="flex h-full w-full" style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      {/* Left side - Login Form */}
      <div className="flex-1 flex flex-col justify-center px-12" style={{ backgroundColor: 'white' }}>
        <div style={{ maxWidth: '400px', margin: '0 auto', width: '100%' }}>
          <div className="flex items-center gap-2 mb-8">
            <div style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '8px', fontWeight: 'bold' }}>IP</div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--primary)' }}>InterviewPro</h1>
          </div>

          <h2 className="text-2xl font-bold mb-2">
            {isLogin ? 'Welcome Back' : 'Create an Account'}
          </h2>
          <p className="text-muted mb-8 text-sm">
            {isLogin ? 'Sign in to continue your journey' : 'Join us to start your interview journey'}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded text-sm" style={{ backgroundColor: 'rgba(234, 67, 53, 0.1)', color: 'var(--danger)', border: '1px solid rgba(234, 67, 53, 0.2)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <>
                <div className="input-group">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    name="name"
                    placeholder="Enter your name" 
                    className="input-field" 
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                
                <div className="input-group">
                  <label>Role</label>
                  <select 
                    name="role" 
                    className="input-field"
                    value={formData.role}
                    onChange={handleInputChange}
                  >
                    <option value="candidate">Candidate (Interviewee)</option>
                    <option value="professional">Professional (Interviewer)</option>
                  </select>
                </div>
              </>
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
            
            <div className="input-group mb-6">
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
              className="btn btn-primary w-full mb-4" 
              style={{ padding: '0.75rem' }}
              disabled={loading}
            >
              {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
            </button>

            <div className="flex items-center gap-4 mb-4" style={{ margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
              <span className="text-muted text-sm">or</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }}></div>
            </div>

            <div className="flex flex-col gap-3">
              {/* Working Continue with Google button */}
              <button 
                type="button" 
                className="btn btn-outline w-full flex items-center justify-center gap-3" 
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

              {/* Continue with GitHub */}
              <button 
                type="button" 
                className="btn btn-outline w-full flex items-center justify-center gap-2" 
                style={{ padding: '0.75rem' }}
                onClick={() => handleSelectGoogleAccount({
                  name: 'GitHub Developer',
                  email: 'dev@github.com',
                  role: 'candidate',
                  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80'
                })}
              >
                <img src="https://cdn-icons-png.flaticon.com/512/733/733553.png" alt="GitHub" style={{ width: '18px' }} />
                <span>Continue with GitHub</span>
              </button>
            </div>
          </form>

          <p className="text-center text-sm text-muted mt-8">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span 
              className="font-semibold" 
              style={{ color: 'var(--primary)', cursor: 'pointer' }}
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </span>
          </p>
        </div>
      </div>

      {/* Right side - Illustration */}
      <div className="flex-1 hidden lg:flex flex-col items-center justify-center p-12" style={{ backgroundColor: '#f0f4f8' }}>
        <img 
          src="https://images.unsplash.com/photo-1516321497487-e288fb19713f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
          alt="Illustration" 
          style={{ maxWidth: '80%', borderRadius: 'var(--radius-lg)' }} 
        />
        <div className="text-center mt-8" style={{ maxWidth: '400px' }}>
          <h2 className="text-2xl font-bold mb-4">Practice. Improve.<br/>Get Hired.</h2>
          <p className="text-muted">
            Mock interviews with industry professionals. Build your confidence and land your dream job.
          </p>
        </div>
      </div>

      {/* Authentic Google Account Chooser Modal */}
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
                <h3 className="font-bold text-2xl" style={{ color: '#202124', fontFamily: 'Roboto, Arial, sans-serif', letterSpacing: '-0.5px' }}>
                  Choose an account
                </h3>
                <p className="text-sm mt-1" style={{ color: '#5f6368' }}>
                  to continue to <strong style={{ color: '#202124' }}>InterviewPro</strong>
                </p>
              </div>

              <button 
                onClick={() => setShowGoogleModal(false)} 
                className="text-gray-400 hover:text-gray-700 p-1"
                disabled={Boolean(selectedAccountLoading)}
              >
                <X size={20} />
              </button>
            </div>

            {/* Account List View */}
            {!isAddingNewGoogle ? (
              <div className="flex flex-col">
                <div className="flex flex-col" style={{ borderTop: '1px solid #e0e0e0' }}>
                  {googleAccounts.map((account) => {
                    const isSigningIn = selectedAccountLoading === account.email;
                    return (
                      <div
                        key={account.email}
                        onClick={() => !selectedAccountLoading && handleSelectGoogleAccount(account)}
                        className="flex items-center justify-between p-3.5 transition-colors"
                        style={{
                          cursor: selectedAccountLoading ? 'default' : 'pointer',
                          borderBottom: '1px solid #e0e0e0',
                          backgroundColor: isSigningIn ? '#e8f0fe' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedAccountLoading) e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSigningIn) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div className="flex items-center gap-3.5">
                          {/* Circular Google Account Avatar */}
                          {account.avatar ? (
                            <img 
                              src={account.avatar} 
                              alt={account.name} 
                              style={{ 
                                width: '40px', 
                                height: '40px', 
                                borderRadius: '50%', 
                                objectFit: 'cover',
                                flexShrink: 0,
                                border: '1px solid rgba(0,0,0,0.1)'
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
                                fontWeight: 600,
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
                            {account.role === 'professional' ? 'Interviewer' : 'Signed in'}
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

                {/* Footer text */}
                <p className="text-xs text-muted mt-6 text-left" style={{ color: '#5f6368', lineHeight: 1.4 }}>
                  To continue, Google will share your name, email address, language preference, and profile picture with InterviewPro.
                </p>
              </div>
            ) : (
              /* "Use another account" Form View */
              <form onSubmit={handleAddNewGoogleAccount} className="flex flex-col gap-4">
                <p className="text-sm font-medium" style={{ color: '#202124' }}>
                  Sign in with your Google Account
                </p>

                <div className="input-group">
                  <label className="text-xs font-medium">Email or phone</label>
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
                  <label className="text-xs font-medium">Your Name (optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Namdev"
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
                    Next
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
