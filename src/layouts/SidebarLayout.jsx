import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
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
  ShieldCheck
} from 'lucide-react';

const SidebarLayout = () => {
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  const userId = localStorage.getItem('userId');

  useEffect(() => {
    if (!userId) {
      navigate('/login');
      return;
    }

    fetch(`${API_BASE_URL}/api/users/${userId}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(data => setUserData(data))
      .catch(err => {
        console.error(err);
        localStorage.removeItem('userId');
        navigate('/login');
      });
  }, [userId, navigate]);

  const handleLogout = (e) => {
    e.preventDefault();
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    navigate('/login');
  };

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
          <NavLink to="/ai-interview" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <Bot size={18} className="text-primary" />
            <span>AI Mock Interview</span>
            <span className="badge badge-info text-xs" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginLeft: 'auto' }}>AI</span>
          </NavLink>
          <NavLink to="/interviews" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <Calendar size={18} />
            <span>My Interviews</span>
          </NavLink>
          <NavLink to="/booking" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <Users size={18} />
            <span>Book Interview</span>
          </NavLink>
          <NavLink to="/feedback" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <FileText size={18} />
            <span>Feedback Reports</span>
          </NavLink>
          <NavLink to="/payments" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <Receipt size={18} className="text-success" />
            <span>Billing & Invoices</span>
            <span className="badge badge-success text-xs" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginLeft: 'auto' }}>₹ Paid</span>
          </NavLink>
          <NavLink to="/profile" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
            <User size={18} />
            <span>My Profile</span>
          </NavLink>
          {userData?.role === 'admin' && (
            <NavLink to="/admin" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <ShieldCheck size={18} className="text-danger" />
              <span>Admin Console</span>
              <span className="badge badge-danger text-xs" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginLeft: 'auto' }}>Admin</span>
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
            <img 
              src={userData.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80'} 
              alt={userData.name} 
              className="profile-avatar"
              style={{ width: '36px', height: '36px' }}
            />
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
              Live Mongo API Connected 🟢
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button className="btn btn-ghost" style={{ padding: '0.5rem', borderRadius: '50%' }}>
              <Bell size={20} className="text-muted" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{userData?.name || 'Loading...'}</span>
              <img 
                src={userData?.avatar || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80'} 
                alt="User Avatar" 
                className="profile-avatar"
              />
            </div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
};

export default SidebarLayout;
