import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRandomSuffix,
  generatePeerId,
  shouldRedial,
  shouldAcceptCall
} from '../src/utils/webrtcHelpers.js';

describe('WebRTC Helpers - Pure Decision Logic', () => {
  describe('generateRandomSuffix', () => {
    it('generates a 6-character alphanumeric string by default', () => {
      const suffix = generateRandomSuffix();
      assert.equal(typeof suffix, 'string');
      assert.equal(suffix.length, 6);
      assert.match(suffix, /^[a-z0-9]{6}$/);
    });

    it('generates strings with custom lengths', () => {
      assert.equal(generateRandomSuffix(8).length, 8);
      assert.equal(generateRandomSuffix(4).length, 4);
    });

    it('generates varying values', () => {
      const s1 = generateRandomSuffix();
      const s2 = generateRandomSuffix();
      assert.notEqual(s1, s2);
    });
  });

  describe('generatePeerId', () => {
    it('formats peer ID as ip-<room>-<role>-<suffix>', () => {
      const id = generatePeerId('room123', 'candidate', 'abc999');
      assert.equal(id, 'ip-room123-candidate-abc999');
    });

    it('sanitizes room ID special characters', () => {
      const id = generatePeerId('room_456-abc!', 'interviewer', 'xyz123');
      assert.equal(id, 'ip-room456abc-interviewer-xyz123');
    });

    it('auto-generates 6-char random suffix when not provided', () => {
      const id = generatePeerId('myRoom', 'candidate');
      assert.match(id, /^ip-myRoom-candidate-[a-z0-9]{6}$/);
    });

    it('returns empty string if roomId or role is missing', () => {
      assert.equal(generatePeerId('', 'candidate'), '');
      assert.equal(generatePeerId('room1', ''), '');
    });
  });

  describe('shouldRedial', () => {
    const baseParams = {
      role: 'candidate',
      partnerPeerId: 'ip-room1-interviewer-abc123',
      hasLocalStream: true,
      currentCall: null,
      iceConnectionState: 'new',
      callStartTime: 1000,
      now: 2000
    };

    it('returns false if role is not candidate (only candidate dials)', () => {
      const result = shouldRedial({ ...baseParams, role: 'interviewer' });
      assert.equal(result, false);
    });

    it('returns false if partnerPeerId is missing or empty', () => {
      assert.equal(shouldRedial({ ...baseParams, partnerPeerId: null }), false);
      assert.equal(shouldRedial({ ...baseParams, partnerPeerId: '' }), false);
      assert.equal(shouldRedial({ ...baseParams, partnerPeerId: '   ' }), false);
    });

    it('returns false if local media stream is missing (never dial without stream)', () => {
      assert.equal(shouldRedial({ ...baseParams, hasLocalStream: false }), false);
    });

    it('returns true if candidate has stream and partner ID, but no call exists yet', () => {
      assert.equal(shouldRedial({ ...baseParams, currentCall: null }), true);
    });

    it('never redials while existing call has iceConnectionState new and is younger than 25s', () => {
      const result = shouldRedial({
        ...baseParams,
        currentCall: { id: 'call-1' },
        iceConnectionState: 'new',
        callStartTime: 10000,
        now: 25000, // 15s elapsed (< 25s)
        timeoutMs: 25000
      });
      assert.equal(result, false);
    });

    it('never redials while existing call has iceConnectionState checking and is younger than 25s', () => {
      const result = shouldRedial({
        ...baseParams,
        currentCall: { id: 'call-1' },
        iceConnectionState: 'checking',
        callStartTime: 10000,
        now: 34000, // 24s elapsed (< 25s)
        timeoutMs: 25000
      });
      assert.equal(result, false);
    });

    it('allows redial when new/checking exceeds 25s timeout', () => {
      const result = shouldRedial({
        ...baseParams,
        currentCall: { id: 'call-1' },
        iceConnectionState: 'checking',
        callStartTime: 10000,
        now: 36000, // 26s elapsed (>= 25s)
        timeoutMs: 25000
      });
      assert.equal(result, true);
    });

    it('returns false when call is already connected or completed', () => {
      assert.equal(shouldRedial({
        ...baseParams,
        currentCall: { id: 'call-1' },
        iceConnectionState: 'connected'
      }), false);

      assert.equal(shouldRedial({
        ...baseParams,
        currentCall: { id: 'call-1' },
        iceConnectionState: 'completed'
      }), false);
    });

    it('redials on failed or closed states', () => {
      assert.equal(shouldRedial({
        ...baseParams,
        currentCall: { id: 'call-1' },
        iceConnectionState: 'failed'
      }), true);

      assert.equal(shouldRedial({
        ...baseParams,
        currentCall: { id: 'call-1' },
        iceConnectionState: 'closed'
      }), true);
    });

    it('blocks redial on disconnected younger than timeout, allows redial once expired', () => {
      assert.equal(shouldRedial({
        ...baseParams,
        currentCall: { id: 'call-1' },
        iceConnectionState: 'disconnected',
        callStartTime: 10000,
        now: 20000 // 10s elapsed
      }), false);

      assert.equal(shouldRedial({
        ...baseParams,
        currentCall: { id: 'call-1' },
        iceConnectionState: 'disconnected',
        callStartTime: 10000,
        now: 40000 // 30s elapsed
      }), true);
    });
  });

  describe('shouldAcceptCall', () => {
    it('never answers without a local stream', () => {
      assert.equal(shouldAcceptCall({ hasLocalStream: false, currentCall: null }), false);
      assert.equal(shouldAcceptCall({ hasLocalStream: false, currentCall: { id: 'call-1' } }), false);
    });

    it('accepts incoming call if local stream is present and no current call exists', () => {
      assert.equal(shouldAcceptCall({ hasLocalStream: true, currentCall: null }), true);
    });

    it('protects in-progress incoming call and rejects second arriving call', () => {
      const activeStates = ['new', 'checking', 'connected', 'completed'];
      for (const state of activeStates) {
        const accepted = shouldAcceptCall({
          hasLocalStream: true,
          currentCall: { id: 'existing-call' },
          iceConnectionState: state
        });
        assert.equal(accepted, false, `Expected call in state '${state}' to not be replaced`);
      }
    });

    it('accepts incoming call if existing call is failed or closed', () => {
      assert.equal(shouldAcceptCall({
        hasLocalStream: true,
        currentCall: { id: 'failed-call' },
        iceConnectionState: 'failed'
      }), true);

      assert.equal(shouldAcceptCall({
        hasLocalStream: true,
        currentCall: { id: 'closed-call' },
        iceConnectionState: 'closed'
      }), true);
    });
  });
});

