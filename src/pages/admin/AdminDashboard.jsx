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
  Clock, 
  DollarSign, 
  LogOut, 
  Briefcase, 
  User, 
  ExternalLink, 
  UserPlus, 
  Send, 
  Copy, 
  Check, 
  Mail, 
  Power, 
  Ban, 
  X, 
  Sliders, 
  Save, 
  Eye,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../../utils/apiClient';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';

const AdminDashboard = () => {
  const { logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview'; // 'overview' | 'requests' | 'invitations' | 'users' | 'verify' | 'bookings' | 'settings' | 'payouts'

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [payoutStatusFilter, setPayoutStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  
  // Platform Settings State
  const [platformSettings, setPlatformSettings] = useState({
    mockSessionPricePaise: 5000,
    interviewerSharePercent: 70,
    minPayoutPaise: 30000,
    pendingPaymentMinutes: 10,
    joinOpensMinutesBefore: 10,
    joinGraceMinutesAfter: 15,
    noShowWaitMinutes: 10,
    platformCommissionPercent: 10,
    gstPercent: 18,
    currency: 'INR',
    refundWindowHours: 24,
    bookingWindowDays: 14,
    payoutHoldDays: 3,
    slotDurationMinutes: 45,
    slotPresets: [],
    aiDailyLimit: 5,
    professionalReapplyAfterDays: 30,
    supportEmail: 'support@devsphere.com',
    siteName: 'DevSphere'
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
  const [invitationStatusFilter, setInvitationStatusFilter] = useState('all'); // 'all' | 'invited' | 'accepted' | 'expired' | 'deactivated'
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const usersPerPage = 15;

  // Modals state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    company: '',
    designation: '',
    experience: '5+ Years',
    domain: 'Full Stack MERN'
  });
  const [inviting, setInviting] = useState(false);
  const [inviteSuccessData, setInviteSuccessData] = useState(null);
  const [copiedTokenId, setCopiedTokenId] = useState(null);

  const [selectedUserForDetails, setSelectedUserForDetails] = useState(null);
  const [selectedRequestForDetails, setSelectedRequestForDetails] = useState(null);

  const [actionLoading, setActionLoading] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsData, usersData, requestsData, bookingsData, invitesData, payoutsData, settingsRes, configRes] = await Promise.all([
        apiClient.get('/api/admin/stats').catch(() => null),
        apiClient.get('/api/admin/users').catch(() => []),
        apiClient.get('/api/admin/requests').catch(() => []),
        apiClient.get('/api/admin/bookings').catch(() => []),
        apiClient.get('/api/admin/invitations').catch(() => []),
        apiClient.get('/api/admin/payouts').catch(() => ({ data: [] })),
        apiClient.get('/api/settings').catch(() => null),
        apiClient.get('/api/settings/interview-config').catch(() => null)
      ]);

      if (statsData) setStats(statsData);
      setUsers(Array.isArray(usersData) ? usersData.filter(Boolean) : (Array.isArray(usersData?.data) ? usersData.data.filter(Boolean) : []));
      setRequests(Array.isArray(requestsData) ? requestsData.filter(Boolean) : (Array.isArray(requestsData?.data) ? requestsData.data.filter(Boolean) : []));
      setBookings(Array.isArray(bookingsData) ? bookingsData.filter(Boolean) : (Array.isArray(bookingsData?.data) ? bookingsData.data.filter(Boolean) : []));
      setInvitations(Array.isArray(invitesData) ? invitesData.filter(Boolean) : (Array.isArray(invitesData?.data) ? invitesData.data.filter(Boolean) : []));
      setPayouts(Array.isArray(payoutsData) ? payoutsData.filter(Boolean) : (Array.isArray(payoutsData?.data) ? payoutsData.data.filter(Boolean) : []));
      if (settingsRes?.data) setPlatformSettings(settingsRes.data);
      if (configRes?.data) setInterviewConfig(configRes.data);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePayoutStatus = async (payoutId, newStatus) => {
    let referenceId = '';
    let notes = '';
    if (newStatus === 'completed') {
      referenceId = window.prompt('Enter Bank Transfer Reference ID / UTR Number:') || '';
      if (!referenceId) return;
    } else if (newStatus === 'rejected') {
      notes = window.prompt('Enter rejection reason:') || 'Rejected by administrator';
    }

    try {
      setActionLoading(`payout_${payoutId}`);
      const res = await apiClient.put(`/api/admin/payouts/${payoutId}/status`, {
        status: newStatus,
        referenceId,
        notes
      });
      showToast(res.message || `Payout request updated to ${newStatus}`);
      await fetchData();
    } catch (err) {
      alert('Failed to update payout: ' + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(null);
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

  // Admin Dispatches Invitation Email to Professional
  const handleSendInvitation = async (e) => {
    e.preventDefault();
    try {
      setInviting(true);
      const payload = {
        email: inviteForm.email.trim(),
        name: inviteForm.name.trim() || 'Professional Interviewer',
        company: inviteForm.company.trim() || 'Tech Org',
        designation: inviteForm.designation.trim() || 'Technical Interviewer',
        experience: inviteForm.experience.trim() || '5+ Years',
        domain: inviteForm.domain || 'Full Stack MERN'
      };
      const res = await apiClient.post('/api/admin/invite-professional', payload);
      setInviteSuccessData({
        ...(res?.data || {}),
        message: res.message || 'Invitation generated successfully!'
      });
      showToast(res.message || 'Invitation generated successfully!');
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

  // Revoke invitation
  const handleRevokeInvite = async (userId, email) => {
    if (!window.confirm(`Are you sure you want to revoke the invitation for ${email}?`)) return;
    try {
      setActionLoading(`revoke_${userId}`);
      const res = await apiClient.post(`/api/admin/invitations/${userId}/revoke`, {});
      showToast(res.message || 'Invitation revoked');
      await fetchData();
    } catch (err) {
      alert('Failed to revoke invitation: ' + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle Account Active vs Deactivated
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
      if (selectedRequestForDetails && selectedRequestForDetails._id === userId) {
        setSelectedRequestForDetails(null);
      }
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
      alert('Failed to update role: ' + (err.response?.data?.message || err.message));
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
      if (selectedUserForDetails && selectedUserForDetails._id === userId) {
        setSelectedUserForDetails(null);
      }
      await fetchData();
    } catch (err) {
      alert('Failed to delete user: ' + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(null);
    }
  };

  // Admin Override Booking Status
  const handleBookingStatus = async (bookingId, newStatus) => {
    try {
      setActionLoading(`book_${bookingId}`);
      const res = await apiClient.patch(`/api/admin/bookings/${bookingId}/status`, { status: newStatus });
      showToast(res.message || `Booking status updated to ${newStatus}`);
      await fetchData();
    } catch (err) {
      alert('Failed to update booking status: ' + (err.response?.data?.message || err.message));
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

  // Helper: compute clean invitation status
  const getInvitationStatus = (inv) => {
    if (!inv) return 'invited';
    if (inv.isDeactivated || inv.accountStatus === 'deactivated') return 'deactivated';
    if (inv.password || inv.acceptedAt || (inv.accountStatus === 'active' && !inv.invitationToken)) return 'accepted';
    if (inv.invitationExpires && new Date(inv.invitationExpires) < new Date()) return 'expired';
    return 'invited'; // Pending Setup
  };

  // Filtered Requests
  const filteredRequests = (requests || []).filter(r => {
    if (!r) return false;
    if (requestStatusFilter === 'all') return true;
    return r.approvalStatus === requestStatusFilter;
  });

  const pendingRequestsCount = (requests || []).filter(r => r && r.approvalStatus === 'pending').length;

  // Filtered Users
  const filteredUsers = (users || []).filter(u => {
    if (!u) return false;
    const matchesSearch = searchQuery === '' || 
      (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.company && u.company.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalUserPages = Math.ceil(filteredUsers.length / usersPerPage) || 1;
  const paginatedUsers = filteredUsers.slice((userPage - 1) * usersPerPage, userPage * usersPerPage);

  // Professionals for accreditation tab
  const professionals = (users || []).filter(u => u && u.role === 'professional');

  // Filtered Bookings
  const filteredBookings = (bookings || []).filter(b => {
    if (!b) return false;
    if (bookingStatusFilter !== 'all') {
      if (bookingStatusFilter === 'unpaid') {
        if (b.paymentStatus !== 'unpaid') return false;
      } else if (b.status !== bookingStatusFilter) {
        return false;
      }
    }
    if (bookingSearchQuery && bookingSearchQuery.trim()) {
      const q = bookingSearchQuery.toLowerCase().trim();
      const matchTopic = b.topic?.toLowerCase().includes(q);
      const matchRoom = b.meetingRoomId?.toLowerCase().includes(q);
      const matchCand = b.candidateId?.name?.toLowerCase().includes(q) || b.candidateId?.email?.toLowerCase().includes(q);
      const matchInterviewer = b.interviewerId?.name?.toLowerCase().includes(q) || b.interviewerId?.email?.toLowerCase().includes(q);
      return Boolean(matchTopic || matchRoom || matchCand || matchInterviewer);
    }
    return true;
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
            <span className="text-xs text-muted">DevSphere Governance Console</span>
          </div>
          <h2 className="text-2xl font-bold mt-1">Admin Panel & Platform Control</h2>
          <p className="text-muted text-sm">Oversee candidates, verified professionals, interview sessions, payouts, and platform operations.</p>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
          
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
              {invitations.filter(i => getInvitationStatus(i) === 'invited').length} Pending Setup • {invitations.filter(i => getInvitationStatus(i) === 'accepted').length} Accepted
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

          {/* 3. Total Users */}
          <div 
            className="card p-4 transition-all"
            onClick={() => setSearchParams({ tab: 'users' })}
            style={{ cursor: 'pointer' }}
          >
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Total Platform Users</span>
              <Users size={16} className="text-primary" />
            </div>
            <div className="text-2xl font-bold mt-2">{stats.totalUsers}</div>
            <div className="text-xs text-muted mt-1">{stats.candidatesCount} Candidates • {stats.professionalsCount} Professionals</div>
          </div>

          {/* 4. Verified Professionals */}
          <div 
            className="card p-4 transition-all"
            onClick={() => {
              setSearchParams({ tab: 'users' });
              setRoleFilter('professional');
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Verified Professionals</span>
              <ShieldCheck size={16} className="text-success" />
            </div>
            <div className="text-2xl font-bold mt-2 text-success">{stats.verifiedProfessionalsCount} / {stats.professionalsCount}</div>
            <div className="text-xs text-muted mt-1">Approved & accredited interviewers</div>
          </div>

          {/* 5. Total Bookings */}
          <div 
            className="card p-4 transition-all"
            onClick={() => setSearchParams({ tab: 'bookings' })}
            style={{ cursor: 'pointer' }}
          >
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Total Bookings</span>
              <Calendar size={16} className="text-primary" />
            </div>
            <div className="text-2xl font-bold mt-2">{stats.totalBookings}</div>
            <div className="text-xs text-muted mt-1">{stats.completedBookings} Completed • {stats.scheduledBookings} Scheduled</div>
          </div>

          {/* 6. Platform Revenue */}
          <div 
            className="card p-4 transition-all"
            onClick={() => setSearchParams({ tab: 'payouts' })}
            style={{ cursor: 'pointer' }}
          >
            <div className="flex items-center justify-between text-muted text-xs uppercase font-semibold">
              <span>Platform Volume</span>
              <DollarSign size={16} className="text-success" />
            </div>
            <div className="text-2xl font-bold mt-2 text-primary">₹{(stats.totalVolume || 0).toLocaleString()}</div>
            <div className="text-xs text-muted mt-1">Platform Revenue: ₹{(stats.platformRevenue || 0).toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Module Navigation Tabs */}
      <div className="tabs-container mb-6">
        <button 
          className={`tab-button ${currentTab === 'overview' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'overview' })}
        >
          <LayoutDashboard size={16} style={{ display: 'inline', marginRight: '6px' }} />
          <span>Overview</span>
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
          className={`tab-button ${currentTab === 'invitations' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'invitations' })}
        >
          <Mail size={16} style={{ display: 'inline', marginRight: '6px' }} />
          <span>Professional Invitations ({invitations.length})</span>
          {invitations.filter(i => getInvitationStatus(i) === 'invited').length > 0 && (
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
              {invitations.filter(i => getInvitationStatus(i) === 'invited').length} Pending Setup
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
          <span>All Bookings ({bookings.length})</span>
        </button>

        <button 
          className={`tab-button ${currentTab === 'payouts' ? 'active' : ''}`}
          onClick={() => setSearchParams({ tab: 'payouts' })}
        >
          <DollarSign size={16} style={{ display: 'inline', marginRight: '6px' }} />
          <span>Payout Requests</span>
          {payouts.filter(p => p.status === 'pending').length > 0 && (
            <span 
              className="badge text-xs font-bold ml-2" 
              style={{ 
                fontSize: '0.7rem', 
                padding: '0.15rem 0.5rem', 
                borderRadius: '12px',
                backgroundColor: '#b45309',
                color: 'white'
              }}
            >
              {payouts.filter(p => p.status === 'pending').length} Pending
            </span>
          )}
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
      ) : currentTab === 'overview' ? (
        /* ================= 0. OVERVIEW DASHBOARD ================= */
        <div className="flex flex-col gap-6">
          {/* Action Alerts */}
          {(pendingRequestsCount > 0 || payouts.filter(p => p.status === 'pending').length > 0 || invitations.filter(i => getInvitationStatus(i) === 'invited').length > 0) && (
            <div className="card p-4" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
              <div className="flex items-center gap-2 mb-2 font-bold text-sm text-amber-900">
                <AlertTriangle size={18} className="text-amber-600" />
                <span>Immediate Admin Action Required</span>
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                {pendingRequestsCount > 0 && (
                  <button
                    onClick={() => {
                      setSearchParams({ tab: 'requests' });
                      setRequestStatusFilter('pending');
                    }}
                    className="btn btn-outline text-xs py-1 px-3"
                    style={{ borderColor: '#d97706', color: '#b45309', backgroundColor: 'white' }}
                  >
                    ⚡ Review {pendingRequestsCount} Pending Professional Applications →
                  </button>
                )}
                {payouts.filter(p => p.status === 'pending').length > 0 && (
                  <button
                    onClick={() => {
                      setSearchParams({ tab: 'payouts' });
                      setPayoutStatusFilter('pending');
                    }}
                    className="btn btn-outline text-xs py-1 px-3"
                    style={{ borderColor: '#2563eb', color: '#1d4ed8', backgroundColor: 'white' }}
                  >
                    💰 Process {payouts.filter(p => p.status === 'pending').length} Pending Payout Requests →
                  </button>
                )}
                {invitations.filter(i => getInvitationStatus(i) === 'invited').length > 0 && (
                  <button
                    onClick={() => {
                      setSearchParams({ tab: 'invitations' });
                      setInvitationStatusFilter('invited');
                    }}
                    className="btn btn-outline text-xs py-1 px-3"
                    style={{ borderColor: '#7c3aed', color: '#6d28d9', backgroundColor: 'white' }}
                  >
                    📧 {invitations.filter(i => getInvitationStatus(i) === 'invited').length} Dispatched Invitations Awaiting Setup →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Fast Navigation Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div 
              className="card p-5 cursor-pointer hover:shadow-md transition-all"
              onClick={() => {
                setInviteSuccessData(null);
                setShowInviteModal(true);
              }}
              style={{ borderLeft: '4px solid #7c3aed' }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-sm">Invite Professional</span>
                <UserPlus size={18} className="text-purple-600" />
              </div>
              <p className="text-xs text-muted">Generate a secure single-use invitation link for an interviewer.</p>
            </div>

            <div 
              className="card p-5 cursor-pointer hover:shadow-md transition-all"
              onClick={() => setSearchParams({ tab: 'requests' })}
              style={{ borderLeft: '4px solid #f59e0b' }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-sm">Professional Applications</span>
                <Briefcase size={18} className="text-amber-600" />
              </div>
              <p className="text-xs text-muted">Approve or reject candidates applying to become interviewers.</p>
            </div>

            <div 
              className="card p-5 cursor-pointer hover:shadow-md transition-all"
              onClick={() => setSearchParams({ tab: 'bookings' })}
              style={{ borderLeft: '4px solid #2563eb' }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-sm">Manage All Bookings</span>
                <Calendar size={18} className="text-blue-600" />
              </div>
              <p className="text-xs text-muted">View upcoming mock sessions, statuses, and override outcomes.</p>
            </div>

            <div 
              className="card p-5 cursor-pointer hover:shadow-md transition-all"
              onClick={() => setSearchParams({ tab: 'settings' })}
              style={{ borderLeft: '4px solid #10b981' }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-sm">Platform Economics</span>
                <Sliders size={18} className="text-emerald-600" />
              </div>
              <p className="text-xs text-muted">Adjust mock session price, take-rate %, and cancellation rules.</p>
            </div>
          </div>

          {/* Recent Bookings Preview */}
          <div className="card p-0" style={{ overflow: 'hidden' }}>
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
              <div>
                <h3 className="font-bold text-sm">Latest Interview Bookings</h3>
                <p className="text-xs text-muted">Recent candidate bookings across the platform.</p>
              </div>
              <button 
                onClick={() => setSearchParams({ tab: 'bookings' })}
                className="btn btn-outline text-xs py-1 px-2.5"
              >
                View All {bookings.length} Bookings →
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b', textAlign: 'left' }}>
                    <th style={{ padding: '0.65rem 1rem' }}>Topic</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Candidate</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Interviewer</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Date & Slot</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Price</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.slice(0, 5).map(b => (
                    <tr key={b._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{b.topic || 'Mock Technical Interview'}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>{b.candidateId?.name || 'Candidate'}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>{b.interviewerId?.name || 'Interviewer'}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>{b.date} • {b.timeSlot}</td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: '#16a34a' }}>
                        ₹{b.price || (b.amountPaise ? b.amountPaise / 100 : 0)}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span className={`badge ${
                          b.status === 'completed' ? 'badge-success' : 
                          b.status === 'cancelled' ? 'badge-danger' : 'badge-warning'
                        } text-xs py-0.5 px-2`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {bookings.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                        No bookings scheduled yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : currentTab === 'invitations' ? (
        /* ================= 1. PROFESSIONAL INVITATIONS ================= */
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          {/* Subheader with Search & Action */}
          <div className="p-4 border-b flex flex-col md:flex-row gap-3 justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>Dispatched Professional Invitations</span>
                <span className="badge badge-info text-xs">{invitations.length} Total</span>
              </h3>
              <p className="text-xs text-muted">
                Admin invites professionals by email. Invited professionals receive a secure link to configure their own password.
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
                <option value="invited">Pending Setup</option>
                <option value="accepted">Accepted</option>
                <option value="expired">Expired</option>
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
                  const status = getInvitationStatus(inv);
                  if (invitationStatusFilter !== 'all' && status !== invitationStatusFilter) return false;
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
                    const status = getInvitationStatus(inv);
                    if (invitationStatusFilter !== 'all' && status !== invitationStatusFilter) return false;
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
                    const status = getInvitationStatus(inv);
                    const isDeactivated = status === 'deactivated';
                    const isAccepted = status === 'accepted';
                    const isExpired = status === 'expired';
                    const isPendingSetup = status === 'invited';
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
                          {isDeactivated && (
                            <span className="badge badge-danger text-xs font-semibold py-1 px-2.5">
                              Deactivated 🔴
                            </span>
                          )}
                          {isPendingSetup && (
                            <span className="badge badge-warning text-xs font-semibold py-1 px-2.5" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                              Pending Setup ⏳
                            </span>
                          )}
                          {isAccepted && (
                            <span className="badge badge-success text-xs font-semibold py-1 px-2.5">
                              Accepted 🟢
                            </span>
                          )}
                          {isExpired && (
                            <span className="badge text-xs font-semibold py-1 px-2.5" style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }}>
                              Expired ⌛
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
                                title="Open invitation link in new tab"
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
                            {/* Resend invite button for pending or expired */}
                            {(isPendingSetup || isExpired) && (
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

                            {/* Revoke invite button */}
                            {(isPendingSetup || isExpired) && (
                              <button
                                type="button"
                                className="btn btn-outline text-danger text-xs py-1 px-2 flex items-center gap-1"
                                disabled={actionLoading === `revoke_${inv._id}`}
                                onClick={() => handleRevokeInvite(inv._id, inv.email)}
                                title="Revoke invitation"
                              >
                                <X size={12} />
                                <span>Revoke</span>
                              </button>
                            )}

                            {/* Deactivate / Reactivate toggle */}
                            <button
                              type="button"
                              className="btn btn-ghost p-1.5"
                              style={{ color: isDeactivated ? '#16a34a' : '#ea580c' }}
                              title={isDeactivated ? 'Reactivate Professional Account' : 'Deactivate Professional Account'}
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
        /* ================= 2. PROFESSIONAL REQUESTS & APPROVAL ================= */
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          {/* Subheader with Filters */}
          <div className="p-4 border-b flex flex-col md:flex-row gap-3 justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>Incoming Professional Interviewer Applications</span>
                <span className="badge badge-info text-xs">{requests.length} Total</span>
              </h3>
              <p className="text-xs text-muted">Evaluate professional credentials. Approved professionals are verified and eligible to accept candidate bookings.</p>
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
              <p className="text-xs mt-1">When any professional registers, their application request appears here for admin verification.</p>
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
                                ✅ APPROVED & VERIFIED
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
                            <span className="font-semibold text-primary">{req.title || req.designation || 'Technical Interviewer'}</span>
                            <span>•</span>
                            <span>{req.company || 'Tech Org'}</span>
                            <span>•</span>
                            <span className="font-semibold text-success">Professional Interviewer</span>
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

                          <div className="flex items-center gap-3 mt-2">
                            {req.linkedin && (
                              <a 
                                href={req.linkedin.startsWith('http') ? req.linkedin : `https://${req.linkedin}`}
                                target="_blank" 
                                rel="noreferrer"
                                className="text-xs text-primary inline-flex items-center gap-1 hover:underline font-medium"
                              >
                                <span>View LinkedIn Profile</span>
                                <ExternalLink size={12} />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedRequestForDetails(req)}
                              className="text-xs text-primary inline-flex items-center gap-1 hover:underline font-semibold"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              <Eye size={13} />
                              <span>View Full Application Details</span>
                            </button>
                          </div>

                          {req.rejectionReason && (
                            <div className="mt-2 p-2 rounded text-xs text-danger" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', maxWidth: '600px' }}>
                              <strong>Rejection Note:</strong> {req.rejectionReason}
                            </div>
                          )}

                          <div className="text-xs text-muted mt-2" style={{ fontSize: '0.7rem' }}>
                            Applied on: {new Date(req.appliedAt || req.createdAt).toLocaleString()}
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
                              <span>Active Verified Interviewer</span>
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
        /* ================= 3. MANAGE USERS ================= */
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
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setUserPage(1);
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <span className="text-xs text-muted">Filter Role:</span>
              <select 
                className="input-field" 
                style={{ width: 'auto', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setUserPage(1);
                }}
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
                  <th style={{ padding: '0.75rem 1rem' }}>Title / Company</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                      No users match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map(u => (
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
                              {u.isVerified && <ShieldCheck size={15} className="text-success" title="Verified Professional" />}
                              {u.role === 'admin' && <span className="badge badge-danger text-[10px] font-bold">ADMIN</span>}
                            </div>
                            <div className="text-xs text-muted">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {u.role === 'admin' ? (
                          <span className="badge badge-danger text-xs font-semibold py-1 px-2.5">
                            Administrator 🛡️
                          </span>
                        ) : (
                          <select 
                            className="input-field"
                            style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                            value={u.role}
                            disabled={actionLoading === `role_${u._id}`}
                            onChange={(e) => handleRoleChange(u._id, e.target.value)}
                          >
                            <option value="candidate">Candidate</option>
                            <option value="professional">Professional</option>
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${u.approvalStatus === 'pending' ? 'badge-warning' : u.approvalStatus === 'rejected' ? 'badge-danger' : 'badge-success'} text-xs font-semibold py-1 px-2`}>
                          {u.approvalStatus === 'pending' ? 'Pending Review ⏳' : u.approvalStatus === 'rejected' ? 'Rejected ❌' : 'Approved ✅'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {u.role === 'professional' ? (
                          <div>
                            <div className="font-semibold text-success">{u.title || 'Verified Professional'}</div>
                            <div className="text-xs text-muted">{u.company || 'Tech Org'}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted">{u.company || 'Candidate'}</div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost p-1.5 text-primary"
                            title="View user details"
                            onClick={() => setSelectedUserForDetails(u)}
                          >
                            <Eye size={16} />
                          </button>
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
                          {u.role !== 'admin' && (
                            <button
                              className="btn btn-ghost text-danger p-1.5"
                              title="Delete user account"
                              disabled={actionLoading === `del_${u._id}`}
                              onClick={() => handleDeleteUser(u._id, u.name)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalUserPages > 1 && (
            <div className="p-3 border-t flex justify-between items-center text-xs text-muted" style={{ borderColor: 'var(--border)', backgroundColor: '#fafafa' }}>
              <div>
                Showing {(userPage - 1) * usersPerPage + 1} to {Math.min(userPage * usersPerPage, filteredUsers.length)} of {filteredUsers.length} users
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn btn-outline text-xs p-1"
                  disabled={userPage <= 1}
                  onClick={() => setUserPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-2 font-semibold">Page {userPage} of {totalUserPages}</span>
                <button
                  type="button"
                  className="btn btn-outline text-xs p-1"
                  disabled={userPage >= totalUserPages}
                  onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : currentTab === 'verify' ? (
        /* ================= 4. ACCREDITATION TAB ================= */
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
                        <div className="font-bold text-success">Verified Professional</div>
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
      ) : currentTab === 'bookings' ? (
        /* ================= 5. ALL BOOKINGS ================= */
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          <div className="p-4 border-b flex flex-col md:flex-row gap-3 justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Calendar size={18} className="text-primary" />
                <span>Global Interview Bookings ({filteredBookings.length})</span>
              </h3>
              <p className="text-xs text-muted">Supervise all scheduled, completed, and cancelled mock interview sessions across DevSphere.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search topic, room, user..."
                  className="input-field text-xs"
                  style={{ paddingLeft: '1.8rem', paddingBottom: '0.35rem', paddingTop: '0.35rem', width: '180px' }}
                  value={bookingSearchQuery}
                  onChange={(e) => setBookingSearchQuery(e.target.value)}
                />
              </div>

              <select 
                className="input-field" 
                style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                value={bookingStatusFilter}
                onChange={(e) => setBookingStatusFilter(e.target.value)}
              >
                <option value="all">All Bookings</option>
                <option value="scheduled">Scheduled / Upcoming</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="unpaid">Unpaid Payment</option>
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
                  <th style={{ padding: '0.75rem 1rem' }}>Price</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Payment</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Admin Override</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
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
                        <div className="font-bold text-success text-sm">
                          ₹{b.price || (b.amountPaise ? b.amountPaise / 100 : 0)}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${
                          b.paymentStatus === 'paid' ? 'badge-success' : 
                          b.paymentStatus === 'refunded' ? 'badge-danger' : 'badge-warning'
                        } text-xs font-semibold py-0.5 px-2`}>
                          {b.paymentStatus === 'paid' ? 'Paid ✅' : b.paymentStatus === 'refunded' ? 'Refunded ↩️' : 'Unpaid ⏳'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${
                          b.status === 'completed' ? 'badge-success' : 
                          b.status === 'cancelled' ? 'badge-danger' : 
                          b.status === 'interviewer_no_show' || b.status === 'candidate_no_show' ? 'badge-danger' : 'badge-warning'
                        } text-xs font-semibold py-1 px-2.5`}>
                          {b.status === 'completed' ? 'Completed ✅' : 
                           b.status === 'cancelled' ? 'Cancelled ❌' : 
                           b.status === 'interviewer_no_show' ? 'Interviewer No-Show ⚠️' :
                           b.status === 'candidate_no_show' ? 'Candidate No-Show ⚠️' :
                           b.status === 'expired' ? 'Expired ⌛' : 'Scheduled 📅'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-1.5">
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
                            <option value="interviewer_no_show">Interviewer No-Show</option>
                            <option value="candidate_no_show">Candidate No-Show</option>
                          </select>
                          <button
                            type="button"
                            className="btn btn-ghost text-danger p-1"
                            title="Delete booking record"
                            disabled={actionLoading === `del_book_${b._id}`}
                            onClick={() => handleDeleteBooking(b._id)}
                          >
                            <Trash2 size={15} />
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
      ) : currentTab === 'payouts' ? (
        /* ================= 6. PAYOUT REQUESTS ================= */
        <div className="card p-0" style={{ overflow: 'hidden' }}>
          <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)', backgroundColor: '#f8fafc' }}>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <DollarSign size={18} className="text-primary" />
                <span>Interviewer Payout Requests & Ledger</span>
              </h3>
              <p className="text-xs text-muted">Review, approve, and finalize withdrawal disbursements requested by professional interviewers.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Status:</span>
              <select 
                className="input-field" 
                style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                value={payoutStatusFilter}
                onChange={(e) => setPayoutStatusFilter(e.target.value)}
              >
                <option value="all">All Payouts</option>
                <option value="pending">Pending Review</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#fafafa', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Professional</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Method & Bank Details</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts
                  .filter(p => payoutStatusFilter === 'all' || p.status === payoutStatusFilter)
                  .length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                      No payout requests found matching filter.
                    </td>
                  </tr>
                ) : (
                  payouts
                    .filter(p => payoutStatusFilter === 'all' || p.status === payoutStatusFilter)
                    .map((p) => (
                      <tr key={p._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div className="font-semibold">{p.interviewerId?.name || 'Interviewer'}</div>
                          <div className="text-xs text-muted">{p.interviewerId?.email || 'N/A'}</div>
                          <div className="text-xs text-muted">{p.interviewerId?.company}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div className="font-bold text-success text-base">₹{p.amount?.toLocaleString()}</div>
                          <div className="text-xs text-muted">{p.currency || 'INR'}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div className="font-medium text-xs uppercase">{p.payoutMethod || 'bank_transfer'}</div>
                          {p.bankDetails?.accountNumber ? (
                            <div className="text-xs text-slate-700">
                              A/C: {p.bankDetails.accountNumber} • IFSC: {p.bankDetails.ifscCode}
                              {p.bankDetails.beneficiaryName && <div>Name: {p.bankDetails.beneficiaryName}</div>}
                            </div>
                          ) : p.bankDetails?.upiId ? (
                            <div className="text-xs text-slate-700">UPI: {p.bankDetails.upiId}</div>
                          ) : (
                            <div className="text-xs text-muted">No details provided</div>
                          )}
                          {p.referenceId && (
                            <div className="text-xs text-primary font-mono mt-0.5">Ref: {p.referenceId}</div>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div className="text-xs">{new Date(p.createdAt).toLocaleDateString()}</div>
                          <div className="text-[11px] text-muted">{new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className={`badge ${
                            p.status === 'completed' ? 'badge-success' : 
                            p.status === 'rejected' ? 'badge-danger' : 
                            p.status === 'processing' ? 'badge-info' : 'badge-warning'
                          } text-xs font-semibold py-1 px-2.5`}>
                            {p.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          {p.status === 'pending' && (
                            <div className="flex gap-1.5 justify-end">
                              <button
                                className="btn btn-primary text-xs py-1 px-2"
                                disabled={actionLoading === `payout_${p._id}`}
                                onClick={() => handleUpdatePayoutStatus(p._id, 'processing')}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-outline text-danger text-xs py-1 px-2"
                                disabled={actionLoading === `payout_${p._id}`}
                                onClick={() => handleUpdatePayoutStatus(p._id, 'rejected')}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                          {p.status === 'processing' && (
                            <div className="flex gap-1.5 justify-end">
                              <button
                                className="btn btn-success text-xs py-1 px-2"
                                disabled={actionLoading === `payout_${p._id}`}
                                onClick={() => handleUpdatePayoutStatus(p._id, 'completed')}
                              >
                                Mark Completed
                              </button>
                              <button
                                className="btn btn-outline text-danger text-xs py-1 px-2"
                                disabled={actionLoading === `payout_${p._id}`}
                                onClick={() => handleUpdatePayoutStatus(p._id, 'rejected')}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                          {p.status === 'completed' && (
                            <span className="text-xs text-success font-semibold">Disbursed ✓</span>
                          )}
                          {p.status === 'rejected' && (
                            <span className="text-xs text-danger font-semibold">{p.notes || 'Rejected'}</span>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ================= 7. PLATFORM SETTINGS ================= */
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
                  <label className="text-xs font-semibold">Fixed Session Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input-field text-sm"
                    value={platformSettings.mockSessionPricePaise !== undefined ? platformSettings.mockSessionPricePaise / 100 : 50}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, mockSessionPricePaise: Math.round(Number(e.target.value) * 100) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Total price paid by candidates for every 1-on-1 mock interview (in INR)</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Interviewer Share (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    className="input-field text-sm"
                    value={platformSettings.interviewerSharePercent ?? 70}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, interviewerSharePercent: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Percentage of session fee earned by the interviewer (Default 70%)</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Minimum Payout (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input-field text-sm"
                    value={platformSettings.minPayoutPaise !== undefined ? platformSettings.minPayoutPaise / 100 : 300}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, minPayoutPaise: Math.round(Number(e.target.value) * 100) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Minimum earnings balance required for interviewer withdrawal</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Payment Hold Slot (Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    className="input-field text-sm"
                    value={platformSettings.pendingPaymentMinutes ?? 10}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, pendingPaymentMinutes: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Minutes a slot is locked while candidate completes payment</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Room Access Opens Before (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    className="input-field text-sm"
                    value={platformSettings.joinOpensMinutesBefore ?? 10}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, joinOpensMinutesBefore: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Minutes before session startTime join button unlocks</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Room Access Grace After (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    className="input-field text-sm"
                    value={platformSettings.joinGraceMinutesAfter ?? 15}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, joinGraceMinutesAfter: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Minutes after endTime room remains active before auto-close</span>
                </div>

                <div className="input-group mb-0">
                  <label className="text-xs font-semibold">Interviewer No-Show Wait (Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    className="input-field text-sm"
                    value={platformSettings.noShowWaitMinutes ?? 10}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, noShowWaitMinutes: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">If interviewer hasn't joined within this time, auto-refund candidate</span>
                </div>

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
                  <label className="text-xs font-semibold">Payout Clearance Hold (Days)</label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    className="input-field text-sm"
                    value={platformSettings.payoutHoldDays ?? 3}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, payoutHoldDays: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Days completed sessions are held before withdrawal</span>
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
                  <label className="text-xs font-semibold">Professional Reapply Cooldown (Days)</label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    className="input-field text-sm"
                    value={platformSettings.professionalReapplyAfterDays ?? 30}
                    onChange={(e) => setPlatformSettings(p => ({ ...p, professionalReapplyAfterDays: Number(e.target.value) }))}
                    required
                  />
                  <span className="text-[11px] text-muted mt-1">Days a rejected applicant must wait before reapplying</span>
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

          {/* Dynamic Interview Content */}
          <div className="card p-6">
            <div className="flex justify-between items-start mb-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Briefcase size={20} className="text-primary" />
                  <span>Dynamic Interview Catalog & Target Companies</span>
                </h3>
                <p className="text-xs text-muted mt-1">
                  Manage the dynamic topics, seniority tiers, and companies available in AI Mock Interview and booking filters.
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
                    className="badge badge-primary text-xs flex items-center gap-1.5 py-1 px-3"
                    style={{ borderRadius: '8px' }}
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => setInterviewConfig(c => ({ ...c, topics: c.topics.filter((_, i) => i !== idx) }))}
                      className="text-white hover:text-danger"
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
                  placeholder="e.g. Next.js & Server Components"
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
            <div className="mb-6">
              <label className="text-xs font-semibold block mb-2">Target Tech Companies</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {(interviewConfig.companies || []).map((comp, idx) => (
                  <span 
                    key={idx}
                    className="badge text-xs flex items-center gap-1.5 py-1 px-3"
                    style={{ backgroundColor: '#e2e8f0', color: '#0f172a', borderRadius: '8px' }}
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
                  placeholder="e.g. Stripe, OpenAI, Uber"
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

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveInterviewConfig}
                disabled={savingSettings}
                className="btn btn-primary text-xs flex items-center gap-1.5 px-6 py-2.5 font-bold"
              >
                <Save size={15} />
                <span>{savingSettings ? 'Saving Catalog...' : 'Save Catalog & Companies'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: INVITE PROFESSIONAL ================= */}
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
                  Enter professional email. An invitation email will be sent with a secure link to set their own password.
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
                {inviteSuccessData.invitationLink && (
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
                )}

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

                {/* Email Address */}
                <div className="input-group mb-3">
                  <label className="text-xs font-semibold">Professional Email Address *</label>
                  <input 
                    type="email"
                    className="input-field text-sm"
                    placeholder="e.g. professional.interviewer@example.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>

                {/* Name */}
                <div className="input-group mb-3">
                  <label className="text-xs font-semibold">Full Name (Optional)</label>
                  <input 
                    type="text"
                    className="input-field text-sm"
                    placeholder="e.g. Ananya Iyer"
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                {/* Company & Designation */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="input-group mb-0">
                    <label className="text-xs font-semibold">Company (Optional)</label>
                    <input 
                      type="text"
                      className="input-field text-sm"
                      placeholder="e.g. Google / Microsoft"
                      value={inviteForm.company}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, company: e.target.value }))}
                    />
                  </div>

                  <div className="input-group mb-0">
                    <label className="text-xs font-semibold">Designation / Title (Optional)</label>
                    <input 
                      type="text"
                      className="input-field text-sm"
                      placeholder="e.g. Senior Staff Engineer"
                      value={inviteForm.designation}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, designation: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Experience & Domain */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="input-group mb-0">
                    <label className="text-xs font-semibold">Experience</label>
                    <input 
                      type="text"
                      className="input-field text-sm"
                      placeholder="e.g. 5+ Years"
                      value={inviteForm.experience}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, experience: e.target.value }))}
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

      {/* ================= MODAL: VIEW USER DETAILS ================= */}
      {selectedUserForDetails && (
        <div className="modal-overlay" onClick={() => setSelectedUserForDetails(null)}>
          <div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '560px', 
              padding: '2rem', 
              borderRadius: '24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 45px rgba(0,0,0,0.2)'
            }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <Avatar 
                  name={selectedUserForDetails.name} 
                  avatar={selectedUserForDetails.avatar} 
                  size={52} 
                />
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-1.5">
                    {selectedUserForDetails.name}
                    {selectedUserForDetails.isVerified && <ShieldCheck size={18} className="text-success" />}
                  </h3>
                  <div className="text-xs text-muted">{selectedUserForDetails.email}</div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedUserForDetails(null)}
                className="btn btn-ghost p-1 text-muted"
                style={{ borderRadius: '50%' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-muted block">Role</span>
                <span className="font-bold uppercase text-slate-800">{selectedUserForDetails.role}</span>
              </div>
              <div>
                <span className="text-muted block">Account Status</span>
                <span className="font-bold text-slate-800">{selectedUserForDetails.accountStatus || (selectedUserForDetails.isDeactivated ? 'Deactivated' : 'Active')}</span>
              </div>
              <div>
                <span className="text-muted block">Approval Status</span>
                <span className="font-bold text-slate-800">{selectedUserForDetails.approvalStatus || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted block">Verification</span>
                <span className="font-bold text-slate-800">{selectedUserForDetails.isVerified ? 'Verified ✅' : 'Unverified ⚠️'}</span>
              </div>
              <div>
                <span className="text-muted block">Company</span>
                <span className="font-bold text-slate-800">{selectedUserForDetails.company || 'Not Specified'}</span>
              </div>
              <div>
                <span className="text-muted block">Designation</span>
                <span className="font-bold text-slate-800">{selectedUserForDetails.title || selectedUserForDetails.designation || 'Not Specified'}</span>
              </div>
              <div>
                <span className="text-muted block">Experience</span>
                <span className="font-bold text-slate-800">{selectedUserForDetails.experience || 'Not Specified'}</span>
              </div>
              <div>
                <span className="text-muted block">Member Since</span>
                <span className="font-bold text-slate-800">{new Date(selectedUserForDetails.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            {selectedUserForDetails.bio && (
              <div className="mb-4">
                <span className="text-xs font-semibold block text-slate-600 mb-1">Bio / Profile Statement:</span>
                <p className="text-xs text-slate-700 p-2.5 rounded-lg bg-slate-50 border border-slate-200 leading-relaxed">
                  "{selectedUserForDetails.bio}"
                </p>
              </div>
            )}

            {selectedUserForDetails.skills && selectedUserForDetails.skills.length > 0 && (
              <div className="mb-4">
                <span className="text-xs font-semibold block text-slate-600 mb-1">Key Skills:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedUserForDetails.skills.map((s, idx) => (
                    <span key={idx} className="badge badge-secondary text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
              <button
                type="button"
                className="btn btn-outline text-xs px-4 py-2"
                onClick={() => setSelectedUserForDetails(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: VIEW REQUEST DETAILS ================= */}
      {selectedRequestForDetails && (
        <div className="modal-overlay" onClick={() => setSelectedRequestForDetails(null)}>
          <div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: '620px', 
              padding: '2rem', 
              borderRadius: '24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 45px rgba(0,0,0,0.2)'
            }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <Avatar 
                  name={selectedRequestForDetails.name} 
                  avatar={selectedRequestForDetails.avatar} 
                  size={56} 
                />
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-1.5">
                    {selectedRequestForDetails.name}
                    {selectedRequestForDetails.isVerified && <ShieldCheck size={18} className="text-success" />}
                  </h3>
                  <div className="text-xs text-muted">{selectedRequestForDetails.email}</div>
                  <div className="text-xs text-primary font-semibold mt-0.5">
                    {selectedRequestForDetails.title || selectedRequestForDetails.designation || 'Applicant'} • {selectedRequestForDetails.company || 'Tech Org'}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedRequestForDetails(null)}
                className="btn btn-ghost p-1 text-muted"
                style={{ borderRadius: '50%' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-muted block">Approval Status</span>
                <span className="font-bold uppercase text-slate-800">{selectedRequestForDetails.approvalStatus}</span>
              </div>
              <div>
                <span className="text-muted block">Applied On</span>
                <span className="font-bold text-slate-800">{new Date(selectedRequestForDetails.appliedAt || selectedRequestForDetails.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted block">Years of Experience</span>
                <span className="font-bold text-slate-800">{selectedRequestForDetails.experience || 'Not Specified'}</span>
              </div>
              <div>
                <span className="text-muted block">Track / Domain</span>
                <span className="font-bold text-slate-800">{selectedRequestForDetails.domain || 'Software Engineering'}</span>
              </div>
            </div>

            {selectedRequestForDetails.bio && (
              <div className="mb-4">
                <span className="text-xs font-semibold block text-slate-600 mb-1">Applicant Statement / Bio:</span>
                <p className="text-xs text-slate-700 p-2.5 rounded-lg bg-slate-50 border border-slate-200 leading-relaxed">
                  "{selectedRequestForDetails.bio}"
                </p>
              </div>
            )}

            {selectedRequestForDetails.linkedin && (
              <div className="mb-4">
                <a 
                  href={selectedRequestForDetails.linkedin.startsWith('http') ? selectedRequestForDetails.linkedin : `https://${selectedRequestForDetails.linkedin}`}
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs text-primary inline-flex items-center gap-1 font-semibold hover:underline"
                >
                  <ExternalLink size={13} />
                  <span>Open Applicant LinkedIn Profile</span>
                </a>
              </div>
            )}

            {selectedRequestForDetails.skills && selectedRequestForDetails.skills.length > 0 && (
              <div className="mb-4">
                <span className="text-xs font-semibold block text-slate-600 mb-1">Stated Skills:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedRequestForDetails.skills.map((s, idx) => (
                    <span key={idx} className="badge badge-secondary text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Decision Controls */}
            <div className="flex flex-wrap gap-2 justify-end pt-3 border-t mt-4">
              <button
                type="button"
                className="btn btn-outline text-xs px-3 py-2"
                onClick={() => setSelectedRequestForDetails(null)}
              >
                Close
              </button>
              {selectedRequestForDetails.approvalStatus === 'pending' && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary text-xs px-4 py-2 font-semibold"
                    style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                    onClick={() => handleRequestDecision(selectedRequestForDetails._id, 'approve')}
                  >
                    ✓ Approve as Professional
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline text-xs px-3 py-2"
                    style={{ borderColor: '#3b82f6', color: '#1d4ed8' }}
                    onClick={() => handleRequestDecision(selectedRequestForDetails._id, 'make_candidate')}
                  >
                    Convert to Candidate
                  </button>
                  <button
                    type="button"
                    className="btn text-xs px-3 py-2 text-danger"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)' }}
                    onClick={() => {
                      const reason = prompt(`Enter rejection reason for ${selectedRequestForDetails.name}:`, 'Experience criteria not matching current requirements');
                      if (reason !== null) {
                        handleRequestDecision(selectedRequestForDetails._id, 'reject', reason);
                      }
                    }}
                  >
                    ✕ Reject
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
