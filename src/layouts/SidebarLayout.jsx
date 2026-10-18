import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../utils/apiClient';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  User, 
  LogOut,
  Bell,
  FileText,
  Video,
  Bot,
  Receipt,
  ShieldCheck,
  Check,
  CheckCheck,
  Clock,
  Sparkles
} from 'lucide-react';

const SidebarLayout = () => {
  const { user: userData, role: currentRole, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef(null);

  const fetchNotifications = async () => {
    if (!userData) return;
    try {
      const res = await apiClient.get('/api/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (err) {
      // Quiet notice
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 45000); // Poll every 45s
    return () => clearInterval(interval);
  }, [userData]);

  useEffect(() => {
    if (currentRole === 'admin') {
      apiClient.get('/api/admin/stats')
        .then(statData => {
          if (statData?.pendingRequestsCount) {
            setPendingRequestsCount(statData.pendingRequestsCount);
          }
        })
        .catch(() => {});
    }
  }, [currentRole]);

  // Click outside listener for notification dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id, link) => {
    try {
      await apiClient.patch(`/api/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
      if (link) {
        setShowNotifDropdown(false);
        navigate(link);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.patch('/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async (e) => {
    e.preventDefault();
    await logout();
  };

  const isCandidate = currentRole === 'candidate';

  const userInitials = userData?.name
    ? userData.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'IP';

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="flex items-center gap-2 mb-4" style={{ padding: '0 0.5rem' }}>
          <div style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '0.3rem 0.6rem', borderRadius: '8px', fontWeight: 'bold' }}>IP</div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--primary)', lineHeight: 1.2 }}>InterviewPro</h1>
            <span className="text-xs text-muted">Mock Prep & Live Calls</span>
          </div>
        </div>

        <nav className="sidebar-nav" style={{ flex: 1 }}>
          <NavLink to="/" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'} end>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>
          {isCandidate && (
            <NavLink to="/ai-interview" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <Bot size={18} className="text-primary" />
              <span>AI Mock Interview</span>
              <span className="badge badge-info text-xs" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginLeft: 'auto' }}>AI</span>
            </NavLink>
          )}
          <NavLink to="/interviews" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <Calendar size={18} />
            <span>My Interviews</span>
          </NavLink>
          {isCandidate && (
            <NavLink to="/booking" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <Users size={18} />
              <span>Book Interview</span>
            </NavLink>
          )}
          {isCandidate && (
            <NavLink to="/feedback" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <FileText size={18} />
              <span>Feedback Reports</span>
            </NavLink>
          )}
          <NavLink to="/payments" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <Receipt size={18} className="text-success" />
            <span>{currentRole === 'professional' ? 'Earnings & Payouts' : 'Billing & Invoices'}</span>
            <span className="badge badge-success text-xs" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginLeft: 'auto' }}>
              {currentRole === 'professional' ? '₹ Earned' : '₹ Paid'}
            </span>
          </NavLink>
          <NavLink to="/profile" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <User size={18} />
            <span>My Profile</span>
          </NavLink>
          {currentRole === 'admin' && (
            <NavLink to="/admin" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <ShieldCheck size={18} className="text-danger" />
              <span>Admin Console</span>
              {pendingRequestsCount > 0 ? (
                <span className="badge badge-warning text-xs font-bold" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginLeft: 'auto', backgroundColor: '#f59e0b', color: 'white' }}>
                  {pendingRequestsCount} Req
                </span>
              ) : (
                <span className="badge badge-danger text-xs" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginLeft: 'auto' }}>Admin</span>
              )}
            </NavLink>
          )}
          <NavLink to="/room" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <Video size={18} />
            <span>Test Video Room</span>
          </NavLink>
        </nav>

        {/* User Card in Sidebar Bottom */}
        {userData && (
          <div className="p-3 rounded-xl border mb-3 flex items-center gap-3" style={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--border)' }}>
            <div 
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                color: 'white',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem'
              }}
            >
              {userInitials}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div className="text-xs font-bold" style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{userData.name}</div>
              <span className={`badge ${userData.role === 'admin' ? 'badge-danger' : userData.role === 'professional' ? 'badge-info' : 'badge-success'}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                {userData.role}
              </span>
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <a href="#" onClick={handleLogout} className="nav-item" style={{ color: 'var(--danger)' }}>
            <LogOut size={18} />
            <span>Logout</span>
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="header">
          <div className="flex items-center gap-3">
            <span className="badge badge-secondary text-xs">
              Live Database Connected 🟢
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* Notification Bell Dropdown */}
            <div className="relative" ref={notifRef}>
              <button 
                type="button"
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                className="btn btn-ghost relative" 
                style={{ padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}
                title="Notifications"
              >
                <Bell size={20} className={unreadCount > 0 ? 'text-primary' : 'text-muted'} />
                {unreadCount > 0 && (
                  <span 
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      fontSize: '0.65rem',
                      fontWeight: 'bold',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Flyout Menu */}
              {showNotifDropdown && (
                <div 
                  style={{
                    position: 'absolute',
                    top: '110%',
                    right: 0,
                    width: '320px',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px -5px rgba(0,0,0,0.2)',
                    border: '1px solid #e2e8f0',
                    zIndex: 1000,
                    overflow: 'hidden'
                  }}
                >
                  <div className="p-3 border-b flex justify-between items-center bg-slate-50">
                    <span className="font-bold text-xs text-slate-800">Notifications</span>
                    {unreadCount > 0 && (
                      <button 
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-1"
                      >
                        <CheckCheck size={13} />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>

                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div 
                          key={n._id}
                          onClick={() => handleMarkAsRead(n._id, n.link)}
                          className={`p-3 border-b text-xs cursor-pointer transition-colors hover:bg-slate-50 ${!n.isRead ? 'bg-blue-50/40' : ''}`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span className={`font-semibold ${!n.isRead ? 'text-primary' : 'text-slate-800'}`}>
                              {n.title}
                            </span>
                            {!n.isRead && (
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)', marginTop: '4px' }}></span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{n.message}</p>
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{userData?.name || 'User'}</span>
              <div 
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem'
                }}
              >
                {userInitials}
              </div>
            </div>
            <button 
              onClick={handleLogout} 
              className="btn text-xs flex items-center gap-1.5"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Logout from your account"
            >
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
};

export default SidebarLayout;
