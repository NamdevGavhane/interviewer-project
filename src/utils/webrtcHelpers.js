/**
 * WebRTC Pure Helper Functions
 * Clean, pure decision logic for peer ID creation, dialing, and call admission.
 */

/**
 * Generate a random alphanumeric string of specified length (default 6).
 * @param {number} length 
 * @returns {string}
 */
export function generateRandomSuffix(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a deterministic or randomized tab-specific Peer ID.
 * Format: ip-<room>-<role>-<random6>
 * 
 * @param {string} roomId 
 * @param {string} role - 'candidate' | 'interviewer'
 * @param {string} [suffix] - optional 6-char suffix (generated if missing)
 * @returns {string}
 */
export function generatePeerId(roomId, role, suffix) {
  if (!roomId || !role) return '';
  const cleanRoom = String(roomId).replace(/[^a-zA-Z0-9]/g, '');
  const cleanRole = String(role).trim().toLowerCase();
  const cleanSuffix = (suffix && String(suffix).trim()) ? String(suffix).trim() : generateRandomSuffix(6);
  return `ip-${cleanRoom}-${cleanRole}-${cleanSuffix}`;
}

/**
 * Pure decision logic for whether the candidate should dial or redial the partner.
 * 
 * Rules:
 * 1. Only the candidate dials.
 * 2. Requires both partnerPeerId and local media stream.
 * 3. Never redial while an existing call has iceConnectionState 'new' or 'checking' and is younger than 25s.
 * 4. Redial only when no call exists or on 'failed' / 'closed' (or timed-out disconnected).
 * 
 * @param {Object} params
 * @param {string} params.role
 * @param {string|null} params.partnerPeerId
 * @param {boolean} params.hasLocalStream
 * @param {any} [params.currentCall]
 * @param {string} [params.iceConnectionState] - 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed'
 * @param {number} [params.callStartTime] - timestamp ms when current call was initiated
 * @param {number} [params.now] - current timestamp ms
 * @param {number} [params.timeoutMs] - default 25000 (25s)
 * @returns {boolean}
 */
export function shouldRedial({
  role,
  partnerPeerId,
  hasLocalStream,
  currentCall = null,
  iceConnectionState = 'new',
  callStartTime = null,
  now = Date.now(),
  timeoutMs = 25000
} = {}) {
  // 1. Only candidate dials
  if (role !== 'candidate') {
    return false;
  }

  // 2. Partner ID and local stream are mandatory
  if (!partnerPeerId || typeof partnerPeerId !== 'string' || !partnerPeerId.trim()) {
    return false;
  }
  if (!hasLocalStream) {
    return false;
  }

  // 3. If no active call object exists, candidate is free to dial
  if (!currentCall) {
    return true;
  }

  const normalizedState = (iceConnectionState || '').toLowerCase();

  // 4. Do not redial if call is established
  if (normalizedState === 'connected' || normalizedState === 'completed') {
    return false;
  }

  // 5. In-flight call in 'new' or 'checking': block redial if younger than timeoutMs (25s)
  if (normalizedState === 'new' || normalizedState === 'checking') {
    if (callStartTime && (now - callStartTime) < timeoutMs) {
      return false;
    }
    // If older than 25s, it is stalled and candidate should redial
    return true;
  }

  // 6. Explicit redial triggers: 'failed' or 'closed'
  if (normalizedState === 'failed' || normalizedState === 'closed') {
    return true;
  }

  // 7. For 'disconnected', give it a grace period before redialing
  if (normalizedState === 'disconnected') {
    if (callStartTime && (now - callStartTime) < timeoutMs) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Pure decision logic for whether an incoming call should be answered.
 * 
 * Rules:
 * 1. Never answer without a local stream.
 * 2. Do not close or replace an in-progress incoming call because a second one arrived.
 * 
 * @param {Object} params
 * @param {boolean} params.hasLocalStream
 * @param {any} [params.currentCall]
 * @param {string} [params.iceConnectionState]
 * @returns {boolean}
 */
export function shouldAcceptCall({
  hasLocalStream,
  currentCall = null,
  iceConnectionState = 'new'
} = {}) {
  // 1. Never answer without a local stream
  if (!hasLocalStream) {
    return false;
  }

  // 2. If no call exists, accept
  if (!currentCall) {
    return true;
  }

  // 3. Protect in-progress or established calls
  const state = (iceConnectionState || '').toLowerCase();
  const activeOrPendingStates = ['new', 'checking', 'connected', 'completed'];
  if (activeOrPendingStates.includes(state)) {
    return false;
  }

  // If the existing call is already failed or closed, accept new one
  return true;
}

