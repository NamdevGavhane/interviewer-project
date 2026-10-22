import { useState, useEffect } from 'react';
import { ArrowLeft, BadgeCheck, Briefcase, MapPin, Clock, Edit2, Save } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';

const Profile = () => {
  const [searchParams] = useSearchParams();
  const profileUserId = searchParams.get('userId');

  const { user: currentUser, role: authRole } = useAuth();
  const isCandidate = authRole === 'candidate';
  const targetId = profileUserId || currentUser?._id;

  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  // Form State
  const [editForm, setEditForm] = useState({
    name: '',
    title: '',
    company: '',
    bio: '',
    skills: ''
  });

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Please select a valid image (JPEG, PNG, or WebP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Image file size must be 2MB or less.');
      return;
    }

    try {
      setUploadingAvatar(true);
      setAvatarError('');
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await apiClient.post('/api/users/avatar', formData);
      if (res && res.avatar) {
        setProfileData(prev => ({ ...prev, avatar: res.avatar }));
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 3000);
      }
    } catch (err) {
      setAvatarError(err.message || 'Avatar upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const fetchProfile = async () => {
    if (!targetId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await apiClient.get(`/api/users/${targetId}`);
      if (data) {
        setProfileData(data);
        setEditForm({
          name: data.name || '',
          title: data.title || '',
          company: data.company || '',
          bio: data.bio || '',
          skills: data.skills ? data.skills.join(', ') : ''
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [targetId]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const updated = await apiClient.put(`/api/users/${targetId}`, {
        name: editForm.name,
        title: editForm.title,
        company: editForm.company,
        bio: editForm.bio,
        skills: editForm.skills.split(',').map(s => s.trim()).filter(Boolean)
      });

      if (updated) {
        setProfileData(updated);
        setIsEditing(false);
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 3000);
      }
    } catch (err) {
      alert('Error saving profile: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="card text-center p-12 text-muted">Loading profile data...</div>;
  if (!profileData) return <div className="card p-6">Profile not found. Please log in first.</div>;

  const isOwnProfile = Boolean(currentUser?._id && currentUser._id === profileData._id);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <Link to="/" className="inline-flex items-center gap-2 text-muted hover:text-primary transition-colors">
          <ArrowLeft size={18} />
          <span className="font-medium">Back to Dashboard</span>
        </Link>
        {isOwnProfile && (
          <button 
            className="btn btn-outline flex items-center gap-2"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Edit2 size={16} />
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </button>
        )}
      </div>

      {saveToast && (
        <div className="badge badge-success text-sm py-2 px-4 mb-4 w-full text-center">
          ✓ Profile changes updated successfully in database!
        </div>
      )}

      {/* Editing Form */}
      {isEditing ? (
        <form onSubmit={handleSaveProfile} className="card mb-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Edit2 size={18} className="text-primary" />
            Edit Your Profile Details
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label>Full Name</label>
              <input 
                type="text" 
                className="input-field"
                value={editForm.name}
                onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="input-group">
              <label>Professional Title / Tagline</label>
              <input 
                type="text" 
                className="input-field"
                value={editForm.title}
                onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
          </div>

          <div className="input-group">
            <label>Company / Organization</label>
            <input 
              type="text" 
              className="input-field"
              value={editForm.company}
              onChange={(e) => setEditForm(p => ({ ...p, company: e.target.value }))}
            />
          </div>

          <div className="input-group">
            <label>Skills (Comma-separated)</label>
            <input 
              type="text" 
              className="input-field"
              placeholder="e.g. React, TypeScript, Node.js, System Design"
              value={editForm.skills}
              onChange={(e) => setEditForm(p => ({ ...p, skills: e.target.value }))}
            />
          </div>

          <div className="input-group">
            <label>Biography / About</label>
            <textarea 
              rows={3}
              className="input-field"
              value={editForm.bio}
              onChange={(e) => setEditForm(p => ({ ...p, bio: e.target.value }))}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary self-start flex items-center gap-2"
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      ) : (
        /* View Mode */
        <>
          <div className="card mb-6">
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-4">
                <div className="flex flex-col items-center gap-2">
                  <Avatar 
                    name={profileData.name} 
                    avatar={profileData.avatar} 
                    size={80} 
                  />
                  {isOwnProfile && (
                    <label className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', cursor: 'pointer' }}>
                      {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
                      <input 
                        type="file" 
                        accept="image/jpeg,image/png,image/webp" 
                        onChange={handleAvatarFileChange} 
                        style={{ display: 'none' }} 
                        disabled={uploadingAvatar}
                      />
                    </label>
                  )}
                  {avatarError && <div className="text-xs text-red-500 mt-1 max-w-[120px] text-center">{avatarError}</div>}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold">{profileData.name}</h2>
                    <span className="badge badge-success flex items-center gap-1">
                      <BadgeCheck size={14} /> Verified {profileData.role}
                    </span>
                  </div>
                  <p className="text-sm text-muted">{profileData.title || 'Tech Professional'}</p>
                  <div className="flex items-center gap-1 mt-1 text-sm font-medium" style={{ color: '#f59e0b' }}>
                    ⭐ {profileData.rating ? profileData.rating.toFixed(1) : 'New'} <span className="text-muted text-sm font-normal">({profileData.reviewsCount || 0} reviews)</span>
                  </div>
                </div>
              </div>
              
              {profileData.role === 'professional' && !isOwnProfile && isCandidate && (
                <div className="flex flex-col items-end gap-3">
                  <Link to={`/booking?interviewerId=${profileData._id}`}>
                    <button className="btn btn-primary px-6">Book Mock Interview</button>
                  </Link>
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              {profileData.skills?.map(skill => (
                <span key={skill} className="badge" style={{ backgroundColor: '#eff6ff', color: 'var(--primary)', padding: '0.25rem 0.75rem' }}>{skill}</span>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
            {/* About Section */}
            <div className="card">
              <h3 className="font-bold text-lg mb-4">About</h3>
              <p className="text-sm text-muted mb-6 leading-relaxed">
                {profileData.bio || 'Experienced software professional passionate about conducting technical mock interviews and mentoring.'}
              </p>
              
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 text-sm text-muted">
                  <Briefcase size={18} />
                  <span>{profileData.company || 'Tech Industry'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted">
                  <MapPin size={18} />
                  <span>Remote / Global</span>
                </div>
              </div>
            </div>

            {/* Available Slots */}
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">Active Time Slots</h3>
              </div>
              
              <div className="flex flex-col gap-3">
                {profileData.availabilitySlots && profileData.availabilitySlots.length > 0 ? (
                  profileData.availabilitySlots.map((slot, i) => (
                    <div key={i} className="flex justify-between items-center p-3 border rounded-lg hover:border-primary transition-colors" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-3">
                        <Clock size={16} className="text-primary" />
                        <div className="text-sm font-medium">{slot}</div>
                      </div>
                      {!isOwnProfile && isCandidate && (
                        <Link to={`/booking?interviewerId=${profileData._id}`}>
                          <button className="btn btn-primary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>Book</button>
                        </Link>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-muted bg-slate-50 rounded-lg border border-dashed" style={{ borderColor: 'var(--border)' }}>
                    No active time slots available. {isOwnProfile ? 'Add availability from your schedule dashboard.' : 'Check back later for updated slots.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Profile;
