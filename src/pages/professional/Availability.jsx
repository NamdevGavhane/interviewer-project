import { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Trash2, CheckCircle, Save, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';

const DEFAULT_SLOT_PRESETS = [
  '09:00 AM - 09:45 AM',
  '10:00 AM - 10:45 AM',
  '11:00 AM - 11:45 AM',
  '02:00 PM - 02:45 PM',
  '03:30 PM - 04:15 PM',
  '05:00 PM - 05:45 PM',
  '06:30 PM - 07:15 PM',
  '07:30 PM - 08:15 PM',
  '08:30 PM - 09:15 PM'
];

const Availability = () => {
  const [userData, setUserData] = useState(null);
  const [slots, setSlots] = useState([]);
  const [newSlotInput, setNewSlotInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const navigate = useNavigate();

  const userId = localStorage.getItem('userId');

  useEffect(() => {
    if (!userId) {
      navigate('/login');
      return;
    }

    const fetchUser = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/users/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setUserData(data);
          setSlots(data.availabilitySlots || ['10:00 AM - 10:45 AM', '02:00 PM - 02:45 PM', '05:00 PM - 05:45 PM']);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, navigate]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const saveSlots = async (newSlots) => {
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availabilitySlots: newSlots })
      });

      if (!res.ok) throw new Error('Failed to update availability');
      showToast('Availability slots saved to live profile! ✅');
    } catch (err) {
      alert('Error saving slots: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomSlot = async (e) => {
    e.preventDefault();
    const trimmed = newSlotInput.trim();
    if (!trimmed) return;
    if (slots.includes(trimmed)) {
      alert('This slot is already added.');
      return;
    }
    const updated = [...slots, trimmed];
    setSlots(updated);
    setNewSlotInput('');
    await saveSlots(updated);
  };

  const handleTogglePreset = async (preset) => {
    const updated = slots.includes(preset)
      ? slots.filter(s => s !== preset)
      : [...slots, preset];
    setSlots(updated);
    await saveSlots(updated);
  };

  const handleRemoveSlot = async (slotToRemove) => {
    const updated = slots.filter(s => s !== slotToRemove);
    setSlots(updated);
    await saveSlots(updated);
  };

  const handleSaveAvailability = async () => {
    await saveSlots(slots);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '3rem' }}>
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
            <span className="badge badge-info text-xs font-semibold uppercase">Professional Module</span>
            <span className="text-xs text-muted">Availability Management</span>
          </div>
          <h2 className="text-2xl font-bold mt-1">Interviewer Availability & Slots</h2>
          <p className="text-muted text-sm">Configure your active booking slots. Candidates will only be able to book sessions during these times.</p>
        </div>

        <button 
          onClick={handleSaveAvailability} 
          disabled={saving || loading}
          className="btn btn-primary"
        >
          <Save size={16} />
          <span>{saving ? 'Saving...' : 'Save Availability'}</span>
        </button>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-muted">Loading availability schedule...</div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Quick Preset Selector */}
          <div className="card">
            <h3 className="font-bold text-base mb-2">⚡ Quick 45-Min Slot Presets</h3>
            <p className="text-xs text-muted mb-4">Click to instantly toggle common interview times into your active schedule:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {DEFAULT_SLOT_PRESETS.map((preset) => {
                const isActive = slots.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleTogglePreset(preset)}
                    className={`btn text-xs ${isActive ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '0.45rem 0.85rem' }}
                  >
                    <Clock size={14} />
                    <span>{preset}</span>
                    {isActive && <CheckCircle size={12} style={{ marginLeft: '4px' }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add Custom Time Slot */}
          <div className="card">
            <h3 className="font-bold text-base mb-2">➕ Add Custom Time Slot</h3>
            <form onSubmit={handleAddCustomSlot} className="flex gap-3">
              <input 
                type="text" 
                placeholder="e.g. 04:00 PM - 04:45 PM" 
                className="input-field"
                style={{ flex: 1 }}
                value={newSlotInput}
                onChange={(e) => setNewSlotInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                <Plus size={16} />
                <span>Add Slot</span>
              </button>
            </form>
          </div>

          {/* Active Slots List */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base">Current Active Slots ({slots.length})</h3>
              <span className="text-xs text-muted">Available to candidates on Booking Page</span>
            </div>

            {slots.length === 0 ? (
              <div className="text-center p-8 text-muted border rounded-xl" style={{ borderStyle: 'dashed' }}>
                <AlertCircle size={32} className="mx-auto mb-2 text-warning" />
                <p>No availability slots active. Add or select presets above so candidates can book interviews with you.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {slots.map((slot, index) => (
                  <div 
                    key={index} 
                    className="flex justify-between items-center p-3 border rounded-xl"
                    style={{ backgroundColor: '#f8fafc', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <Clock size={16} className="text-primary" />
                      <span>{slot}</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveSlot(slot)}
                      className="btn btn-ghost text-danger p-1"
                      title="Remove slot"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Availability;
