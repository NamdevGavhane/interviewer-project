import { useState, useEffect } from 'react';
import { ArrowLeft, BadgeCheck, Briefcase, MapPin, Clock, Edit2, Save } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

const Profile = () => {
  const [searchParams] = useSearchParams();
  const profileUserId = searchParams.get('userId');

  const currentUserId = localStorage.getItem('userId');
  const targetId = profileUserId || currentUserId;

  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // Form State
  const [editForm, setEditForm] = useState({
    name: '',
    title: '',
    company: '',
    bio: '',
    hourlyRate: 100,
    skills: ''
  });

  const fetchProfile = async () => {
    if (!targetId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`http://localhost:5000/api/users/${targetId}`);
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
        setEditForm({
          name: data.name || '',
          title: data.title || '',
          company: data.company || '',
          bio: data.bio || '',
          hourlyRate: data.hourlyRate || 100,
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
      const res = await fetch(`http://localhost:5000/api/users/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          title: editForm.title,
          company: editForm.company,
          bio: editForm.bio,
          hourlyRate: Number(editForm.hourlyRate),
          skills: editForm.skills.split(',').map(s => s.trim()).filter(Boolean)
        })
      });

      if (res.ok) {
        const updated = await res.json();
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

  const isOwnProfile = currentUserId === profileData._id;

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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group">
              <label>Company / Organization</label>
              <input 
                type="text" 
                className="input-field"
                value={editForm.company}
                onChange={(e) => setEditForm(p => ({ ...p, company: e.target.value }))}
              />
            </div>
            {profileData.role === 'professional' && (
              <div className="input-group">
                <label>Hourly Rate (₹)</label>
                <input 
                  type="number" 
                  className="input-field"
                  value={editForm.hourlyRate}
                  onChange={(e) => setEditForm(p => ({ ...p, hourlyRate: e.target.value }))}
                />
              </div>
            )}
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
                <img 
                  src={profileData.avatar || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&auto=format&fit=crop&w=100&q=80'} 
                  alt={profileData.name} 
                  className="profile-avatar"
                  style={{ width: '80px', height: '80px' }}
                />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold">{profileData.name}</h2>
                    <span className="badge badge-success flex items-center gap-1">
                      <BadgeCheck size={14} /> Verified {profileData.role}
                    </span>
                  </div>
                  <p className="text-sm text-muted">{profileData.title || 'Tech Professional'}</p>
                  <div className="flex items-center gap-1 mt-1 text-sm font-medium" style={{ color: '#f59e0b' }}>
                    ⭐ {profileData.rating || 4.9} <span className="text-muted text-sm font-normal">({profileData.reviewsCount || 10} reviews)</span>
                  </div>
                </div>
              </div>
              
              {profileData.role === 'professional' && (
                <div className="flex flex-col items-end gap-3">
                  <div className="text-right">
                    <span className="text-2xl font-bold">₹{profileData.hourlyRate}</span>
                    <span className="text-muted text-sm"> / session</span>
                  </div>
                  {!isOwnProfile && (
                    <Link to={`/booking?interviewerId=${profileData._id}`}>
                      <button className="btn btn-primary px-6">Book Mock Interview</button>
                    </Link>
                  )}
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
                {(profileData.availabilitySlots || ['10:00 AM - 10:45 AM', '02:00 PM - 02:45 PM', '06:00 PM - 06:45 PM']).map((slot, i) => (
                  <div key={i} className="flex justify-between items-center p-3 border rounded-lg hover:border-primary transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <Clock size={16} className="text-primary" />
                      <div className="text-sm font-medium">{slot}</div>
                    </div>
                    {!isOwnProfile && (
                      <Link to={`/booking?interviewerId=${profileData._id}`}>
                        <button className="btn btn-primary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>Book</button>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Profile;
