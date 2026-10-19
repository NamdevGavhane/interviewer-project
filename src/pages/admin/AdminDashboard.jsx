import { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Calendar, 
  Trash2, 
  CheckCircle, 
  CheckCircle2,
  XCircle, 
  Search, 
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Shield,
  Clock,
  TrendingUp,
  DollarSign,
  LogOut,
  Briefcase,
  User,
  ExternalLink,
  MessageSquare,
  UserPlus,
  Send,
  Copy,
  Check,
  Mail,
  KeyRound,
  Power,
  Ban,
  X,
  Sliders,
  Settings as SettingsIcon,
  Save,
  Plus
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../../utils/apiClient';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';

const AdminDashboard = () => {
  const { logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'requests'; // 'requests' | 'invitations' | 'users' | 'verify' | 'bookings' | 'settings'

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Platform Settings State
  const [platformSettings, setPlatformSettings] = useState({
    platformCommissionPercent: 10,
    gstPercent: 18,
    currency: 'INR',
    refundWindowHours: 24,
    bookingWindowDays: 14,
    slotDurationMinutes: 45,
    slotPresets: [],
    aiDailyLimit: 5,
    supportEmail: 'support@interviewpro.com',
    siteName: 'InterviewPro'
  });
  const [interviewConfig, setInterviewConfig] = useState({
    topics: [],
    difficulties: [],
    companies: []
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [newCompanyInput, setNewCompanyInput] = useState('');
  const [newPresetInput, setNewPresetInput] = useState('');

  // Filters
  const [requestStatusFilter, setRequestStatusFilter] = useState('pending'); // 'pending' | 'approved' | 'rejected' | 'all'
  const [invitationStatusFilter, setInvitationStatusFilter] = useState('all'); // 'all' | 'invited' | 'active' | 'deactivated'
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all');

  // Professional Invitation Modal State (Requirement 1, 2, 3, 12)
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    company: '',
    designation: '',
    experience: '5+ Years',
    domain: 'Full Stack MERN',
    hourlyRate: 100
  });
  const [inviting, setInviting] = useState(false);
  const [inviteSuccessData, setInviteSuccessData] = useState(null);
  const [copiedTokenId, setCopiedTokenId] = useState(null);

  const [actionLoading, setActionLoading] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsData, usersData, requestsData, bookingsData, invitesData, settingsRes, configRes] = await Promise.all([
        apiClient.get('/api/admin/stats'),
        apiClient.get('/api/admin/users'),
        apiClient.get('/api/admin/requests'),
        apiClient.get('/api/admin/bookings'),
        apiClient.get('/api/admin/invitations'),
        apiClient.get('/api/settings').catch(() => null),
        apiClient.get('/api/settings/interview-config').catch(() => null)
      ]);

      if (statsData) setStats(statsData);
      if (usersData) setUsers(usersData);
      if (requestsData) setRequests(requestsData);
      if (bookingsData) setBookings(bookingsData);
      if (invitesData) setInvitations(invitesData);
      if (settingsRes?.data) setPlatformSettings(settingsRes.data);
      if (configRes?.data) setInterviewConfig(configRes.data);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlatformSettings = async (e) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const res = await apiClient.put('/api/settings', platformSettings);
      showToast(res.message || 'Platform settings updated successfully!');
      if (res.data) setPlatformSettings(res.data);
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveInterviewConfig = async () => {
    try {
      setSavingSettings(true);
      const res = await apiClient.put('/api/settings/interview-config', interviewConfig);
      showToast(res.message || 'Interview configuration updated successfully!');
      if (res.data) setInterviewConfig(res.data);
    } catch (err) {
      alert('Failed to update interview config: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Admin Dispatches Invitation Email to Professional (Requirement 1, 2, 3, 12)
  const handleSendInvitation = async (e) => {
    e.preventDefault();
    try {
      setInviting(true);
      const res = await apiClient.post('/api/admin/invite-professional', inviteForm);
      setInviteSuccessData(res?.data || res);
      showToast(res.message || 'Invitation email dispatched successfully!');
      await fetchData();
    } catch (err) {
      alert('Error sending invitation: ' + err.message);
    } finally {
      setInviting(false);
    }
  };

  // Resend invitation email to professional
  const handleResendInvite = async (userId) => {
    try {
      setActionLoading(`resend_${userId}`);
      const res = await apiClient.post(`/api/admin/invitations/${userId}/resend`, {});
      showToast(res.message || 'Fresh invitation link dispatched');
      await fetchData();
    } catch (err) {
      alert('Failed to resend invite: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle Account Active vs Deactivated (Requirement 11)
  const handleToggleAccountStatus = async (userId, userName) => {
    try {
      setActionLoading(`status_${userId}`);
      const res = await apiClient.patch(`/api/admin/users/${userId}/toggle-status`, {});
      showToast(res.message);
      await fetchData();
    } catch (err) {
      alert('Failed to update account status: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedTokenId(id);
    showToast('Invitation link copied to clipboard! 📋');
    setTimeout(() => setCopiedTokenId(null), 2500);
  };

  // Admin Decision on Professional Request: approve | make_candidate | reject
  const handleRequestDecision = async (userId, decision, rejectionReason = '') => {
    try {
      setActionLoading(`decision_${userId}_${decision}`);
      const res = await apiClient.patch(`/api/admin/requests/${userId}/decision`, { decision, rejectionReason });
      showToast(res.message || 'Decision applied successfully');
      await fetchData();
    } catch (err) {
      alert('Error updating application: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Update User Role
  const handleRoleChange = async (userId, newRole) => {
    try {
      setActionLoading(`role_${userId}`);
      const res = await apiClient.patch(`/api/admin/users/${userId}/role`, { role: newRole });
      showToast(`User role updated to ${newRole}`);
      await fetchData();
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
      await apiClient.patch(`/api/admin/users/${userId}/verify`, {});
      showToast(`Professional ${!currentStatus ? 'Verified ✅' : 'Unverified ⚠️'}`);
      await fetchData();
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
      await apiClient.delete(`/api/admin/users/${userId}`);
      showToast(`User "${userName}" deleted successfully`);
      await fetchData();
    } catch (err) {
      alert('Failed to delete user: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete Booking
  const handleDeleteBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to delete this booking record?')) return;
    try {
      setActionLoading(`del_book_${bookingId}`);
      await apiClient.delete(`/api/admin/bookings/${bookingId}`);
      showToast('Booking deleted successfully');
      await fetchData();
    } catch (err) {
      alert('Failed to delete booking: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered Requests
  const filteredRequests = requests.filter(r => {
    if (requestStatusFilter === 'all') return true;
    return r.approvalStatus === requestStatusFilter;
  });

  const pendingRequestsCount = requests.filter(r => r.approvalStatus === 'pending').length;

  // Filtered Users
  const filteredUsers = users.filter(u => {
    const matchesSearch = searchQuery === '' || 
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.company?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Professionals for accreditation tab
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
          borderRadius: '12px',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontWeight: 500,
          border: '1px solid #334155'
        }}>
          <CheckCircle2 size={18} className="text-success" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge badge-danger text-xs font-semibold uppercase">Super Administrator</span>
            <span className="text-xs text-muted">InterviewPro Governance Console</span>
          </div>
          <h2 className="text-2xl font-bold mt-1">Admin Panel & Professional Requests</h2>
          <p className="text-muted text-sm">Review incoming professional interviewer applications, grant accreditation, and oversee all platform operations.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              setInviteSuccessData(null);
              setShowInviteModal(true);
            }} 
            className="btn btn-primary text-xs flex items-center gap-1.5"
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              border: 'none',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
              padding: '0.45rem 0.95rem',
              color: 'white'
            }}
          >
            <UserPlus size={15} />
            <span>+ Invite Professional</span>
          </button>
          <button 
            onClick={fetchData} 
            className="btn btn-outline text-xs flex items-center gap-1.5"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={async () => {
              await logout();
              window.location.href = '/login';
            }}
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
            title="Sign out of Admin Console"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Top Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          
          {/* 1. Invited Professionals Stat Card */}
          <div 
            className="card p-4 transition-all"
            onClick={() => setSearchParams({ tab: 'invitations' })}
            style={{ 
              cursor: 'pointer', 
              border: '1px solid #e9d5ff', 
              backgroundColor: '#faf5ff' 
            }}
          >
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span style={{ color: '#7c3aed' }}>Invited Professionals</span>
              <Mail size={16} style={{ color: '#8b5cf6' }} />
            </div>
            <div className="text-2xl font-bold mt-2" style={{ color: '#6d28d9' }}>
              {invitations.length} Dispatched
            </div>
            <div className="text-xs text-muted mt-1">
              {invitations.filter(i => i.accountStatus === 'invited').length} Pending Setup • {invitations.filter(i => i.accountStatus === 'active').length} Active
            </div>
          </div>

          {/* 2. Pending Professional Requests */}
          <div 
            className="card p-4 transition-all" 
            onClick={() => {
              setSearchParams({ tab: 'requests' });
              setRequestStatusFilter('pending');
            }}
            style={{ 
              cursor: 'pointer',
              border: pendingRequestsCount > 0 ? '2px solid rgba(245, 158, 11, 0.6)' : '1px solid var(--border)',
              backgroundColor: pendingRequestsCount > 0 ? 'rgba(254, 243, 199, 0.35)' : 'white'
            }}
          >
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span style={{ color: pendingRequestsCount > 0 ? '#b45309' : 'inherit' }}>Pending Requests</span>
              <Clock size={16} className={pendingRequestsCount > 0 ? "text-warning" : "text-muted"} />
            </div>
            <div className="text-2xl font-bold mt-2" style={{ color: pendingRequestsCount > 0 ? '#b45309' : 'inherit' }}>
              {pendingRequestsCount} Awaiting Review
            </div>
            <div className="text-xs text-muted mt-1">
              {pendingRequestsCount > 0 ? '⚡ Action required by Admin' : 'All applications reviewed'}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Total Platform Users</span>
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
            <div className="text-xs text-muted mt-1">Approved & accredited interviewers</div>
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
            <div className="text-2xl font-bold mt-2 text-primary">₹{stats.totalVolume?.toLocaleString()}</div>
            <div className="text-xs text-muted mt-1">Revenue: ₹{stats.platformRevenue}</div>
          </div>
        </div>
      )}

      {/* Module Navigation Tabs */}
      <div className="tabs-container mb-6">
        <button 
          className={`tab-button ${currentTab === 'invitations' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'invitations' })}
        >
          <Mail size={16} style={{ display: 'inline', marginRight: '6px' }} />
          <span>Professional Invitations ({invitations.length})</span>
          {invitations.filter(i => i.accountStatus === 'invited').length > 0 && (
            <span 
              className="badge text-xs font-bold ml-2" 
              style={{ 
                fontSize: '0.7rem', 
                padding: '0.15rem 0.5rem', 
                borderRadius: '12px',
                backgroundColor: '#7c3aed',
                color: 'white'
              }}
            >
              {invitations.filter(i => i.accountStatus === 'invited').length} Pending Setup
            </span>
          )}
        </button>

        <button 
          className={`tab-button ${currentTab === 'requests' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'requests' })}
          style={{ position: 'relative' }}
        >
          <Briefcase size={16} style={{ display: 'inline', marginRight: '6px' }} />
          <span>Professional Requests</span>
          {pendingRequestsCount > 0 && (
            <span 
              className="badge badge-warning text-xs font-bold ml-2" 
              style={{ 
                fontSize: '0.7rem', 
                padding: '0.15rem 0.5rem', 
                borderRadius: '12px',
                backgroundColor: '#f59e0b',
                color: 'white'
              }}
            >
              {pendingRequestsCount} Pending
            </span>
          )}
        </button>

        <button 
          className={`tab-button ${currentTab === 'users' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'users' })}
        >
          <Users size={16} style={{ display: 'inline', marginRight: '6px' }} />
          <span>All Users ({users.length})</span>
        </button>

        <button 
          className={`tab-button ${currentTab === 'bookings' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'bookings' })}
        >
          <Calendar size={16} style={{ display: 'inline', marginRight: '6px' }} />
          <span>Interview Bookings ({bookings.length})</span>
        </button>

        <button 
          className={`tab-button ${currentTab === 'settings' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'settings' })}
        >
          <Sliders size={16} style={{ display: 'inline', marginRight: '6px' }} />
          <span>Platform Settings</span>
        </button>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-muted">
          Loading Admin Module data from database...
        </div>
      ) : currentTab === 'invitations' ? (
        /* ================= 0. PROFESSIONAL INVITATIONS (Requirement 1, 2, 3, 11, 12) ================= */
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          {/* Subheader with Search & Action */}
          <div className="p-4 border-b flex flex-col md:flex-row gap-3 justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>Dispatched Professional Invitations</span>
                <span className="badge badge-info text-xs">{invitations.length} Total</span>
              </h3>
              <p className="text-xs text-muted">
                Admin creates and invites professional accounts. Passwords are never sent via email; professionals set their own password upon opening their invitation link.
              </p>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  setInviteSuccessData(null);
                  setShowInviteModal(true);
                }}
                className="btn btn-primary text-xs flex items-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: 'white',
                  border: 'none',
                  fontWeight: 600,
                  padding: '0.45rem 0.95rem'
                }}
              >
                <UserPlus size={14} />
                <span>+ Invite Professional</span>
              </button>

              <select
                className="input-field"
                style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                value={invitationStatusFilter}
                onChange={(e) => setInvitationStatusFilter(e.target.value)}
              >
                <option value="all">All Invitation Statuses</option>
                <option value="invited">Pending Setup (Invited)</option>
                <option value="active">Active & Verified</option>
                <option value="deactivated">Deactivated</option>
              </select>
            </div>
          </div>

          {/* Invitations Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Professional Details</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Company & Designation</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Experience</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Account Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Invitation Link</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.filter(inv => {
                  if (invitationStatusFilter !== 'all') {
                    if (invitationStatusFilter === 'deactivated') {
                      if (!inv.isDeactivated && inv.accountStatus !== 'deactivated') return false;
                    } else if (inv.accountStatus !== invitationStatusFilter) {
                      return false;
                    }
                  }
                  if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    return (
                      inv.name?.toLowerCase().includes(q) ||
                      inv.email?.toLowerCase().includes(q) ||
                      inv.company?.toLowerCase().includes(q)
                    );
                  }
                  return true;
                }).length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <Mail size={32} className="mx-auto text-muted opacity-40" />
                      </div>
                      <p className="font-semibold text-sm">No professional invitations match this criteria.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setInviteSuccessData(null);
                          setShowInviteModal(true);
                        }}
                        className="btn btn-primary text-xs mt-3 inline-flex items-center gap-1.5"
                      >
                        <UserPlus size={14} />
                        <span>Send Your First Professional Invitation</span>
                      </button>
                    </td>
                  </tr>
                ) : (
                  invitations.filter(inv => {
                    if (invitationStatusFilter !== 'all') {
                      if (invitationStatusFilter === 'deactivated') {
                        if (!inv.isDeactivated && inv.accountStatus !== 'deactivated') return false;
                      } else if (inv.accountStatus !== invitationStatusFilter) {
                        return false;
                      }
                    }
                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      return (
                        inv.name?.toLowerCase().includes(q) ||
                        inv.email?.toLowerCase().includes(q) ||
                        inv.company?.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  }).map(inv => {
                    const isInvited = inv.accountStatus === 'invited';
                    const isDeactivated = inv.isDeactivated || inv.accountStatus === 'deactivated';
                    const linkUrl = `${window.location.origin}/accept-invite?token=${inv.invitationToken}`;

                    return (
                      <tr key={inv._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={inv.name}
                              avatar={inv.avatar}
                              size={38}
                            />
                            <div>
                              <div className="font-bold flex items-center gap-1.5">
                                {inv.name}
                                {inv.isVerified && <ShieldCheck size={14} className="text-success" title="Verified Professional" />}
                              </div>
                              <div className="text-xs text-muted">{inv.email}</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div className="font-semibold text-xs text-foreground">{inv.designation || inv.title || 'Technical Interviewer'}</div>
                          <div className="text-xs text-muted">{inv.company || 'Tech Org'}</div>
                        </td>

                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className="badge badge-secondary text-xs">{inv.experience || '5+ Years'}</span>
                        </td>

                        <td style={{ padding: '0.75rem 1rem' }}>
                          {isDeactivated ? (
                            <span className="badge badge-danger text-xs font-semibold py-1 px-2.5">
                              Deactivated 🔴
                            </span>
                          ) : isInvited ? (
                            <span className="badge badge-warning text-xs font-semibold py-1 px-2.5" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                              Awaiting Password Setup ⏳
                            </span>
                          ) : (
                            <span className="badge badge-success text-xs font-semibold py-1 px-2.5">
                              Active & Verified 🟢
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', maxWidth: '220px' }}>
                          {inv.invitationToken ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="btn btn-outline text-xs py-1 px-2 flex items-center gap-1"
                                onClick={() => copyToClipboard(linkUrl, inv._id)}
                                title="Copy invitation link"
                              >
                                {copiedTokenId === inv._id ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                                <span>{copiedTokenId === inv._id ? 'Copied!' : 'Copy Link'}</span>
                              </button>
                              <a
                                href={linkUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-ghost text-xs p-1 text-primary hover:underline"
                                title="Open invitation link in new tab to test setup"
                              >
                                <ExternalLink size={14} />
                              </a>
                            </div>
                          ) : (
                            <span className="text-xs text-muted">Password Configured</span>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <div className="flex items-center justify-end gap-1">
                            {/* Resend invite button */}
                            {isInvited && (
                              <button
                                type="button"
                                className="btn btn-outline text-xs py-1 px-2 flex items-center gap-1"
                                style={{ borderColor: '#8b5cf6', color: '#6d28d9' }}
                                disabled={actionLoading === `resend_${inv._id}`}
                                onClick={() => handleResendInvite(inv._id)}
                                title="Resend invitation email"
                              >
                                <Send size={12} />
                                <span>Resend</span>
                              </button>
                            )}

                            {/* Deactivate / Reactivate toggle (Requirement 11) */}
                            <button
                              type="button"
                              className="btn btn-ghost p-1.5"
                              style={{ color: isDeactivated ? '#16a34a' : '#ea580c' }}
                              title={isDeactivated ? 'Reactivate Professional Account' : 'Deactivate Professional Account (Denies Access)'}
                              disabled={actionLoading === `status_${inv._id}`}
                              onClick={() => handleToggleAccountStatus(inv._id, inv.name)}
                            >
                              {isDeactivated ? <Power size={15} /> : <Ban size={15} />}
                            </button>

                            {/* Delete User */}
                            <button
                              type="button"
                              className="btn btn-ghost text-danger p-1.5"
                              title="Delete account"
                              disabled={actionLoading === `del_${inv._id}`}
                              onClick={() => handleDeleteUser(inv._id, inv.name)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : currentTab === 'requests' ? (
        /* ================= 1. PROFESSIONAL REQUESTS & APPROVAL ================= */
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          {/* Subheader with Filters */}
          <div className="p-4 border-b flex flex-col md:flex-row gap-3 justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>Incoming Professional Interviewer Applications</span>
                <span className="badge badge-info text-xs">{requests.length} Total</span>
              </h3>
              <p className="text-xs text-muted">When a professional registers, evaluate their credentials here and decide whether to approve them as a Professional or convert to a Candidate.</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Status:</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className={`btn ${requestStatusFilter === 'pending' ? 'btn-primary' : 'btn-outline'} text-xs py-1 px-2.5`}
                  onClick={() => setRequestStatusFilter('pending')}
                >
                  Pending ({requests.filter(r => r.approvalStatus === 'pending').length})
                </button>
                <button
                  type="button"
                  className={`btn ${requestStatusFilter === 'approved' ? 'btn-primary' : 'btn-outline'} text-xs py-1 px-2.5`}
                  onClick={() => setRequestStatusFilter('approved')}
                >
                  Approved ({requests.filter(r => r.approvalStatus === 'approved').length})
                </button>
                <button
                  type="button"
                  className={`btn ${requestStatusFilter === 'rejected' ? 'btn-primary' : 'btn-outline'} text-xs py-1 px-2.5`}
                  onClick={() => setRequestStatusFilter('rejected')}
                >
                  Rejected ({requests.filter(r => r.approvalStatus === 'rejected').length})
                </button>
                <button
                  type="button"
                  className={`btn ${requestStatusFilter === 'all' ? 'btn-primary' : 'btn-outline'} text-xs py-1 px-2.5`}
                  onClick={() => setRequestStatusFilter('all')}
                >
                  All ({requests.length})
                </button>
              </div>
            </div>
          </div>

          {/* List of Applications */}
          {filteredRequests.length === 0 ? (
            <div className="p-12 text-center text-muted">
              <Clock size={36} className="mx-auto mb-2 text-muted" />
              <p className="font-semibold">No applications found in "{requestStatusFilter}" status.</p>
              <p className="text-xs mt-1">When any professional signs up from the sign up page, their application request appears here for your decision.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredRequests.map(req => {
                const isPending = req.approvalStatus === 'pending';
                const isApproved = req.approvalStatus === 'approved';
                const isRejected = req.approvalStatus === 'rejected';

                return (
                  <div 
                    key={req._id}
                    className="p-5 border-b transition-colors"
                    style={{ 
                      borderColor: 'var(--border)',
                      backgroundColor: isPending ? 'rgba(254, 243, 199, 0.15)' : 'white'
                    }}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      
                      {/* Left: Applicant Profile & Details */}
                      <div className="flex items-start gap-4 flex-1">
                        <Avatar 
                          name={req.name} 
                          avatar={req.avatar} 
                          size={52} 
                          style={{ marginTop: '2px' }} 
                        />
                        <div style={{ flex: 1 }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-base">{req.name}</span>
                            <span className="text-xs text-muted">({req.email})</span>
                            
                            {/* Status Badge */}
                            {isPending && (
                              <span className="badge badge-warning text-xs font-semibold py-0.5 px-2">
                                ⏳ PENDING YOUR DECISION
                              </span>
                            )}
                            {isApproved && (
                              <span className="badge badge-success text-xs font-semibold py-0.5 px-2">
                                ✅ APPROVED PROFESSIONAL
                              </span>
                            )}
                            {isRejected && (
                              <span className="badge badge-danger text-xs font-semibold py-0.5 px-2">
                                ❌ REJECTED
                              </span>
                            )}
                          </div>

                          {/* Role, Title & Company */}
                          <div className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-primary">{req.title || 'Technical Interviewer'}</span>
                            <span>•</span>
                            <span>{req.company || 'Tech Org'}</span>
                            <span>•</span>
                            <span className="font-semibold text-success">Fee: ₹{req.hourlyRate || 100} / 45m</span>
                            {req.experience && (
                              <>
                                <span>•</span>
                                <span>Exp: {req.experience}</span>
                              </>
                            )}
                          </div>

                          {/* Domain & Skills */}
                          <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                            <span className="badge badge-info text-xs" style={{ fontSize: '0.7rem' }}>
                              Track: {req.domain || 'General Software'}
                            </span>
                            {req.skills && req.skills.map((skill, idx) => (
                              <span key={idx} className="badge badge-secondary text-xs" style={{ fontSize: '0.7rem' }}>
                                {skill}
                              </span>
                            ))}
                          </div>

                          {/* Bio / Reason / LinkedIn */}
                          {req.bio && (
                            <p className="text-xs text-muted mt-2" style={{ maxWidth: '680px', lineHeight: 1.5 }}>
                              "{req.bio}"
                            </p>
                          )}

                          {req.linkedin && (
                            <a 
                              href={req.linkedin.startsWith('http') ? req.linkedin : `https://${req.linkedin}`}
                              target="_blank" 
                              rel="noreferrer"
                              className="text-xs text-primary mt-1 inline-flex items-center gap-1 hover:underline"
                            >
                              <span>View LinkedIn Profile</span>
                              <ExternalLink size={12} />
                            </a>
                          )}

                          {req.rejectionReason && (
                            <div className="mt-2 p-2 rounded text-xs text-danger" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', maxWidth: '600px' }}>
                              <strong>Rejection Note:</strong> {req.rejectionReason}
                            </div>
                          )}

                          <div className="text-xs text-muted mt-2" style={{ fontSize: '0.7rem' }}>
                            Applied on: {new Date(req.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Right: Decision Action Controls */}
                      <div className="flex flex-col sm:flex-row lg:flex-col gap-2 justify-end" style={{ minWidth: '220px' }}>
                        {isPending ? (
                          <>
                            {/* Decision 1: Make Professional */}
                            <button
                              type="button"
                              className="btn btn-primary text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                              style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontWeight: 600 }}
                              disabled={actionLoading?.startsWith(`decision_${req._id}`)}
                              onClick={() => handleRequestDecision(req._id, 'approve')}
                            >
                              <CheckCircle size={15} />
                              <span>Approve as Professional</span>
                            </button>

                            {/* Decision 2: Make Regular Candidate (User) */}
                            <button
                              type="button"
                              className="btn btn-outline text-xs py-1.5 px-3 flex items-center justify-center gap-1.5"
                              style={{ borderColor: '#3b82f6', color: '#1d4ed8' }}
                              disabled={actionLoading?.startsWith(`decision_${req._id}`)}
                              onClick={() => handleRequestDecision(req._id, 'make_candidate')}
                              title="Make this user a regular candidate instead of a professional"
                            >
                              <User size={14} />
                              <span>Make Normal Candidate</span>
                            </button>

                            {/* Decision 3: Reject */}
                            <button
                              type="button"
                              className="btn text-xs py-1.5 px-3 flex items-center justify-center gap-1.5"
                              style={{ 
                                backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                color: '#dc2626', 
                                border: '1px solid rgba(239, 68, 68, 0.25)' 
                              }}
                              disabled={actionLoading?.startsWith(`decision_${req._id}`)}
                              onClick={() => {
                                const reason = prompt(`Enter optional rejection reason for ${req.name}:`, 'Experience criteria not matching current requirements');
                                if (reason !== null) {
                                  handleRequestDecision(req._id, 'reject', reason);
                                }
                              }}
                            >
                              <XCircle size={14} />
                              <span>Reject Application</span>
                            </button>
                          </>
                        ) : isApproved ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-xs text-success font-semibold flex items-center gap-1">
                              <ShieldCheck size={14} />
                              <span>Active Professional Interviewer</span>
                            </span>
                            <button
                              type="button"
                              className="btn btn-outline text-xs py-1 px-2.5 text-muted"
                              disabled={actionLoading?.startsWith(`decision_${req._id}`)}
                              onClick={() => handleRequestDecision(req._id, 'make_candidate')}
                            >
                              Demote to Candidate User
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-xs text-danger font-semibold flex items-center gap-1">
                              <XCircle size={14} />
                              <span>Application Rejected</span>
                            </span>
                            <button
                              type="button"
                              className="btn btn-outline text-xs py-1 px-2.5"
                              style={{ borderColor: '#10b981', color: '#059669' }}
                              disabled={actionLoading?.startsWith(`decision_${req._id}`)}
                              onClick={() => handleRequestDecision(req._id, 'approve')}
                            >
                              Reconsider & Approve
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : currentTab === 'users' ? (
        /* ================= 2. MANAGE USERS ================= */
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
                  <th style={{ padding: '0.75rem 1rem' }}>Approval Status</th>
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
                          <Avatar 
                            name={u.name} 
                            avatar={u.avatar} 
                            size={38} 
                          />
                          <div>
                            <div className="font-bold flex items-center gap-1.5">
                              {u.name}
                              {u.isVerified && <ShieldCheck size={15} className="text-success" />}
                            </div>
                            <div className="text-xs text-muted">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <select 
                          className="input-field"
                          style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
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
                        <span className={`badge ${u.approvalStatus === 'pending' ? 'badge-warning' : u.approvalStatus === 'rejected' ? 'badge-danger' : 'badge-success'} text-xs font-semibold py-1 px-2`}>
                          {u.approvalStatus === 'pending' ? 'Pending Review ⏳' : u.approvalStatus === 'rejected' ? 'Rejected ❌' : 'Approved ✅'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {u.role === 'professional' ? (
                          <div>
                            <div className="font-semibold text-success">₹{u.hourlyRate || 100} / session</div>
                            <div className="text-xs text-muted">{u.title || 'Interviewer'}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted">{u.title || 'Candidate'}</div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-1">
                          {u.role !== 'admin' && (
                            <button
                              className="btn btn-ghost p-1.5"
                              style={{ color: u.isDeactivated || u.accountStatus === 'deactivated' ? '#16a34a' : '#ea580c' }}
                              title={u.isDeactivated || u.accountStatus === 'deactivated' ? 'Reactivate Account' : 'Deactivate Account (Block Access)'}
                              disabled={actionLoading === `status_${u._id}`}
                              onClick={() => handleToggleAccountStatus(u._id, u.name)}
                            >
                              {u.isDeactivated || u.accountStatus === 'deactivated' ? <Power size={15} /> : <Ban size={15} />}
                            </button>
                          )}
                          <button
                            className="btn btn-ghost text-danger p-1.5"
                            title="Delete user account"
                            disabled={actionLoading === `del_${u._id}`}
                            onClick={() => handleDeleteUser(u._id, u.name)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : currentTab === 'verify' ? (
        /* ================= 3. VERIFY PROFESSIONALS ================= */
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
                          <Avatar 
                            name={p.name} 
                            avatar={p.avatar} 
                            size={42} 
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
      ) : currentTab === 'settings' ? (
        /* ================= 5. PLATFORM SETTINGS ================= */
        <div className="flex flex-col gap-6">
          {/* Platform Financial & Operational Settings */}
          <div className="card p-6">
            <div className="flex justify-between items-start mb-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Sliders size={20} className="text-primary" />
                  <span>Platform Parameters & Economics</span>
                </h3>
                <p className="text-xs text-muted mt-1">
                  Configure platform take-rate, GST, booking and cancellation policies. All calculations are executed securely on the server.
                </p>
              </div>
              <span className="badge badge-primary text-xs font-semibold">Active Database Settings</span>
            </div>

            <form onSubmit={handleSavePlatformSettings}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Platform Commission (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    className="input-field text-sm"
                    value={platformSettings.platformCommissionPercent}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, platformCommissionPercent: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Deducted from candidate fee before interviewer payout</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">GST / Tax Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    className="input-field text-sm"
                    value={platformSettings.gstPercent}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, gstPercent: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Tax applied to platform commission service fee</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Refund Cancellation Window (Hours)</label>
                  <input
                    type="number"
                    min="0"
                    max="168"
                    className="input-field text-sm"
                    value={platformSettings.refundWindowHours}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, refundWindowHours: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Cancellations before this window are eligible for full refund</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Advance Booking Horizon (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    className="input-field text-sm"
                    value={platformSettings.bookingWindowDays}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, bookingWindowDays: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Max days into future candidates can view & book slots</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Standard Slot Duration (Minutes)</label>
                  <input
                    type="number"
                    min="15"
                    max="180"
                    step="5"
                    className="input-field text-sm"
                    value={platformSettings.slotDurationMinutes}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, slotDurationMinutes: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Duration of each mock technical interview session</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Daily AI Mock Limit per User</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="input-field text-sm"
                    value={platformSettings.aiDailyLimit}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, aiDailyLimit: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Enforced daily quota per candidate account</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Platform Brand Name</label>
                  <input
                    type="text"
                    className="input-field text-sm"
                    value={platformSettings.siteName}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, siteName: e.target.value }))}
                    required
                  />
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Support Contact Email</label>
                  <input
                    type="email"
                    className="input-field text-sm"
                    value={platformSettings.supportEmail}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, supportEmail: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {/* Slot Presets Editor */}
              <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border)' }}>
                <label className="text-xs font-semibold block mb-2">Default Slot Presets for Interviewers</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(platformSettings.slotPresets || []).map((preset, idx) => (
                    <span 
                      key={idx}
                      className="badge text-xs flex items-center gap-1.5 py-1 px-3"
                      style={{ backgroundColor: '#e2e8f0', color: '#1e293b', borderRadius: '8px' }}
                    >
                      <span>{preset}</span>
                      <button
                        type="button"
                        onClick={() => setPlatformSettings(p => ({ ...p, slotPresets: p.slotPresets.filter((_, i) => i !== idx) }))}
                        className="text-muted hover:text-danger"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 max-w-md">
                  <input
                    type="text"
                    placeholder="e.g. 04:00 PM - 04:45 PM"
                    className="input-field text-xs py-1.5"
                    value={newPresetInput}
                    onChange={(e) => setNewPresetInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-outline text-xs whitespace-nowrap"
                    onClick={() => {
                      if (newPresetInput.trim()) {
                        setPlatformSettings(p => ({ ...p, slotPresets: [...(p.slotPresets || []), newPresetInput.trim()] }));
                        setNewPresetInput('');
                      }
                    }}
                  >
                    + Add Preset
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="btn btn-primary text-xs flex items-center gap-1.5 px-6 py-2.5 font-bold"
                >
                  <Save size={15} />
                  <span>{savingSettings ? 'Saving Settings...' : 'Save Platform Settings'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Dynamic Interview Content: Topics, Difficulties, Target Companies */}
          <div className="card p-6">
            <div className="flex justify-between items-start mb-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Briefcase size={20} className="text-primary" />
                  <span>Dynamic Interview Catalog & Target Companies</span>
                </h3>
                <p className="text-xs text-muted mt-1">
                  Manage the dynamic topics, seniority tiers, and companies available in AI Mock Interview and booking filters. No hardcoded lists.
                </p>
              </div>
              <span className="badge badge-success text-xs font-semibold">MongoDB Catalog</span>
            </div>

            {/* Topics */}
            <div className="mb-5">
              <label className="text-xs font-semibold block mb-2">Technical Interview Topics</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {(interviewConfig.topics || []).map((t, idx) => (
                  <span 
                    key={idx}
                    className="badge text-xs flex items-center gap-1.5 py-1 px-3"
                    style={{ backgroundColor: '#e0e7ff', color: '#3730a3', borderRadius: '8px' }}
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => setInterviewConfig(c => ({ ...c, topics: c.topics.filter((_, i) => i !== idx) }))}
                      className="text-muted hover:text-danger"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  placeholder="e.g. Distributed Caching & Redis"
                  className="input-field text-xs py-1.5"
                  value={newTopicInput}
                  onChange={(e) => setNewTopicInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-outline text-xs whitespace-nowrap"
                  onClick={() => {
                    if (newTopicInput.trim()) {
                      setInterviewConfig(c => ({ ...c, topics: [...(c.topics || []), newTopicInput.trim()] }));
                      setNewTopicInput('');
                    }
                  }}
                >
                  + Add Topic
                </button>
              </div>
            </div>

            {/* Target Companies */}
            <div className="mb-5">
              <label className="text-xs font-semibold block mb-2">Target Companies</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {(interviewConfig.companies || []).map((comp, idx) => (
                  <span 
                    key={idx}
                    className="badge text-xs flex items-center gap-1.5 py-1 px-3"
                    style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '8px' }}
                  >
                    <span>{comp}</span>
                    <button
                      type="button"
                      onClick={() => setInterviewConfig(c => ({ ...c, companies: c.companies.filter((_, i) => i !== idx) }))}
                      className="text-muted hover:text-danger"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  placeholder="e.g. Atlassian / Apple"
                  className="input-field text-xs py-1.5"
                  value={newCompanyInput}
                  onChange={(e) => setNewCompanyInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-outline text-xs whitespace-nowrap"
                  onClick={() => {
                    if (newCompanyInput.trim()) {
                      setInterviewConfig(c => ({ ...c, companies: [...(c.companies || []), newCompanyInput.trim()] }));
                      setNewCompanyInput('');
                    }
                  }}
                >
                  + Add Company
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveInterviewConfig}
                disabled={savingSettings}
                className="btn btn-primary text-xs flex items-center gap-1.5 px-6 py-2.5 font-bold"
              >
                <Save size={15} />
                <span>{savingSettings ? 'Updating Catalog...' : 'Save Interview Catalog'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ================= 4. MANAGE BOOKINGS ================= */
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
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="font-semibold">{b.candidateId?.name || 'Candidate'}</div>
                        <div className="text-xs text-muted">{b.candidateId?.email}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="font-semibold flex items-center gap-1">
                          {b.interviewerId?.name || 'Professional'}
                          {b.interviewerId?.isVerified && <ShieldCheck size={14} className="text-success" />}
                        </div>
                        <div className="text-xs text-muted">{b.interviewerId?.company || 'Expert'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="font-medium">{b.date}</div>
                        <div className="text-xs text-muted">{b.timeSlot}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${
                          b.status === 'completed' ? 'badge-success' : 
                          b.status === 'cancelled' ? 'badge-danger' : 'badge-warning'
                        } text-xs font-semibold py-1 px-2.5`}>
                          {b.status === 'completed' ? 'Completed ✅' : b.status === 'cancelled' ? 'Cancelled ❌' : 'Scheduled 📅'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <select
                          className="input-field"
                          style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
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

      {/* ================= MODAL: INVITE PROFESSIONAL (Requirement 1, 2, 3, 12) ================= */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => !inviting && setShowInviteModal(false)}>
          <div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '520px', 
              padding: '2rem', 
              borderRadius: '24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 45px rgba(0,0,0,0.2)'
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider mb-1">
                  <UserPlus size={15} />
                  <span>Only Admin Can Invite Professionals</span>
                </div>
                <h3 className="text-xl font-bold">Invite Professional Interviewer</h3>
                <p className="text-xs text-muted mt-0.5">
                  Enter professional details. An invitation email will be sent with a secure link to set their own password.
                </p>
              </div>
              <button 
                onClick={() => !inviting && setShowInviteModal(false)}
                className="btn btn-ghost p-1 text-muted"
                style={{ borderRadius: '50%' }}
              >
                <X size={20} />
              </button>
            </div>

            {inviteSuccessData ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: '#dcfce7',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem'
                }}>
                  <CheckCircle2 size={34} />
                </div>

                <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d', marginBottom: '6px' }}>
                  Invitation Dispatched!
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                  {inviteSuccessData.message}
                </p>

                {/* Invitation Link Box */}
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '12px',
                  textAlign: 'left',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                    Generated Secure Invitation Link:
                  </div>
                  <div style={{ wordBreak: 'break-all', fontSize: '0.8rem', fontFamily: 'monospace', color: '#0f172a', marginBottom: '10px' }}>
                    {inviteSuccessData.invitationLink}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-outline text-xs py-1.5 px-3 flex-1 flex items-center justify-center gap-1.5 font-semibold"
                      onClick={() => copyToClipboard(inviteSuccessData.invitationLink, 'modal_link')}
                    >
                      {copiedTokenId === 'modal_link' ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                      <span>{copiedTokenId === 'modal_link' ? 'Copied to Clipboard!' : 'Copy Invitation Link'}</span>
                    </button>
                    <a
                      href={inviteSuccessData.invitationLink}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary text-xs py-1.5 px-3 flex items-center justify-center gap-1 font-semibold"
                      style={{ textDecoration: 'none' }}
                    >
                      <span>Open Link</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteSuccessData(null);
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendInvitation}>
                {/* Security policy reminder */}
                <div style={{
                  background: '#fefce8',
                  borderLeft: '4px solid #eab308',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '0.75rem',
                  color: '#854d0e',
                  marginBottom: '1rem',
                  lineHeight: 1.4
                }}>
                  <strong>🔒 Security Requirement:</strong> Never send passwords through email. The professional will securely set their own password upon clicking the link.
                </div>

                {/* 1. Name & Email */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="input-group mb-0">
                    <label className="text-xs font-semibold">Full Name *</label>
                    <input 
                      type="text"
                      className="input-field text-sm"
                      placeholder="e.g. Ananya Iyer"
                      value={inviteForm.name}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="input-group mb-0">
                    <label className="text-xs font-semibold">Email Address *</label>
                    <input 
                      type="email"
                      className="input-field text-sm"
                      placeholder="e.g. ananya.iyer@google.com"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* 2. Company & Designation */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="input-group mb-0">
                    <label className="text-xs font-semibold">Company *</label>
                    <input 
                      type="text"
                      className="input-field text-sm"
                      placeholder="e.g. Google / Microsoft"
                      value={inviteForm.company}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, company: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="input-group mb-0">
                    <label className="text-xs font-semibold">Designation / Title *</label>
                    <input 
                      type="text"
                      className="input-field text-sm"
                      placeholder="e.g. Senior Staff Engineer"
                      value={inviteForm.designation}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, designation: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* 3. Experience & Domain */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="input-group mb-0">
                    <label className="text-xs font-semibold">Experience *</label>
                    <input 
                      type="text"
                      className="input-field text-sm"
                      placeholder="e.g. 7+ Years"
                      value={inviteForm.experience}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, experience: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="input-group mb-0">
                    <label className="text-xs font-semibold">Domain Track</label>
                    <select
                      className="input-field text-sm"
                      value={inviteForm.domain}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, domain: e.target.value }))}
                    >
                      <option value="Full Stack MERN">Full Stack MERN</option>
                      <option value="Machine Learning & AI">Machine Learning & AI</option>
                      <option value="Frontend Development (React)">Frontend Development (React)</option>
                      <option value="Backend Development (Node/Java)">Backend Development (Node/Java)</option>
                      <option value="DevOps & Cloud (AWS/K8s)">DevOps & Cloud (AWS/K8s)</option>
                      <option value="System Design & Architecture">System Design & Architecture</option>
                    </select>
                  </div>
                </div>

                {/* Submit Actions */}
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    className="btn btn-outline text-xs px-4 py-2"
                    onClick={() => setShowInviteModal(false)}
                    disabled={inviting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary text-xs px-5 py-2 flex items-center gap-1.5"
                    style={{
                      background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                      border: 'none',
                      fontWeight: 600,
                      color: 'white'
                    }}
                    disabled={inviting}
                  >
                    <Send size={14} />
                    <span>{inviting ? 'Dispatching Invitation...' : 'Send Official Invitation'}</span>
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

export default AdminDashboard;
