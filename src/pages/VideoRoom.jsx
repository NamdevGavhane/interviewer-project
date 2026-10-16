import { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  MonitorUp, 
  MessageSquare, 
  PhoneOff, 
  Send, 
  X, 
  AlertCircle,
  FileText,
  Copy,
  Check,
  RefreshCw,
  Radio,
  Users
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Peer from 'peerjs';
import { API_BASE_URL } from '../config/api';

const VideoRoom = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const interviewId = searchParams.get('interviewId');
  const roleParam = searchParams.get('role');
  const navigate = useNavigate();

  // Determine active room & role accurately
  const roomId = interviewId || searchParams.get('room') || 'main-session';

  const getEffectiveRole = (param, stored) => {
    const p = (param || '').toLowerCase();
    const s = (stored || '').toLowerCase();
    if (p === 'interviewer' || p === 'professional' || p === 'admin') return 'interviewer';
    if (p === 'candidate') return 'candidate';
    if (s === 'professional' || s === 'admin') return 'interviewer';
    return 'candidate';
  };

  const [currentRole, setCurrentRole] = useState(() => getEffectiveRole(roleParam, localStorage.getItem('userRole')));
  const partnerRole = currentRole === 'interviewer' ? 'candidate' : 'interviewer';

  // State
  const [interview, setInterview] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMirrored, setIsMirrored] = useState(true);
  const [partnerMicOn, setPartnerMicOn] = useState(true);
  const [partnerVideoOn, setPartnerVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  
  // WebRTC Connection State
  const [peerReady, setPeerReady] = useState(false);
  const [isCallConnected, setIsCallConnected] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Initializing media...');
  const [copiedLink, setCopiedLink] = useState(false);

  // Live Timer State
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // In-Call Chat State
  const [messages, setMessages] = useState([
    {
      sender: 'System',
      text: 'Live encrypted P2P WebRTC room ready. Camera and microphone enabled.',
      time: 'Just now'
    }
  ]);
  const [chatInput, setChatInput] = useState('');

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const peerRef = useRef(null);
  const currentCallRef = useRef(null);
  const dataConnRef = useRef(null);
  const chatBottomRef = useRef(null);
  
  // Connection state refs to prevent stale closure loops and duplicate calling
  const isCallConnectedRef = useRef(false);
  const isCallingRef = useRef(false);

  // Clean IDs for PeerJS (alphanumeric only)
  const cleanRoomId = roomId.replace(/[^a-zA-Z0-9]/g, '');
  const myPeerId = `ip-${cleanRoomId}-${currentRole}`;
  const partnerPeerId = `ip-${cleanRoomId}-${partnerRole}`;

  const loggedUserId = localStorage.getItem('userId');
  const [currentUserData, setCurrentUserData] = useState(null);

  // Fetch logged-in user profile if available
  useEffect(() => {
    if (loggedUserId) {
      fetch(`${API_BASE_URL}/api/users/${loggedUserId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) setCurrentUserData(data);
        })
        .catch(err => console.warn('User profile notice:', err));
    }
  }, [loggedUserId]);

  // 1. Fetch interview details if ID present & auto-confirm role from session participants
  useEffect(() => {
    if (interviewId) {
      fetch(`${API_BASE_URL}/api/interviews/${interviewId}`)
        .then(res => res.json())
        .then(data => {
          setInterview(data);
          if (loggedUserId && data) {
            const interviewerUserId = String(data.interviewerId?._id || data.interviewerId || '');
            const candidateUserId = String(data.candidateId?._id || data.candidateId || '');
            const myId = String(loggedUserId);

            if (myId === interviewerUserId) {
              console.log('Confirmed identity as Interviewer from DB session');
              setCurrentRole('interviewer');
            } else if (myId === candidateUserId) {
              console.log('Confirmed identity as Candidate from DB session');
              setCurrentRole('candidate');
            }
          }
        })
        .catch(err => console.error('Error loading interview:', err));
    }
  }, [interviewId, loggedUserId]);

  // 2. Timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format Timer mm:ss
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 3. Initialize Camera & Mic with echo cancellation & noise suppression
  const startCamera = async () => {
    try {
      setMediaError(null);
      setConnectionStatus('Requesting camera & microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      mediaStreamRef.current = stream;
      setCameraActive(true);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(e => console.warn('Local play warning:', e));
      }

      // If already in an active call, update media tracks on active sender
      if (currentCallRef.current && currentCallRef.current.peerConnection) {
        const senders = currentCallRef.current.peerConnection.getSenders();
        const vTrack = stream.getVideoTracks()[0];
        const aTrack = stream.getAudioTracks()[0];
        senders.forEach(s => {
          if (s.track?.kind === 'video' && vTrack) s.replaceTrack(vTrack);
          if (s.track?.kind === 'audio' && aTrack) s.replaceTrack(aTrack);
        });
      }

      setConnectionStatus('Camera connected. Ready for partner call.');
      return stream;
    } catch (err) {
      console.warn('Camera error:', err);
      setMediaError('Camera permission blocked or no webcam found. Click "Enable Camera" or allow access in browser URL bar.');
      setCameraActive(false);
      setConnectionStatus('Camera permission required.');
      return null;
    }
  };

  useEffect(() => {
    let localStream = null;
    startCamera().then(stream => {
      localStream = stream;
    });

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Ensure local video always plays when cameraActive or ref updates
  useEffect(() => {
    if (localVideoRef.current && mediaStreamRef.current) {
      localVideoRef.current.srcObject = mediaStreamRef.current;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(e => console.warn('Local video play:', e));
    }
  }, [cameraActive, isVideoOn]);

  // Ensure remote video plays when remoteStream updates
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.warn('Remote video play:', e));
    }
  }, [remoteStream, isCallConnected]);

  // Setup data connection handlers
  const attachDataHandlers = (conn) => {
    dataConnRef.current = conn;
    conn.on('data', (data) => {
      if (data?.type === 'media_state') {
        if (typeof data.isMicOn === 'boolean') setPartnerMicOn(data.isMicOn);
        if (typeof data.isVideoOn === 'boolean') setPartnerVideoOn(data.isVideoOn);
      } else if (data && data.text) {
        setMessages(prev => [...prev, data]);
      }
    });
  };

  // 4. WebRTC PeerJS Setup
  useEffect(() => {
    let peerInstance = null;
    let callRetryInterval = null;

    // Reset connection refs on role or room change
    isCallConnectedRef.current = false;
    isCallingRef.current = false;
    setIsCallConnected(false);
    setRemoteStream(null);

    try {
      setConnectionStatus(`Connecting as ${currentRole}...`);
      peerInstance = new Peer(myPeerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      });

      peerRef.current = peerInstance;

      peerInstance.on('open', (id) => {
        console.log('PeerJS connection opened with ID:', id);
        setPeerReady(true);
        setConnectionStatus(`Online as ${currentRole}. Waiting for ${partnerRole}...`);
      });

      // Handle Incoming Call
      peerInstance.on('call', (incomingCall) => {
        console.log('Incoming WebRTC Call from:', incomingCall.peer);

        // If we already have a healthy connected call, ignore redundant incoming call
        if (
          isCallConnectedRef.current && 
          currentCallRef.current && 
          currentCallRef.current.peerConnection && 
          (currentCallRef.current.peerConnection.connectionState === 'connected' ||
           currentCallRef.current.peerConnection.iceConnectionState === 'connected')
        ) {
          console.log('Already in active call, ignoring redundant incoming call');
          return;
        }

        // Close any dead previous call
        if (currentCallRef.current && currentCallRef.current !== incomingCall) {
          try { currentCallRef.current.close(); } catch (e) {}
        }

        currentCallRef.current = incomingCall;

        incomingCall.answer(mediaStreamRef.current || undefined);

        incomingCall.on('stream', (stream) => {
          console.log('Received remote live video stream!');
          setRemoteStream(stream);
          setIsCallConnected(true);
          isCallConnectedRef.current = true;
          isCallingRef.current = false;
          setConnectionStatus(`🟢 Live Call Connected with ${partnerName}`);
        });

        incomingCall.on('close', () => {
          if (currentCallRef.current === incomingCall) {
            console.log('Incoming call closed');
            setIsCallConnected(false);
            isCallConnectedRef.current = false;
            isCallingRef.current = false;
            setRemoteStream(null);
            setConnectionStatus(`${partnerName} disconnected. Waiting for reconnect...`);
          }
        });

        incomingCall.on('error', (err) => {
          console.warn('Call stream error:', err);
          if (currentCallRef.current === incomingCall) {
            isCallingRef.current = false;
          }
        });
      });

      // Handle Incoming Data Connection for Chat & Media States
      peerInstance.on('connection', (conn) => {
        attachDataHandlers(conn);
      });

      peerInstance.on('error', (err) => {
        console.warn('PeerJS notice:', err.type, err.message);
        // CRITICAL: Always release calling lock so reconnects can proceed!
        isCallingRef.current = false;
        if (err.type === 'peer-unavailable') {
          setConnectionStatus(`Waiting for ${partnerRole} to enter room...`);
        } else if (err.type === 'unavailable-id') {
          setConnectionStatus(`Connecting...`);
        }
      });

      // Stable Periodic Check: Retries connection until both participants are connected
      callRetryInterval = setInterval(() => {
        if (
          !isCallConnectedRef.current && 
          !isCallingRef.current && 
          peerRef.current && 
          !peerRef.current.destroyed && 
          mediaStreamRef.current
        ) {
          callPartner();
        }
      }, 3500);

    } catch (e) {
      console.error('PeerJS init failed:', e);
    }

    return () => {
      clearInterval(callRetryInterval);
      if (currentCallRef.current) {
        currentCallRef.current.close();
      }
      if (peerInstance) {
        peerInstance.destroy();
      }
    };
  }, [myPeerId, partnerPeerId, currentRole]);

  // Outgoing Call Function
  const callPartner = () => {
    if (!peerRef.current || !mediaStreamRef.current) return;
    if (isCallConnectedRef.current || isCallingRef.current) return;
    if (peerRef.current.destroyed || peerRef.current.disconnected) return;

    try {
      isCallingRef.current = true;
      console.log('Initiating outbound call to partner:', partnerPeerId);
      
      // Auto-unlock callingRef after 3.5s in case partner is not yet in room
      setTimeout(() => {
        if (!isCallConnectedRef.current) {
          isCallingRef.current = false;
        }
      }, 3500);

      const call = peerRef.current.call(partnerPeerId, mediaStreamRef.current);
      if (call) {
        currentCallRef.current = call;

        call.on('stream', (stream) => {
          console.log('Remote stream connected from outgoing call!');
          setRemoteStream(stream);
          setIsCallConnected(true);
          isCallConnectedRef.current = true;
          isCallingRef.current = false;
          setConnectionStatus(`🟢 Live Call Connected with ${partnerName}`);
        });

        call.on('close', () => {
          if (currentCallRef.current === call) {
            console.log('Outgoing call closed');
            setIsCallConnected(false);
            isCallConnectedRef.current = false;
            isCallingRef.current = false;
            setRemoteStream(null);
            setConnectionStatus(`Waiting for ${partnerName} to reconnect...`);
          }
        });

        call.on('error', (err) => {
          console.warn('Outbound call error:', err);
          isCallingRef.current = false;
        });
      } else {
        isCallingRef.current = false;
      }

      // Also open data connection for real-time chat if needed
      if (!dataConnRef.current || !dataConnRef.current.open) {
        try {
          const conn = peerRef.current.connect(partnerPeerId);
          conn.on('open', () => {
            attachDataHandlers(conn);
          });
        } catch (e) {
          console.warn('Data connection notice:', e);
        }
      }
    } catch (err) {
      console.warn('Outbound call attempt failed:', err.message);
      isCallingRef.current = false;
    }
  };

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  // Toggle Microphone
  const toggleMic = () => {
    const nextState = !isMicOn;
    if (mediaStreamRef.current) {
      const audioTracks = mediaStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = nextState;
      });
    }
    setIsMicOn(nextState);

    // Notify partner of mute state
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send({
        type: 'media_state',
        isMicOn: nextState,
        isVideoOn
      });
    }
  };

  // Toggle Camera
  const toggleVideo = () => {
    const nextState = !isVideoOn;
    if (mediaStreamRef.current) {
      const videoTracks = mediaStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = nextState;
      });
    }
    setIsVideoOn(nextState);

    // Notify partner of camera state
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send({
        type: 'media_state',
        isMicOn,
        isVideoOn: nextState
      });
    }
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = screenStream.getVideoTracks()[0];

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = screenStream;
          }
          setIsScreenSharing(true);

          // Replace track in active WebRTC call sender
          if (currentCallRef.current && currentCallRef.current.peerConnection) {
            const senders = currentCallRef.current.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender) {
              videoSender.replaceTrack(screenTrack);
            }
          }

          screenTrack.onended = () => {
            revertToCamera();
          };
        } else {
          alert('Screen sharing is not supported by your browser.');
        }
      } catch (err) {
        console.warn('Screen share canceled:', err);
      }
    } else {
      revertToCamera();
    }
  };

  const revertToCamera = () => {
    if (localVideoRef.current && mediaStreamRef.current) {
      localVideoRef.current.srcObject = mediaStreamRef.current;
    }
    if (currentCallRef.current && currentCallRef.current.peerConnection && mediaStreamRef.current) {
      const camTrack = mediaStreamRef.current.getVideoTracks()[0];
      const senders = currentCallRef.current.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender && camTrack) {
        videoSender.replaceTrack(camTrack);
      }
    }
    setIsScreenSharing(false);
  };

  // Send Chat Message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = {
      sender: currentRole === 'interviewer' ? 'Interviewer (You)' : 'Candidate (You)',
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setChatInput('');

    // Send through P2P WebRTC data connection if connected
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send({
        sender: currentRole === 'interviewer' ? 'Interviewer' : 'Candidate',
        text: userMsg.text,
        time: userMsg.time
      });
    }
  };

  // Copy Room Link
  const handleCopyRoomLink = () => {
    const partnerRoleToPass = currentRole === 'interviewer' ? 'candidate' : 'interviewer';
    const link = `${window.location.origin}/room?interviewId=${interviewId || cleanRoomId}&role=${partnerRoleToPass}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // End Call & Complete Session
  const handleEndCall = async () => {
    const confirmEnd = window.confirm('Are you sure you want to end this interview session?');
    if (!confirmEnd) return;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }

    if (currentCallRef.current) {
      currentCallRef.current.close();
    }
    if (peerRef.current) {
      peerRef.current.destroy();
    }

    if (interviewId) {
      try {
        await fetch(`${API_BASE_URL}/api/interviews/${interviewId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' })
        });
      } catch (err) {
        console.error('Error marking interview complete:', err);
      }
      navigate(`/feedback?interviewId=${interviewId}&completed=true`);
    } else {
      navigate('/interviews');
    }
  };

  const isInterviewer = currentRole === 'interviewer';

  // Resolve participant names
  const interviewerDisplayName = interview?.interviewerId?.name || (currentRole === 'interviewer' && currentUserData?.name) || 'Shushant Gaikwad';
  const candidateDisplayName = interview?.candidateId?.name || (currentRole === 'candidate' && currentUserData?.name) || 'Software Candidate';

  // Local Screen Details (You)
  const localDisplayName = isInterviewer ? interviewerDisplayName : candidateDisplayName;
  const localRoleBadge = isInterviewer ? 'Interviewer (You)' : 'Candidate (You)';
  const localCompanyTag = isInterviewer ? 'Cognizant' : null;

  // Remote Screen Details (Partner)
  const partnerName = isInterviewer ? candidateDisplayName : interviewerDisplayName;
  const remoteRoleBadge = isInterviewer ? 'Candidate' : 'Interviewer';
  const remoteCompanyTag = isInterviewer ? null : 'Cognizant';

  const rawPartnerTitle = interview
    ? (isInterviewer 
        ? (interview.candidateId?.email || 'Engineering Candidate') 
        : (interview.interviewerId?.title || 'Senior Full Stack MERN Developer'))
    : (isInterviewer ? 'Engineering Candidate' : 'Senior Full Stack MERN Developer');
  const partnerTitle = rawPartnerTitle?.includes('Batch 3') ? 'Senior Full Stack MERN Developer' : rawPartnerTitle;

  const partnerAvatar = interview
    ? (isInterviewer 
        ? (interview.candidateId?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80') 
        : (interview.interviewerId?.avatar || '/shushant-gaikwad.png'))
    : (isInterviewer 
        ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80' 
        : '/shushant-gaikwad.png');

  return (
    <div className="video-room-container" style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh', backgroundColor: '#090d16' }}>
      {/* Header */}
      <header className="flex justify-between items-center p-3 px-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#0f172a' }}>
        <div className="flex items-center gap-3">
          <div style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '0.25rem 0.6rem', borderRadius: '8px', fontWeight: 'bold' }}>IP</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold" style={{ color: 'white' }}>InterviewPro Live Room</h1>
              <span className={`badge ${isCallConnected ? 'badge-success' : 'badge-warning'} text-xs font-semibold`}>
                {isCallConnected ? '● Live Call Connected' : 'Waiting for Partner'}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {interview?.topic || 'Technical Interview - MERN Stack Architecture & Coding'}
            </p>
          </div>
        </div>

        {/* Room Info & Controls */}
        <div className="flex items-center gap-4">
          {/* Role Switcher Pill */}
          <div 
            style={{ 
              backgroundColor: 'rgba(255,255,255,0.06)', 
              borderRadius: '8px', 
              padding: '3px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem'
            }}
          >
            <span className="text-gray-400 text-xs px-1">You are:</span>
            <button
              type="button"
              onClick={() => setCurrentRole('candidate')}
              className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${currentRole === 'candidate' ? 'bg-primary text-white shadow' : 'text-gray-300 hover:text-white'}`}
              style={{ border: 'none', cursor: 'pointer' }}
            >
              Candidate
            </button>
            <button
              type="button"
              onClick={() => setCurrentRole('interviewer')}
              className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${currentRole === 'interviewer' ? 'bg-primary text-white shadow' : 'text-gray-300 hover:text-white'}`}
              style={{ border: 'none', cursor: 'pointer' }}
            >
              Interviewer
            </button>
          </div>

          {/* Copy Invite Link */}
          <button 
            type="button"
            onClick={handleCopyRoomLink}
            className="btn btn-outline text-xs text-gray-300 border-gray-600 flex items-center gap-1.5 hover:text-white hover:border-gray-400"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            title="Copy invite link to join from second browser / device"
          >
            {copiedLink ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            <span>{copiedLink ? 'Link Copied!' : 'Copy Partner Invite'}</span>
          </button>

          {/* Timer */}
          <div className="font-mono text-sm tracking-wider font-bold" style={{ color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.12)', padding: '0.3rem 0.75rem', borderRadius: '6px' }}>
            ⏱ {formatTime(secondsElapsed)}
          </div>
          
          <button 
            className="btn flex items-center gap-1.5" 
            style={{ backgroundColor: 'var(--danger)', color: 'white', padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
            onClick={handleEndCall}
          >
            <PhoneOff size={15} />
            <span>End Interview</span>
          </button>
        </div>
      </header>

      {/* Media Warning Bar */}
      {mediaError && (
        <div style={{ backgroundColor: '#7f1d1d', borderBottom: '1px solid #b91c1c', padding: '0.45rem 1rem', fontSize: '0.78rem', color: '#fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem' }}>
          <AlertCircle size={15} />
          <span>{mediaError}</span>
          <button 
            type="button" 
            onClick={startCamera} 
            className="btn btn-primary text-xs py-0.5 px-2 font-bold"
            style={{ backgroundColor: '#dc2626', borderColor: '#ef4444' }}
          >
            Enable Camera
          </button>
        </div>
      )}

      {/* Main Area: Videos + Sliding Chat */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 'calc(100vh - 145px)' }}>
        {/* Video Grid */}
        <main 
          style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '1.5rem', 
            gap: '1.5rem', 
            position: 'relative', 
            backgroundColor: '#090d16',
            width: '100%',
            overflow: 'hidden'
          }}
        >
          {/* Local Video (You) */}
          <div 
            style={{ 
              position: 'relative',
              width: '48%', 
              aspectRatio: '16/10', 
              borderRadius: '16px',
              overflow: 'hidden',
              border: '2px solid rgba(255, 255, 255, 0.15)',
              backgroundColor: '#0f172a',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
            }}
          >
            {/* Mirror / Flip Camera View Button */}
            <button
              type="button"
              onClick={() => setIsMirrored(prev => !prev)}
              title="Flip / Mirror Camera View"
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 35,
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '0.72rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} />
              <span>{isMirrored ? 'Mirrored' : 'Normal'}</span>
            </button>

            {/* Always-mounted local video to guarantee ref attachment */}
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: isScreenSharing ? 'none' : (isMirrored ? 'scaleX(-1)' : 'none'),
                display: cameraActive && isVideoOn ? 'block' : 'none' 
              }}
            />

            {/* Camera Off Overlay */}
            {!isVideoOn && (
              <div 
                style={{ 
                  position: 'absolute',
                  inset: 0,
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  backgroundColor: '#0f172a',
                  color: '#94a3b8' 
                }}
              >
                <VideoOff size={44} style={{ marginBottom: '0.5rem', color: '#64748b' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Your Camera is Off</span>
              </div>
            )}

            {/* Permission blocked overlay */}
            {!cameraActive && isVideoOn && (
              <div 
                style={{ 
                  position: 'absolute',
                  inset: 0,
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  backgroundColor: '#0f172a',
                  color: '#e2e8f0',
                  padding: '1.5rem',
                  textAlign: 'center'
                }}
              >
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '1rem', borderRadius: '50%', marginBottom: '0.75rem' }}>
                  <VideoOff size={32} style={{ color: '#ef4444' }} />
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '4px' }}>Webcam Permission Needed</div>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '280px', marginBottom: '12px' }}>
                  Please allow camera access in your browser to broadcast your video.
                </p>
                <button type="button" onClick={startCamera} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>
                  <RefreshCw size={13} style={{ marginRight: '4px', display: 'inline' }} /> Allow Camera Access
                </button>
              </div>
            )}

            {/* Bottom-Right Name Tag for Local Video */}
            <div 
              style={{
                position: 'absolute',
                bottom: '14px',
                right: '14px',
                zIndex: 35,
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                borderRadius: '10px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)',
                color: 'white',
                pointerEvents: 'none',
                maxWidth: 'calc(100% - 28px)'
              }}
            >
              <span style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                backgroundColor: isVideoOn ? '#10b981' : '#f59e0b',
                display: 'inline-block',
                boxShadow: isVideoOn ? '0 0 8px #10b981' : 'none',
                flexShrink: 0
              }}></span>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap' }}>
                  {localDisplayName}
                </span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500 }}>
                  {localRoleBadge} {localCompanyTag ? `• ${localCompanyTag}` : ''}
                </span>
              </div>
              {!isMicOn && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.25)', padding: '3px', borderRadius: '4px', marginLeft: '4px' }}>
                  <MicOff size={13} style={{ color: '#ef4444' }} />
                </div>
              )}
              {isScreenSharing && (
                <span style={{ 
                  backgroundColor: 'rgba(26, 115, 232, 0.25)', 
                  color: '#60a5fa', 
                  fontSize: '0.65rem', 
                  padding: '2px 6px', 
                  borderRadius: '6px', 
                  fontWeight: 600,
                  border: '1px solid rgba(96, 165, 250, 0.3)' 
                }}>
                  Sharing Screen
                </span>
              )}
            </div>
          </div>

          {/* Remote Video (Partner) */}
          <div 
            style={{ 
              position: 'relative',
              width: '48%', 
              aspectRatio: '16/10', 
              borderRadius: '16px',
              overflow: 'hidden',
              border: isCallConnected ? '2px solid #10b981' : '2px solid rgba(255,255,255,0.15)',
              backgroundColor: '#0f172a',
              boxShadow: isCallConnected 
                ? '0 0 25px rgba(16, 185, 129, 0.25), 0 20px 25px -5px rgba(0, 0, 0, 0.5)' 
                : '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}
          >
            {/* Always-mounted remote video element */}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: isCallConnected && remoteStream ? 'block' : 'none' 
              }}
            />

            {/* When partner turns camera off during active call */}
            {isCallConnected && remoteStream && !partnerVideoOn && (
              <div 
                style={{ 
                  position: 'absolute',
                  inset: 0,
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(8px)',
                  color: '#94a3b8',
                  zIndex: 20
                }}
              >
                <VideoOff size={44} style={{ marginBottom: '0.5rem', color: '#64748b' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{partnerName}&apos;s Camera is Off</span>
              </div>
            )}

            {/* When partner is not yet sending live video */}
            {(!isCallConnected || !remoteStream) && (
              <div 
                style={{ 
                  position: 'absolute',
                  inset: 0,
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '1.5rem', 
                  textAlign: 'center', 
                  backgroundColor: '#0f172a' 
                }}
              >
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                  <img 
                    src={partnerAvatar} 
                    alt={partnerName} 
                    style={{ 
                      width: '85px', 
                      height: '85px', 
                      borderRadius: '50%', 
                      objectFit: 'cover',
                      border: '3px solid rgba(255,255,255,0.2)'
                    }} 
                  />
                  <span 
                    style={{ 
                      position: 'absolute', 
                      bottom: 0, 
                      right: 0, 
                      width: '18px', 
                      height: '18px', 
                      borderRadius: '50%', 
                      backgroundColor: '#f59e0b', 
                      border: '3px solid #0f172a' 
                    }} 
                  />
                </div>

                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'white', marginBottom: '2px' }}>
                  {partnerName}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '12px' }}>
                  {partnerTitle}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }}></span>
                  <span style={{ fontSize: '0.75rem', color: '#fcd34d', fontWeight: 500 }}>
                    Waiting for {partnerRole} to enter room...
                  </span>
                </div>

                <button
                  type="button"
                  onClick={callPartner}
                  className="btn btn-outline"
                  style={{ fontSize: '0.75rem', color: '#cbd5e1', borderColor: '#475569', padding: '0.35rem 0.85rem' }}
                >
                  <RefreshCw size={13} style={{ marginRight: '4px', display: 'inline' }} />
                  <span>Retry Call / Connect Now</span>
                </button>
              </div>
            )}

            {/* Bottom-Right Name Tag for Remote Video */}
            <div 
              style={{
                position: 'absolute',
                bottom: '14px',
                right: '14px',
                zIndex: 35,
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                borderRadius: '10px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)',
                color: 'white',
                pointerEvents: 'none',
                maxWidth: 'calc(100% - 28px)'
              }}
            >
              <span style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                backgroundColor: isCallConnected ? '#10b981' : '#f59e0b',
                display: 'inline-block',
                boxShadow: isCallConnected ? '0 0 8px #10b981' : 'none',
                flexShrink: 0
              }}></span>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap' }}>
                  {partnerName}
                </span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500 }}>
                  {remoteRoleBadge} {remoteCompanyTag ? `• ${remoteCompanyTag}` : ''}
                </span>
              </div>
              {isCallConnected && (
                <span style={{ 
                  backgroundColor: 'rgba(16, 185, 129, 0.2)', 
                  color: '#34d399', 
                  fontSize: '0.65rem', 
                  padding: '2px 6px', 
                  borderRadius: '6px', 
                  fontWeight: 700,
                  letterSpacing: '0.5px',
                  border: '1px solid rgba(16, 185, 129, 0.3)' 
                }}>
                  LIVE HD
                </span>
              )}
              {!partnerMicOn && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.25)', padding: '3px', borderRadius: '4px', marginLeft: '4px' }}>
                  <MicOff size={13} style={{ color: '#ef4444' }} />
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Dynamic In-Call Chat Drawer */}
        {isChatOpen && (
          <aside 
            className="flex flex-col border-l"
            style={{ 
              width: '340px', 
              backgroundColor: '#1e293b', 
              borderColor: 'rgba(255,255,255,0.1)' 
            }}
          >
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-primary" />
                <h3 className="font-bold text-sm text-white">Live In-Call Chat</h3>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-white" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
              {messages.map((m, idx) => (
                <div key={idx} className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-xs text-gray-400">
                    <span className="font-semibold text-gray-200">{m.sender}</span>
                    <span>{m.time}</span>
                  </div>
                  <div 
                    className="p-3 rounded-xl text-sm"
                    style={{ 
                      backgroundColor: m.sender.includes('You') ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                      color: 'white',
                      maxWidth: '90%',
                      alignSelf: m.sender.includes('You') ? 'flex-end' : 'flex-start'
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t flex gap-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <input 
                type="text" 
                placeholder="Type a message or code snippet..." 
                className="input-field flex-1"
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', borderColor: 'rgba(255,255,255,0.2)', fontSize: '0.85rem' }}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 0.8rem' }}>
                <Send size={16} />
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* Controls Footer */}
      <footer className="p-3 flex justify-center items-center gap-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#0b1120' }}>
        {/* Mic Toggle */}
        <button 
          onClick={toggleMic}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: isMicOn ? '#94a3b8' : 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div 
            className="p-3 rounded-full transition-colors"
            style={{ backgroundColor: isMicOn ? '#1e293b' : 'rgba(234, 67, 53, 0.2)' }}
          >
            {isMicOn ? <Mic size={20} className="text-white" /> : <MicOff size={20} className="text-danger" />}
          </div>
          <span className="text-[11px] font-medium">{isMicOn ? 'Mute' : 'Unmute'}</span>
        </button>
        
        {/* Camera Toggle */}
        <button 
          onClick={toggleVideo}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: isVideoOn ? '#94a3b8' : 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div 
            className="p-3 rounded-full transition-colors"
            style={{ backgroundColor: isVideoOn ? '#1e293b' : 'rgba(234, 67, 53, 0.2)' }}
          >
            {isVideoOn ? <VideoIcon size={20} className="text-white" /> : <VideoOff size={20} className="text-danger" />}
          </div>
          <span className="text-[11px] font-medium">{isVideoOn ? 'Stop Video' : 'Start Video'}</span>
        </button>
        
        {/* Screen Share */}
        <button 
          onClick={toggleScreenShare}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: isScreenSharing ? 'var(--primary)' : '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div 
            className="p-3 rounded-full transition-colors"
            style={{ backgroundColor: isScreenSharing ? 'rgba(26, 115, 232, 0.2)' : '#1e293b' }}
          >
            <MonitorUp size={20} className={isScreenSharing ? 'text-primary' : 'text-white'} />
          </div>
          <span className="text-[11px] font-medium">{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
        </button>
        
        {/* In-Call Chat */}
        <button 
          onClick={() => setIsChatOpen(prev => !prev)}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: isChatOpen ? 'var(--primary)' : '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div 
            className="p-3 rounded-full transition-colors"
            style={{ backgroundColor: isChatOpen ? 'rgba(26, 115, 232, 0.2)' : '#1e293b' }}
          >
            <MessageSquare size={20} className={isChatOpen ? 'text-primary' : 'text-white'} />
          </div>
          <span className="text-[11px] font-medium">Chat ({messages.length})</span>
        </button>

        {/* View / Submit Feedback Button */}
        {interviewId && (
          <Link to={`/feedback?interviewId=${interviewId}`}>
            <button className="btn btn-outline text-xs text-white border-gray-600 flex items-center gap-1.5 py-2 px-3">
              <FileText size={15} />
              <span>Evaluation Report</span>
            </button>
          </Link>
        )}
      </footer>
    </div>
  );
};

export default VideoRoom;
