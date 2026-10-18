import { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Trash2, CheckCircle, Save, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../utils/apiClient';

const DAYS_OF_WEEK = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 0, name: 'Sunday' }
];

const Availability = () => {
  const [slotPresets, setSlotPresets] = useState([]);
  const [rules, setRules] = useState([]);
  const [selectedDay, setSelectedDay] = useState(1); // Monday default
  const [newSlotInput, setNewSlotInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const navigate = useNavigate();

  const fetchAvailabilityConfig = async () => {
    try {
      setLoading(true);
      const [presetsRes, rulesRes] = await Promise.all([
        apiClient.get('/api/availability/presets'),
        apiClient.get('/api/availability/rules/my-rules')
      ]);

      if (presetsRes?.data?.slotPresets) {
        setSlotPresets(presetsRes.data.slotPresets);
      }

      if (rulesRes?.data) {
        setRules(rulesRes.data);
      }
    } catch (err) {
      console.error('Failed to load availability:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailabilityConfig();
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Get slots for currently selected day
  const currentDayRules = rules.filter(r => r.dayOfWeek === selectedDay);

  const handleToggleSlotForDay = (preset) => {
    const exists = rules.some(r => r.dayOfWeek === selectedDay && r.slotLabel === preset);
    let updatedRules;

    if (exists) {
      updatedRules = rules.filter(r => !(r.dayOfWeek === selectedDay && r.slotLabel === preset));
    } else {
      const parts = preset.split('-').map(s => s.trim());
      updatedRules = [
        ...rules,
        {
          dayOfWeek: selectedDay,
          startTime: parts[0] || '10:00 AM',
          endTime: parts[1] || '10:45 AM',
          slotLabel: preset,
          isActive: true
        }
      ];
    }
    setRules(updatedRules);
  };

  const handleAddCustomSlot = (e) => {
    e.preventDefault();
    const trimmed = newSlotInput.trim();
    if (!trimmed) return;

    if (rules.some(r => r.dayOfWeek === selectedDay && r.slotLabel === trimmed)) {
      alert('This slot is already added for this day.');
      return;
    }

    const parts = trimmed.split('-').map(s => s.trim());
    const newRule = {
      dayOfWeek: selectedDay,
      startTime: parts[0] || trimmed,
      endTime: parts[1] || trimmed,
      slotLabel: trimmed,
      isActive: true
    };

    setRules([...rules, newRule]);
    setNewSlotInput('');
  };

  const handleRemoveRule = (ruleToRemove) => {
    setRules(rules.filter(r => !(r.dayOfWeek === ruleToRemove.dayOfWeek && r.slotLabel === ruleToRemove.slotLabel)));
  };

  const handleSaveAllRules = async () => {
    try {
      setSaving(true);
      const res = await apiClient.post('/api/availability/rules', { rules });
      showToast(res.message || 'Weekly schedule saved and upcoming slots generated! ✅');
      await fetchAvailabilityConfig();
    } catch (err) {
      alert('Error saving schedule: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-12 text-center text-muted">
        <Loader2 className="animate-spin text-primary mx-auto mb-3" size={32} />
        <span>Loading availability configuration from database...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#1e293b',
          color: 'white',
          padding: '0.85rem 1.5rem',
          borderRadius: '10px',
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
            <span className="text-xs text-muted">Schedule Manager</span>
          </div>
          <h2 className="text-2xl font-bold mt-1">Weekly Recurring Availability</h2>
          <p className="text-muted text-sm">
            Set your weekly recurring hours. The system automatically creates bookable slots for the upcoming window.
          </p>
        </div>
        <button
          onClick={handleSaveAllRules}
          disabled={saving}
          className="btn btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          <span>{saving ? 'Publishing Slots...' : 'Publish Schedule'}</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem' }}>
        {/* Days Column */}
        <div className="card p-3">
          <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-2">Days of Week</label>
          <div className="flex flex-col gap-1">
            {DAYS_OF_WEEK.map(day => {
              const daySlotCount = rules.filter(r => r.dayOfWeek === day.id).length;
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setSelectedDay(day.id)}
                  className={`flex justify-between items-center p-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    selectedDay === day.id ? 'bg-primary text-white shadow-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{day.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selectedDay === day.id ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-muted'
                  }`}>
                    {daySlotCount} slots
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Slots for Selected Day */}
        <div className="flex flex-col gap-5">
          {/* Active Slots on Day */}
          <div className="card">
            <h3 className="font-bold text-base mb-1">
              Active Slots for {DAYS_OF_WEEK.find(d => d.id === selectedDay)?.name}
            </h3>
            <p className="text-xs text-muted mb-4">
              Candidates can select any of these slots on this weekday.
            </p>

            {currentDayRules.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed rounded-xl text-muted text-sm">
                No active slots set for {DAYS_OF_WEEK.find(d => d.id === selectedDay)?.name}. Select presets below to add bookable slots.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {currentDayRules.map(rule => (
                  <div
                    key={rule.slotLabel}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-semibold"
                  >
                    <Clock size={14} />
                    <span>{rule.slotLabel}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(rule)}
                      className="text-red-500 hover:text-red-700 ml-1"
                      title="Remove this slot"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preset Slot Options */}
          <div className="card">
            <h3 className="font-bold text-base mb-1">Platform Slot Presets</h3>
            <p className="text-xs text-muted mb-4">
              Click a preset slot below to toggle it on or off for {DAYS_OF_WEEK.find(d => d.id === selectedDay)?.name}.
            </p>

            <div className="flex flex-wrap gap-2">
              {slotPresets.map(preset => {
                const isActive = rules.some(r => r.dayOfWeek === selectedDay && r.slotLabel === preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleToggleSlotForDay(preset)}
                    className={`btn text-xs py-2 px-3 flex items-center gap-2 ${
                      isActive ? 'btn-primary' : 'btn-outline'
                    }`}
                  >
                    <Clock size={13} />
                    <span>{preset}</span>
                    {isActive && <CheckCircle size={13} />}
                  </button>
                );
              })}
            </div>

            {/* Custom Slot Addition */}
            <form onSubmit={handleAddCustomSlot} className="flex gap-2 mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <input
                type="text"
                placeholder="Custom Slot e.g. 01:00 PM - 01:45 PM"
                className="input flex-1 text-sm"
                value={newSlotInput}
                onChange={(e) => setNewSlotInput(e.target.value)}
              />
              <button type="submit" className="btn btn-outline flex items-center gap-1.5 text-xs">
                <Plus size={15} />
                <span>Add Custom</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Availability;
