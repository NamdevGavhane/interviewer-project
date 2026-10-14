import { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Calendar, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Search, 
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Shield,
  Clock,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';

const AdminDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'users'; // 'users' | 'verify' | 'bookings'

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, usersRes, bookingsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/stats`),
        fetch(`${API_BASE_URL}/api/admin/users`),
        fetch(`${API_BASE_URL}/api/admin/bookings`)
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (bookingsRes.ok) setBookings(await bookingsRes.json());
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update User Role
  const handleRoleChange = async (userId, newRole) => {
    try {
      setActionLoading(`role_${userId}`);
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        showToast(`User role updated to ${newRole}`);
        await fetchData();
      }
    } catch (err) {
      alert('Failed to update role: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle Verify Professional
  const handleToggleVerify = async (userId, currentStatus) => {
    try {
      setActionLoading(`verify_${userId}`);
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVerified: !currentStatus })
      });
      if (res.ok) {
        showToast(`Professional ${!currentStatus ? 'Verified ✅' : 'Unverified ⚠️'}`);
        await fetchData();
      }
    } catch (err) {
      alert('Failed to toggle verification: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete User
  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"? This cannot be undone.`)) return;
    try {
      setActionLoading(`del_${userId}`);
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast(`User "${userName}" deleted successfully`);
        await fetchData();
      }
    } catch (err) {
      alert('Failed to delete user: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Update Booking Status
  const handleBookingStatus = async (bookingId, newStatus) => {
    try {
      setActionLoading(`book_${bookingId}`);
      const res = await fetch(`${API_BASE_URL}/api/admin/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast(`Booking status changed to ${newStatus}`);
        await fetchData();
      }
    } catch (err) {
      alert('Failed to update booking status: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter(u => {
    const matchesSearch = searchQuery === '' || 
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.company?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Professionals for verification tab
  const professionals = users.filter(u => u.role === 'professional');

  // Filtered Bookings
  const filteredBookings = bookings.filter(b => {
    if (bookingStatusFilter === 'all') return true;
    return b.status === bookingStatusFilter;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#1e293b',
          color: 'white',
          padding: '0.85rem 1.5rem',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontWeight: 500
        }}>
          <CheckCircle size={18} className="text-success" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge badge-info text-xs font-semibold uppercase">Admin Module</span>
            <span className="text-xs text-muted">Platform Administration</span>
          </div>
          <h2 className="text-2xl font-bold mt-1">InterviewPro Admin Console</h2>
          <p className="text-muted text-sm">Manage registered users, review & verify professionals, and oversee interview bookings.</p>
        </div>
        <button 
          onClick={fetchData} 
          className="btn btn-outline text-xs flex items-center gap-1.5"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Top Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          <div className="card p-4">
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Total Users</span>
              <Users size={16} className="text-primary" />
            </div>
            <div className="text-2xl font-bold mt-2">{stats.totalUsers}</div>
            <div className="text-xs text-muted mt-1">{stats.candidatesCount} Candidates • {stats.professionalsCount} Professionals</div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Verified Professionals</span>
              <ShieldCheck size={16} className="text-success" />
            </div>
            <div className="text-2xl font-bold mt-2 text-success">{stats.verifiedProfessionalsCount} / {stats.professionalsCount}</div>
            <div className="text-xs text-muted mt-1">Official verified interviewer badges</div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Total Bookings</span>
              <Calendar size={16} className="text-primary" />
            </div>
            <div className="text-2xl font-bold mt-2">{stats.totalBookings}</div>
            <div className="text-xs text-muted mt-1">{stats.completedBookings} Completed • {stats.scheduledBookings} Scheduled</div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Platform Volume</span>
              <DollarSign size={16} className="text-success" />
            </div>
            <div className="text-2xl font-bold mt-2 text-primary">₹{stats.totalVolume.toLocaleString()}</div>
            <div className="text-xs text-muted mt-1">Platform Revenue: ₹{stats.platformRevenue}</div>
          </div>
        </div>
      )}

      {/* Module Navigation Tabs */}
      <div className="tabs-container mb-6">
        <button 
          className={`tab-button ${currentTab === 'users' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'users' })}
        >
          <Users size={16} style={{ display: 'inline', marginRight: '6px' }} />
          Manage Users ({users.length})
        </button>
        <button 
          className={`tab-button ${currentTab === 'verify' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'verify' })}
        >
          <ShieldCheck size={16} style={{ display: 'inline', marginRight: '6px' }} />
          Verify Professionals ({professionals.length})
        </button>
        <button 
          className={`tab-button ${currentTab === 'bookings' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'bookings' })}
        >
          <Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />
          Manage Bookings ({bookings.length})
        </button>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-muted">
          Loading Admin Module data from database...
        </div>
      ) : currentTab === 'users' ? (
        /* ================= 1. MANAGE USERS ================= */
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          <div className="p-4 border-b flex flex-col md:flex-row gap-3 justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div style={{ position: 'relative', width: '100%', minWidth: '260px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                <input 
                  type="text" 
                  placeholder="Search name, email, company..." 
                  className="input-field" 
                  style={{ paddingLeft: '2.2rem', paddingBottom: '0.4rem', paddingTop: '0.4rem', fontSize: '0.85rem' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <span className="text-xs text-muted">Filter Role:</span>
              <select 
                className="input-field" 
                style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="candidate">Candidates</option>
                <option value="professional">Professionals</option>
                <option value="admin">Admins</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>User Profile</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Verified Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Rate / Title</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      No users match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="flex items-center gap-3">
                          <img 
                            src={u.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'} 
                            alt={u.name} 
                            className="profile-avatar"
                            style={{ width: '38px', height: '38px' }}
                          />
                          <div>
                            <div className="font-bold flex items-center gap-1.5">
                              {u.name}
                              {u.isVerified && <ShieldCheck size={14} className="text-success" />}
                            </div>
                            <div className="text-xs text-muted">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <select 
                          className="input-field text-xs" 
                          style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
                          value={u.role}
                          disabled={actionLoading === `role_${u._id}`}
                          onChange={(e) => handleRoleChange(u._id, e.target.value)}
                        >
                          <option value="candidate">Candidate</option>
                          <option value="professional">Professional</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {u.role === 'professional' ? (
                          <span className={`badge ${u.isVerified ? 'badge-success' : 'badge-warning'} text-xs font-semibold py-0.5 px-2`}>
                            {u.isVerified ? 'Verified Interviewer' : 'Pending Verification'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="text-sm">{u.title || 'General User'}</div>
                        {u.hourlyRate && <div className="text-xs text-success font-semibold">₹{u.hourlyRate}/session</div>}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button 
                          className="btn btn-ghost text-xs text-danger"
                          title="Delete user account"
                          disabled={actionLoading === `del_${u._id}`}
                          onClick={() => handleDeleteUser(u._id, u.name)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : currentTab === 'verify' ? (
        /* ================= 2. VERIFY PROFESSIONALS ================= */
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div>
              <h3 className="font-bold text-base">Professional Interviewers Accreditation</h3>
              <p className="text-xs text-muted">Verify credentials, industry experience, and approve professionals for candidate bookings.</p>
            </div>
            <span className="badge badge-info text-xs">{professionals.length} Total Interviewers</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Professional</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Expertise & Skills</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Rate / Rating</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Current Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {professionals.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      No professionals registered yet.
                    </td>
                  </tr>
                ) : (
                  professionals.map(p => (
                    <tr key={p._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="flex items-center gap-3">
                          <img 
                            src={p.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                            alt={p.name} 
                            className="profile-avatar"
                            style={{ width: '42px', height: '42px' }}
                          />
                          <div>
                            <div className="font-bold flex items-center gap-1.5">
                              {p.name}
                              {p.isVerified && <ShieldCheck size={16} className="text-success" />}
                            </div>
                            <div className="text-xs text-muted">{p.title || 'Interviewer'} • {p.company || 'Tech'}</div>
                            <div className="text-xs text-muted">{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', maxWidth: '300px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {p.skills && p.skills.length > 0 ? (
                            p.skills.slice(0, 4).map((sk, idx) => (
                              <span key={idx} className="badge badge-secondary text-xs" style={{ fontSize: '0.7rem' }}>
                                {sk}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted">No skills listed</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="font-bold text-success">₹{p.hourlyRate || 100} / 45m</div>
                        <div className="text-xs text-muted">⭐ {p.rating || '5.0'} ({p.reviewsCount || 0} reviews)</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${p.isVerified ? 'badge-success' : 'badge-warning'} text-xs font-semibold py-1 px-2.5`}>
                          {p.isVerified ? 'VERIFIED EXPERT 🟢' : 'UNVERIFIED ⚠️'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button
                          className={`btn ${p.isVerified ? 'btn-outline text-danger' : 'btn-primary'} text-xs py-1.5 px-3`}
                          disabled={actionLoading === `verify_${p._id}`}
                          onClick={() => handleToggleVerify(p._id, p.isVerified)}
                        >
                          {p.isVerified ? 'Revoke Verification' : 'Verify & Approve'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ================= 3. MANAGE BOOKINGS ================= */
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div>
              <h3 className="font-bold text-base">Global Interview Bookings</h3>
              <p className="text-xs text-muted">Supervise all scheduled, completed, and cancelled sessions across InterviewPro.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Status:</span>
              <select 
                className="input-field" 
                style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                value={bookingStatusFilter}
                onChange={(e) => setBookingStatusFilter(e.target.value)}
              >
                <option value="all">All Bookings</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Session / Topic</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Candidate</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Interviewer</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Date & Slot</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Admin Override</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      No bookings found in this status.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map(b => (
                    <tr key={b._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="font-bold">{b.topic || 'Mock Technical Interview'}</div>
                        <div className="text-xs text-muted font-mono">{b.meetingRoomId}</div>
                        <div className="text-xs text-success font-semibold">₹{b.price} (Paid)</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="font-medium">{b.candidateId?.name || 'Candidate'}</div>
                        <div className="text-xs text-muted">{b.candidateId?.email}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="font-medium flex items-center gap-1">
                          {b.interviewerId?.name || 'Interviewer'}
                          {b.interviewerId?.isVerified && <ShieldCheck size={14} className="text-success" />}
                        </div>
                        <div className="text-xs text-muted">{b.interviewerId?.title || 'Professional'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div>{b.date}</div>
                        <div className="text-xs text-muted">{b.timeSlot}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${
                          b.status === 'scheduled' ? 'badge-info' : 
                          b.status === 'completed' ? 'badge-success' : 'badge-warning'
                        } text-xs font-semibold py-0.5 px-2`}>
                          {b.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <select 
                          className="input-field text-xs" 
                          style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
                          value={b.status}
                          disabled={actionLoading === `book_${b._id}`}
                          onChange={(e) => handleBookingStatus(b._id, e.target.value)}
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
