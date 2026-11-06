import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  X,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Globe,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import apiClient from '../../utils/apiClient';

/**
 * Format minutes into 12-hour AM/PM string (e.g. 5:00 PM, 5:45 PM)
 */
const formatMinutesToAmPm = (totalMins) => {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m < 10 ? `0${m}` : m;
  return `${displayH}:${displayM} ${period}`;
};

/**
 * Get IANA timezone options safely with fallback
 */
const getTimezoneOptions = () => {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      const list = Intl.supportedValuesOf('timeZone');
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch {
    // fallback
  }
  return [
    'Asia/Kolkata', 'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney'
  ];
};

/**
 * Get current ISO date (YYYY-MM-DD) for a given timezone
 */
const getTodayIso = (tz) => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

/**
 * Add days to YYYY-MM-DD string
 */
const addDaysToDateStr = (dateStr, days) => {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  } catch {
    const dt = new Date();
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
  }
};

/**
 * Format chip date e.g. "Fri, Nov 6"
 */
const formatDateChip = (dateStr) => {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return dt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  } catch {
    return dateStr;
  }
};

/**
 * Format date heading e.g. "Today (Fri, 6 Nov 2026)", "Tomorrow (Sat, 7 Nov 2026)", or "Sat 8 Nov 2026"
 */
const formatGroupDateHeader = (dateStr, tz) => {
  const today = getTodayIso(tz);
  const tomorrow = addDaysToDateStr(today, 1);

  let readable = dateStr;
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    readable = dt.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
  } catch {
    readable = dateStr;
  }

  if (dateStr === today) {
    return `Today (${readable})`;
  }
  if (dateStr === tomorrow) {
    return `Tomorrow (${readable})`;
  }
  return readable;
};

const Availability = () => {
  // Public config state
  const [config, setConfig] = useState({
    slotDurationMinutes: 45,
    slotBreakMinutes: 0,
    bookingWindowDays: 30
  });

  // Timezone state
  const browserTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }, []);

  const [timezone, setTimezone] = useState(browserTimezone);
  const [isChangingTz, setIsChangingTz] = useState(false);

  const timezoneOptions = useMemo(() => {
    const list = getTimezoneOptions();
    if (browserTimezone && !list.includes(browserTimezone)) {
      return [browserTimezone, ...list];
    }
    return list;
  }, [browserTimezone]);

  // Form state
  const [dateInput, setDateInput] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [repeatWeeks, setRepeatWeeks] = useState(0);

  // Slots & Loading state
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState(null);

  // Action states
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [confirmDeleteSlotId, setConfirmDeleteSlotId] = useState(null);
  const [deletingSlotId, setDeletingSlotId] = useState(null);
  const [confirmClearDate, setConfirmClearDate] = useState(null);
  const [clearingDate, setClearingDate] = useState(null);

  // Toast notification state
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, []);

  // Compute allowed date boundaries
  const todayIso = useMemo(() => getTodayIso(timezone), [timezone]);
  const maxDateIso = useMemo(() => {
    return addDaysToDateStr(todayIso, config.bookingWindowDays || 30);
  }, [todayIso, config.bookingWindowDays]);

  // Fetch public config on mount
  useEffect(() => {
    let ignore = false;
    apiClient.get('/api/config/public').then(res => {
      if (!ignore && res) {
        setConfig({
          slotDurationMinutes: res.slotDurationMinutes || 45,
          slotBreakMinutes: res.slotBreakMinutes ?? 0,
          bookingWindowDays: res.bookingWindowDays || 30
        });
      }
    }).catch(err => {
      console.warn('Failed to load public config, using defaults:', err.message);
    });
    return () => { ignore = true; };
  }, []);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refreshSlots = useCallback(() => {
    setLoadingSlots(true);
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Fetch upcoming slots
  useEffect(() => {
    let ignore = false;
    const from = getTodayIso(timezone);
    const to = addDaysToDateStr(from, config.bookingWindowDays || 30);
    apiClient.get(`/api/availability/my-slots?from=${from}&to=${to}`).then(res => {
      if (!ignore) {
        if (res?.data) {
          setSlots(res.data);
        } else if (Array.isArray(res)) {
          setSlots(res);
        } else {
          setSlots([]);
        }
        setSlotsError(null);
        setLoadingSlots(false);
      }
    }).catch(err => {
      if (!ignore) {
        setSlotsError(err.message || 'Failed to load upcoming slots.');
        setLoadingSlots(false);
      }
    });
    return () => { ignore = true; };
  }, [timezone, config.bookingWindowDays, refreshTrigger]);

  // Client-side live preview computation
  const preview = useMemo(() => {
    if (!startTime || !endTime) {
      return { status: 'incomplete', message: 'Set From and To times above to see live preview.' };
    }
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    if (Number.isNaN(sH) || Number.isNaN(sM) || Number.isNaN(eH) || Number.isNaN(eM)) {
      return { status: 'error', message: 'Invalid time format.' };
    }
    const startMin = sH * 60 + sM;
    const endMin = eH * 60 + eM;
    const windowMinutes = endMin - startMin;

    if (windowMinutes <= 0) {
      return { status: 'error', message: 'End time must be after start time.' };
    }
    if (windowMinutes > 12 * 60) {
      return { status: 'error', message: 'Window cannot be longer than 12 hours.' };
    }
    if (windowMinutes < config.slotDurationMinutes) {
      return {
        status: 'warning',
        warningType: 'shorter_than_session',
        message: `Window length (${windowMinutes} min) is shorter than one session (${config.slotDurationMinutes} min).`
      };
    }

    let cur = startMin;
    const sampleSessions = [];
    while (cur + config.slotDurationMinutes <= endMin) {
      const s = cur;
      const e = cur + config.slotDurationMinutes;
      sampleSessions.push({
        startMin: s,
        endMin: e,
        label: `${formatMinutesToAmPm(s)} - ${formatMinutesToAmPm(e)}`
      });
      cur = e + config.slotBreakMinutes;
    }

    const lastSessionEnd = sampleSessions.length > 0
      ? sampleSessions[sampleSessions.length - 1].endMin
      : startMin;
    const leftoverMinutes = endMin - lastSessionEnd;

    const totalDaysCount = (selectedDates.length > 0 ? selectedDates.length : 1) * (repeatWeeks + 1);
    const totalSessionsCount = sampleSessions.length * totalDaysCount;

    let datesText = '';
    if (selectedDates.length === 0) {
      datesText = '<dates>';
    } else if (selectedDates.length === 1) {
      datesText = `${formatDateChip(selectedDates[0])}${repeatWeeks > 0 ? ` (+${repeatWeeks} more week${repeatWeeks > 1 ? 's' : ''})` : ''}`;
    } else if (selectedDates.length <= 3) {
      datesText = `${selectedDates.map(formatDateChip).join(', ')}${repeatWeeks > 0 ? ` (+${repeatWeeks} more week${repeatWeeks > 1 ? 's' : ''} each)` : ''}`;
    } else {
      datesText = `${selectedDates.length} dates${repeatWeeks > 0 ? ` (+${repeatWeeks} more week${repeatWeeks > 1 ? 's' : ''} each)` : ''}`;
    }

    return {
      status: 'valid',
      sessionsPerDay: sampleSessions.length,
      totalSessionsCount,
      slotDurationMinutes: config.slotDurationMinutes,
      datesText,
      sampleLabels: sampleSessions.map(s => s.label).join(', '),
      hasLeftover: leftoverMinutes > 0,
      leftoverMinutes,
      windowMinutes
    };
  }, [startTime, endTime, config.slotDurationMinutes, config.slotBreakMinutes, selectedDates, repeatWeeks]);

  // Add date to selected dates chip list
  const handleAddDate = () => {
    if (!dateInput) return;
    if (dateInput < todayIso) {
      showToast('Cannot add dates in the past.', 'error');
      return;
    }
    if (dateInput > maxDateIso) {
      showToast(`Cannot add dates beyond ${config.bookingWindowDays} days.`, 'error');
      return;
    }
    if (selectedDates.includes(dateInput)) {
      showToast('Date is already added.', 'error');
      return;
    }
    if (selectedDates.length >= 31) {
      showToast('Maximum 31 dates can be selected at once.', 'error');
      return;
    }

    setSelectedDates(prev => [...prev, dateInput].sort());
    setDateInput('');
  };

  // Remove date chip
  const handleRemoveDate = (dateToRemove) => {
    setSelectedDates(prev => prev.filter(d => d !== dateToRemove));
  };

  // Create slots handler
  const handleCreateSlots = async () => {
    if (selectedDates.length === 0) {
      showToast('Please add at least one date before creating slots.', 'error');
      return;
    }
    if (preview.status !== 'valid') {
      showToast(preview.message || 'Please specify a valid time window.', 'error');
      return;
    }

    try {
      setSaving(true);
      setServerError(null);

      const payload = {
        dates: selectedDates,
        startTime,
        endTime,
        timezone,
        repeatWeeks: Number(repeatWeeks)
      };

      const res = await apiClient.post('/api/availability/slots', payload);

      const createdCount = res?.created ?? 0;
      const skippedCount = res?.skippedOverlap ?? 0;

      showToast(`Created ${createdCount} slots, skipped ${skippedCount} overlapping`);
      setSelectedDates([]);
      refreshSlots();
    } catch (err) {
      const msg = err.data?.message || err.message || 'Failed to create slots.';
      setServerError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete single open slot
  const handleDeleteSlot = async (slotId) => {
    try {
      setDeletingSlotId(slotId);
      const res = await apiClient.delete(`/api/availability/slots/${slotId}`);
      showToast(res.message || 'Slot deleted successfully.');
      setConfirmDeleteSlotId(null);
      refreshSlots();
    } catch (err) {
      const msg = err.data?.message || err.message || 'Failed to delete slot.';
      showToast(msg, 'error');
    } finally {
      setDeletingSlotId(null);
    }
  };

  // Clear all open slots for a date
  const handleClearDate = async (dateStr) => {
    try {
      setClearingDate(dateStr);
      const res = await apiClient.delete(`/api/availability/slots?date=${dateStr}`);
      const count = res?.count ?? res?.deletedCount ?? 0;
      showToast(res.message || `Deleted ${count} open slots for ${dateStr}.`);
      setConfirmClearDate(null);
      refreshSlots();
    } catch (err) {
      const msg = err.data?.message || err.message || 'Failed to clear slots.';
      showToast(msg, 'error');
    } finally {
      setClearingDate(null);
    }
  };

  // Group slots by date
  const groupedSlots = useMemo(() => {
    const map = {};
    for (const slot of slots) {
      const dateKey = slot.date || (slot.startTime ? String(slot.startTime).slice(0, 10) : 'unknown');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(slot);
    }
    // Sort slots within each date by startTime ascending
    for (const dateKey of Object.keys(map)) {
      map[dateKey].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    }
    return map;
  }, [slots]);

  const sortedDateKeys = useMemo(() => {
    return Object.keys(groupedSlots).sort();
  }, [groupedSlots]);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
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
          }}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={18} className="text-red-400" />
          ) : (
            <CheckCircle size={18} className="text-success" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="badge badge-info text-xs font-semibold uppercase">Professional</span>
          <span className="text-xs text-muted">Schedule Manager</span>
        </div>
        <h1 className="text-2xl font-bold">My Availability</h1>
        <p className="text-muted text-sm mt-1">
          Candidates can only book the slots you create here.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Card A: Add your free time */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <Calendar className="text-primary" size={20} />
            <h2 className="text-lg font-bold">Add your free time</h2>
          </div>

          <div className="flex flex-col gap-5">
            {/* Date Input & Chips */}
            <div>
              <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-2">
                Date (Add up to 31 dates)
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="date"
                  min={todayIso}
                  max={maxDateIso}
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="input text-sm flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddDate}
                  disabled={!dateInput}
                  className="btn btn-outline flex items-center justify-center gap-1.5 text-xs py-2 px-4"
                >
                  <Plus size={15} />
                  <span>Add date</span>
                </button>
              </div>

              {/* Selected Dates Chips */}
              <div className="mt-3">
                {selectedDates.length === 0 ? (
                  <p className="text-xs text-muted italic">
                    No dates added yet. Pick a date above and click &quot;Add date&quot;.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 items-center">
                    {selectedDates.map(d => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium"
                      >
                        <Calendar size={12} />
                        <span>{formatDateChip(d)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDate(d)}
                          className="hover:text-red-600 transition-colors ml-0.5"
                          title="Remove this date"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                    <span className="text-xs text-muted ml-1">
                      ({selectedDates.length}/31)
                    </span>
                    {selectedDates.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDates([])}
                        className="text-xs text-muted hover:text-red-500 underline ml-2"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* From & To Time Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-2">
                  From
                </label>
                <div className="relative">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="input text-sm w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-2">
                  To
                </label>
                <div className="relative">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="input text-sm w-full"
                  />
                </div>
              </div>
            </div>

            {/* Repeat & Timezone row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Repeat every week for */}
              <div>
                <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-2">
                  Repeat every week for
                </label>
                <select
                  value={repeatWeeks}
                  onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                  className="input text-sm w-full"
                >
                  <option value={0}>Don&apos;t repeat</option>
                  <option value={1}>1 more week</option>
                  <option value={2}>2 more weeks</option>
                  <option value={3}>3 more weeks</option>
                  <option value={4}>4 more weeks</option>
                </select>
              </div>

              {/* Timezone Line with Change dropdown */}
              <div>
                <label className="text-xs font-bold text-muted block uppercase tracking-wider mb-2">
                  Timezone
                </label>
                {!isChangingTz ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-slate-50 dark:bg-slate-900/50" style={{ borderColor: 'var(--border)' }}>
                    <Globe size={16} className="text-primary flex-shrink-0" />
                    <span className="text-xs font-semibold truncate flex-1">{timezone}</span>
                    <button
                      type="button"
                      onClick={() => setIsChangingTz(true)}
                      className="text-primary text-xs font-bold underline hover:text-primary-focus ml-auto"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={timezone}
                      onChange={(e) => {
                        setTimezone(e.target.value);
                        setIsChangingTz(false);
                      }}
                      className="input text-xs py-2 px-2 flex-1"
                      autoFocus
                    >
                      {timezoneOptions.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsChangingTz(false)}
                      className="btn btn-ghost text-xs py-2 px-2.5"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Live Preview Text */}
            <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900/40" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                <Clock size={13} className="text-primary" />
                <span>Live Slot Preview</span>
              </div>

              {preview.status === 'valid' ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    This will create <strong className="text-primary">{preview.totalSessionsCount}</strong> session{preview.totalSessionsCount !== 1 ? 's' : ''} of <strong>{preview.slotDurationMinutes} min</strong> on {preview.datesText}:
                  </p>
                  <p className="text-xs text-muted font-mono bg-white dark:bg-slate-950 p-2.5 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                    {preview.sampleLabels}
                  </p>
                  {preview.hasLeftover && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mt-1">
                      <AlertTriangle size={14} className="flex-shrink-0" />
                      <span>Note: Leftover {preview.leftoverMinutes} min is shorter than one session ({preview.slotDurationMinutes} min) and will be dropped.</span>
                    </div>
                  )}
                </div>
              ) : preview.status === 'warning' ? (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={15} className="flex-shrink-0" />
                  <span>{preview.message}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{preview.message}</span>
                </div>
              )}
            </div>

            {/* Server Error Notice */}
            {serverError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleCreateSlots}
                disabled={saving || selectedDates.length === 0 || preview.status !== 'valid'}
                className="btn btn-primary flex items-center gap-2 text-sm py-2.5 px-6 w-full sm:w-auto justify-center"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Creating slots...</span>
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    <span>Create slots</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Card B: My upcoming slots */}
        <div className="card p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div>
              <div className="flex items-center gap-2">
                <Clock className="text-primary" size={20} />
                <h2 className="text-lg font-bold">My upcoming slots</h2>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Showing slots for the next {config.bookingWindowDays} days in your timezone ({timezone})
              </p>
            </div>
            <button
              type="button"
              onClick={refreshSlots}
              disabled={loadingSlots}
              className="btn btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 self-end sm:self-auto"
              title="Refresh slots"
            >
              <RefreshCw size={13} className={loadingSlots ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Loading State */}
          {loadingSlots ? (
            <div className="p-12 text-center text-muted">
              <Loader2 className="animate-spin text-primary mx-auto mb-3" size={32} />
              <span className="text-sm">Loading your upcoming slots...</span>
            </div>
          ) : slotsError ? (
            /* Error State */
            <div className="p-6 text-center text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl">
              <AlertCircle size={28} className="mx-auto mb-2" />
              <p className="text-sm font-medium mb-3">{slotsError}</p>
              <button
                type="button"
                onClick={refreshSlots}
                className="btn btn-outline text-xs py-1.5 px-4"
              >
                Try Again
              </button>
            </div>
          ) : sortedDateKeys.length === 0 ? (
            /* Empty State */
            <div className="p-10 text-center text-muted border-2 border-dashed rounded-xl" style={{ borderColor: 'var(--border)' }}>
              <Calendar size={36} className="mx-auto mb-2 opacity-30 text-primary" />
              <p className="text-sm font-medium">
                You have no slots yet. Add your free time above so candidates can book you.
              </p>
            </div>
          ) : (
            /* Grouped by Date List */
            <div className="flex flex-col gap-6">
              {sortedDateKeys.map(dateKey => {
                const daySlots = groupedSlots[dateKey];
                const openSlotsCount = daySlots.filter(s => s.status === 'open').length;

                return (
                  <div
                    key={dateKey}
                    className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/30"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {/* Date Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                          {formatGroupDateHeader(dateKey, timezone)}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-muted">
                          {daySlots.length} slot{daySlots.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Clear open slots for this day */}
                      {openSlotsCount > 0 && (
                        <div>
                          {confirmClearDate === dateKey ? (
                            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 px-2.5 py-1 rounded border border-red-200 dark:border-red-900 text-xs">
                              <span className="text-red-600 dark:text-red-400 font-medium">
                                Clear all {openSlotsCount} open slots?
                              </span>
                              <button
                                type="button"
                                onClick={() => handleClearDate(dateKey)}
                                disabled={clearingDate === dateKey}
                                className="font-bold text-red-600 hover:text-red-800 underline"
                              >
                                {clearingDate === dateKey ? 'Clearing...' : 'Yes, clear'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmClearDate(null)}
                                className="text-muted hover:text-foreground ml-1"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmClearDate(dateKey)}
                              className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 font-medium hover:underline"
                              title="Clear all open slots for this day"
                            >
                              <Trash2 size={12} />
                              <span>Clear open slots for this day</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Slot Pills */}
                    <div className="flex flex-wrap gap-2.5">
                      {daySlots.map(slot => {
                        const isOpen = slot.status === 'open';
                        const isReserved = slot.status === 'reserved';
                        const isBooked = slot.status === 'booked';

                        return (
                          <div
                            key={slot._id}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs transition-all shadow-sm ${
                              isBooked
                                ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
                                : isReserved
                                ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <Clock size={13} className="text-muted flex-shrink-0" />
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {slot.slotLabel}
                            </span>

                            {/* Status Chip */}
                            {isOpen && (
                              <span className="badge badge-success">Open</span>
                            )}
                            {isReserved && (
                              <span className="badge badge-warning">Payment pending</span>
                            )}
                            {isBooked && (
                              <span className="badge badge-info">Booked</span>
                            )}

                            {/* Booked details: candidate name & link to My Interviews */}
                            {isBooked && (
                              <div className="flex items-center gap-2 pl-1 border-l" style={{ borderColor: 'var(--border)' }}>
                                {slot.candidateName && (
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                    👤 {slot.candidateName}
                                  </span>
                                )}
                                <Link
                                  to="/interviews"
                                  className="text-primary hover:underline font-semibold flex items-center gap-0.5 text-xs ml-1"
                                  title="View interview in My Interviews"
                                >
                                  <span>My Interviews</span>
                                  <ExternalLink size={11} />
                                </Link>
                              </div>
                            )}

                            {/* Delete (X) button for Open slots */}
                            {isOpen && (
                              <div className="ml-1 pl-1 border-l" style={{ borderColor: 'var(--border)' }}>
                                {confirmDeleteSlotId === slot._id ? (
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className="text-red-600 dark:text-red-400 font-semibold">Delete?</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSlot(slot._id)}
                                      disabled={deletingSlotId === slot._id}
                                      className="font-bold text-red-600 hover:text-red-800 underline"
                                    >
                                      {deletingSlotId === slot._id ? '...' : 'Yes'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteSlotId(null)}
                                      className="text-muted hover:text-foreground"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteSlotId(slot._id)}
                                    className="text-muted hover:text-red-600 p-0.5 rounded transition-colors"
                                    title="Delete this open slot"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Availability;
