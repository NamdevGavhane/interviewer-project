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

  // Determine active room & role
  const roomId = interviewId || searchParams.get('room') || 'main-session';
  const initialRole = roleParam || localStorage.getItem('userRole') || 'candidate';
  const [currentRole, setCurrentRole] = useState(initialRole === 'professional' || initialRole === 'admin' ? 'interviewer' : 'candidate');

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

  // 1. Fetch interview details if ID present & auto-confirm role
  useEffect(() => {
    if (interviewId) {
      fetch(`${API_BASE_URL}/api/interviews/${interviewId}`)
        .then(res => res.json())
        .then(data => {
          setInterview(data);
          const loggedUserId = localStorage.getItem('userId');
          if (loggedUserId && data) {
            const interviewerUserId = data.interviewerId?._id || data.interviewerId;
            const candidateUserId = data.candidateId?._id || data.candidateId;
            if (loggedUserId === interviewerUserId && !roleParam) {
              setCurrentRole('interviewer');
            } else if (loggedUserId === candidateUserId && !roleParam) {
              setCurrentRole('candidate');
            }
          }
        })
        .catch(err => console.error('Error loading interview:', err));
    }
  }, [interviewId, roleParam]);

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
        if (err.type === 'unavailable-id') {
          setConnectionStatus(`Ready. Attempting partner connection...`);
        }
      });

      // Stable Periodic Check: Only attempts call when NOT connected and NOT already calling
      callRetryInterval = setInterval(() => {
        if (
          !isCallConnectedRef.current && 
          !isCallingRef.current && 
          peerRef.current && 
          !peerRef.current.destroyed && 
          mediaStreamRef.current
        ) {
          // Candidate acts as caller to prevent simultaneous glare collision
          if (currentRole === 'candidate') {
            callPartner();
          }
        }
      }, 3000);

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
          if (currentCallRef.current === call) {
            isCallingRef.current = false;
          }
        });
      } else {
        isCallingRef.current = false;
      }

      // Also open data connection for real-time chat if needed
      if (!dataConnRef.current || !dataConnRef.current.open) {
        const conn = peerRef.current.connect(partnerPeerId);
        conn.on('open', () => {
          attachDataHandlers(conn);
        });
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
    const partnerRoleToPass = currentRole === 'interviewer' ? 'candidate' : 'professional';
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

  const partnerName = interview 
    ? (currentRole === 'interviewer' ? (interview.candidateId?.name || 'Candidate') : (interview.interviewerId?.name || 'Shushant Gaikwad')) 
    : (currentRole === 'interviewer' ? 'Candidate' : 'Shushant Gaikwad');

  const partnerTitle = interview
    ? (currentRole === 'interviewer' ? 'Software Candidate' : (interview.interviewerId?.title || 'MERN Developer & Batch 3 Lead'))
    : (currentRole === 'interviewer' ? 'Software Candidate' : 'MERN Developer & Batch 3 Lead');

  const partnerAvatar = interview
    ? (currentRole === 'interviewer' ? interview.candidateId?.avatar : interview.interviewerId?.avatar)
    : '/shushant-gaikwad.png';

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
              {interview?.topic || 'Batch 3 Interview - MERN Stack Architecture & Coding'}
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
        <main className="flex-1 flex items-center justify-center p-6 gap-6 relative" style={{ backgroundColor: '#090d16' }}>
          {/* Local Video (You) */}
          <div 
            className="relative rounded-2xl overflow-hidden border shadow-2xl flex items-center justify-center"
            style={{ 
              width: '48%', 
              aspectRatio: '16/10', 
              borderColor: 'rgba(255,255,255,0.15)',
              backgroundColor: '#0f172a'
            }}
          >
            {/* Mirror / Flip Camera View Button */}
            <button
              type="button"
              onClick={() => setIsMirrored(prev => !prev)}
              title="Flip / Mirror Camera View"
              className="absolute top-3 right-3 bg-black/60 hover:bg-black/85 text-gray-300 hover:text-white px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 transition-all z-20 backdrop-blur"
              style={{ border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
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
              className="w-full h-full object-cover"
              style={{ 
                transform: isScreenSharing ? 'none' : (isMirrored ? 'scaleX(-1)' : 'none'),
                display: cameraActive && isVideoOn ? 'block' : 'none' 
              }}
            />

            {/* Camera Off Overlay */}
            {!isVideoOn && (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-slate-900">
                <VideoOff size={48} className="mb-2 text-gray-500" />
                <span className="text-sm font-semibold">Your Camera is Off</span>
              </div>
            )}

            {/* Permission blocked overlay */}
            {!cameraActive && isVideoOn && (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 p-6 text-center bg-slate-900">
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '1rem', borderRadius: '50%', marginBottom: '0.75rem' }}>
                  <VideoOff size={36} className="text-danger" />
                </div>
                <div className="text-sm font-bold mb-1">Webcam Permission Needed</div>
                <p className="text-xs text-gray-400 max-w-xs mb-3">Please allow camera access in your browser to broadcast your video to the interviewer.</p>
                <button type="button" onClick={startCamera} className="btn btn-primary text-xs py-1.5 px-3">
                  <RefreshCw size={13} className="mr-1 inline" /> Allow Camera Access
                </button>
              </div>
            )}

            {/* Bottom Label Tag */}
            <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur px-3 py-1 rounded-lg text-xs font-semibold text-white flex items-center gap-2 z-20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              <span>You ({currentRole})</span>
              {!isMicOn && <MicOff size={13} className="text-danger" title="You are muted" />}
              {isScreenSharing && <span className="badge badge-info text-[10px] py-0 px-1.5">Screen Sharing</span>}
            </div>
          </div>

          {/* Remote Video (Partner) */}
          <div 
            className="relative rounded-2xl overflow-hidden border shadow-2xl flex items-center justify-center"
            style={{ 
              width: '48%', 
              aspectRatio: '16/10', 
              borderColor: isCallConnected ? '#10b981' : 'rgba(255,255,255,0.15)',
              backgroundColor: '#0f172a'
            }}
          >
            {/* Always-mounted remote video element */}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
              style={{ display: isCallConnected && remoteStream ? 'block' : 'none' }}
            />

            {/* When partner turns camera off during active call */}
            {isCallConnected && remoteStream && !partnerVideoOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-slate-900/95 backdrop-blur z-10">
                <VideoOff size={48} className="mb-2 text-gray-500" />
                <span className="text-sm font-semibold">{partnerName}&apos;s Camera is Off</span>
              </div>
            )}

            {/* When partner is not yet sending live video */}
            {(!isCallConnected || !remoteStream) && (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-900 relative">
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                  <img 
                    src={partnerAvatar} 
                    alt={partnerName} 
                    style={{ 
                      width: '90px', 
                      height: '90px', 
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

                <div className="text-base font-bold text-white mb-0.5">{partnerName}</div>
                <div className="text-xs text-gray-400 mb-3">{partnerTitle}</div>

                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                  <span className="text-xs text-amber-300 font-medium">
                    Waiting for {partnerRole} to enter room...
                  </span>
                </div>

                <button
                  type="button"
                  onClick={callPartner}
                  className="btn btn-outline text-xs text-gray-300 border-gray-600 hover:text-white flex items-center gap-1.5 py-1 px-3"
                >
                  <RefreshCw size={13} />
                  <span>Retry Call / Connect Now</span>
                </button>
              </div>
            )}

            {/* Bottom Label Tag */}
            <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur px-3 py-1 rounded-lg text-xs font-semibold text-white flex items-center gap-2 z-20">
              <span className={`w-2 h-2 rounded-full ${isCallConnected ? 'bg-emerald-500' : 'bg-amber-400'} inline-block`}></span>
              <span>{partnerName} ({partnerRole})</span>
              {!partnerMicOn && <MicOff size={13} className="text-danger" title="Partner is muted" />}
              {isCallConnected && <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">LIVE HD</span>}
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
