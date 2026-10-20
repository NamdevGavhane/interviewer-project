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
  Users,
  ListChecks,
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  User
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Peer from 'peerjs';
import { useAuth } from '../context/AuthContext';
import apiClient from '../utils/apiClient';
import Avatar from '../components/Avatar';
import './VideoRoom.css';

const VideoRoom = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const interviewId = searchParams.get('interviewId');
  const roleParam = searchParams.get('role');
  const navigate = useNavigate();

  const { user: currentUserData, role: authRole } = useAuth();
  const [meetingRoomId, setMeetingRoomId] = useState(interviewId || searchParams.get('room') || 'main-session');
  const [currentRole, setCurrentRole] = useState(authRole === 'professional' ? 'interviewer' : 'candidate');
  const [iceServers, setIceServers] = useState([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]);
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

  // Live Q&A and Evaluation States
  const [drawerTab, setDrawerTab] = useState('chat'); // 'chat' | 'questions'
  const [liveQuestions, setLiveQuestions] = useState([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newCandidateAnswer, setNewCandidateAnswer] = useState('');
  const [newQuestionCritique, setNewQuestionCritique] = useState('');
  const [newQuestionScore, setNewQuestionScore] = useState(85);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const peerRef = useRef(null);
  const currentCallRef = useRef(null);
  const dataConnRef = useRef(null);
  const chatBottomRef = useRef(null);
  const [audioAutoplayBlocked, setAudioAutoplayBlocked] = useState(false);
  
  // Connection state refs to prevent stale closure loops and duplicate calling
  const isCallConnectedRef = useRef(false);
  const isCallingRef = useRef(false);

  // Clean IDs for PeerJS (alphanumeric only)
  const cleanRoomId = (meetingRoomId || 'session').replace(/[^a-zA-Z0-9]/g, '');
  const myPeerId = `ip-${cleanRoomId}-${currentRole}`;
  const partnerPeerId = `ip-${cleanRoomId}-${partnerRole}`;

  // 1. Fetch room access and dynamic ICE credentials
  useEffect(() => {
    if (interviewId) {
      apiClient.get(`/api/interviews/${interviewId}/room-access`)
        .then(res => {
          const data = res.data;
          setInterview(data.interview);
          setCurrentRole(data.userRole);
          if (data.iceServers) setIceServers(data.iceServers);
          if (data.meetingRoomId) setMeetingRoomId(data.meetingRoomId);
          if (data.interview?.questions?.length) {
            setLiveQuestions(data.interview.questions);
          }
          if (data.interview?.transcript?.length) {
            setMessages(data.interview.transcript.map(m => ({
              sender: m.role || 'Participant',
              text: m.text,
              time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Saved'
            })));
          }
        })
        .catch(err => {
          setMediaError(err.response?.data?.message || err.message || 'Access Denied: You cannot join this interview room.');
        });
    }
  }, [interviewId]);

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

  // 3. Initialize Camera & Mic with echo cancellation
  const startCamera = async () => {
    try {
      setMediaError(null);
      setConnectionStatus('Requesting camera & microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: false, // Prevents Windows audio enhancements from aggressively silencing voice
          autoGainControl: true
        }
      });

      // Explicitly ensure all audio tracks are unmuted and active
      stream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });

      mediaStreamRef.current = stream;
      setCameraActive(true);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(e => console.warn('Local play warning:', e));
      }

      // If already in an active call, update or add media tracks to WebRTC connection
      if (currentCallRef.current && currentCallRef.current.peerConnection) {
        const pc = currentCallRef.current.peerConnection;
        const senders = pc.getSenders();
        const vTrack = stream.getVideoTracks()[0];
        const aTrack = stream.getAudioTracks()[0];

        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
        if (audioSender && aTrack) {
          audioSender.replaceTrack(aTrack);
        } else if (aTrack && pc.addTrack) {
          try { pc.addTrack(aTrack, stream); } catch (e) { console.warn('addTrack audio notice:', e); }
        }

        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender && vTrack) {
          videoSender.replaceTrack(vTrack);
        } else if (vTrack && pc.addTrack) {
          try { pc.addTrack(vTrack, stream); } catch (e) { console.warn('addTrack video notice:', e); }
        }
      }

      setConnectionStatus('Camera and microphone ready.');
      return stream;
    } catch (err) {
      console.warn('Camera error:', err);
      setMediaError('Camera/microphone permission blocked or no mic found. Click "Enable Camera" or allow access in browser URL bar.');
      setCameraActive(false);
      setConnectionStatus('Camera permission required.');
      return null;
    }
  };

  useEffect(() => {
    startCamera().catch(e => console.warn('Initial camera start:', e));

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Dedicated function to play remote audio and video cleanly through browser pipelines
  const playRemoteMedia = (stream) => {
    if (!stream) return;

    // 1. Dedicated remote audio playback (immune to video display/layout changes)
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.volume = 1.0;
      remoteAudioRef.current.muted = false;
      const audioPromise = remoteAudioRef.current.play();
      if (audioPromise !== undefined) {
        audioPromise
          .then(() => {
            console.log('Remote audio playing successfully!');
            setAudioAutoplayBlocked(false);
          })
          .catch(err => {
            console.warn('Browser autoplay blocked partner audio, user gesture required:', err);
            setAudioAutoplayBlocked(true);
          });
      }
    }

    // 2. Remote video playback
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      remoteVideoRef.current.volume = 1.0;
      remoteVideoRef.current.muted = false;
      remoteVideoRef.current.play().catch(e => console.warn('Remote video play warning:', e));
    }
  };

  // Ensure local video always plays when cameraActive or ref updates
  useEffect(() => {
    if (localVideoRef.current && mediaStreamRef.current) {
      localVideoRef.current.srcObject = mediaStreamRef.current;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(e => console.warn('Local video play:', e));
    }
  }, [cameraActive, isVideoOn]);

  // Ensure remote audio/video plays when remoteStream updates
  useEffect(() => {
    if (remoteStream) {
      playRemoteMedia(remoteStream);
    }
  }, [remoteStream, isCallConnected]);

  // Global user interaction listener to immediately unlock any browser autoplay restrictions
  useEffect(() => {
    const unlockAudio = () => {
      if (remoteAudioRef.current && remoteAudioRef.current.srcObject) {
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.play()
          .then(() => setAudioAutoplayBlocked(false))
          .catch(() => {});
      }
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.muted = false;
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Setup data connection handlers
  const attachDataHandlers = (conn) => {
    dataConnRef.current = conn;
    conn.on('data', (data) => {
      if (data?.type === 'media_state') {
        if (typeof data.isMicOn === 'boolean') setPartnerMicOn(data.isMicOn);
        if (typeof data.isVideoOn === 'boolean') setPartnerVideoOn(data.isVideoOn);
      } else if (data?.type === 'qa_update') {
        if (Array.isArray(data.questions)) {
          setLiveQuestions(data.questions);
        }
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
          iceServers: iceServers && iceServers.length > 0 ? iceServers : [
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

      // Handle Incoming Call with robust audio & video answering
      peerInstance.on('call', async (incomingCall) => {
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

        // Ensure we answer with an active local media stream containing AUDIO and VIDEO
        let streamToAnswer = mediaStreamRef.current;
        if (!streamToAnswer) {
          console.log('Awaiting local stream before answering call to ensure audio is included...');
          try {
            streamToAnswer = await startCamera();
          } catch (err) {
            console.warn('Error starting camera on incoming call:', err);
          }
        }

        if (streamToAnswer) {
          streamToAnswer.getAudioTracks().forEach(t => { t.enabled = true; });
          incomingCall.answer(streamToAnswer);
        } else {
          incomingCall.answer();
        }

        incomingCall.on('stream', (stream) => {
          console.log('Received remote live stream with tracks:', stream.getTracks().map(t => `${t.kind}: enabled=${t.enabled}`));
          setRemoteStream(stream);
          setIsCallConnected(true);
          isCallConnectedRef.current = true;
          isCallingRef.current = false;
          setConnectionStatus(`🟢 Live Call Connected with ${partnerName}`);
          playRemoteMedia(stream);
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

  // Outgoing Call Function with robust audio/video verification
  const callPartner = async () => {
    if (!peerRef.current || peerRef.current.destroyed || peerRef.current.disconnected) return;
    if (isCallConnectedRef.current || isCallingRef.current) return;

    let streamToCall = mediaStreamRef.current;
    if (!streamToCall) {
      console.log('Acquiring local stream before calling partner to ensure audio is sent...');
      try {
        streamToCall = await startCamera();
      } catch (err) {
        console.warn('Error acquiring local stream for call:', err);
      }
    }
    if (!streamToCall) return;

    // Ensure audio tracks are active
    streamToCall.getAudioTracks().forEach(t => { t.enabled = true; });

    try {
      isCallingRef.current = true;
      console.log('Initiating outbound call to partner:', partnerPeerId);
      
      // Auto-unlock callingRef after 3.5s in case partner is not yet in room
      setTimeout(() => {
        if (!isCallConnectedRef.current) {
          isCallingRef.current = false;
        }
      }, 3500);

      const call = peerRef.current.call(partnerPeerId, streamToCall);
      if (call) {
        currentCallRef.current = call;

        call.on('stream', (stream) => {
          console.log('Remote stream connected from outgoing call with tracks:', stream.getTracks().map(t => `${t.kind}: enabled=${t.enabled}`));
          setRemoteStream(stream);
          setIsCallConnected(true);
          isCallConnectedRef.current = true;
          isCallingRef.current = false;
          setConnectionStatus(`🟢 Live Call Connected with ${partnerName}`);
          playRemoteMedia(stream);
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
    // Also update sender audio tracks in active WebRTC call
    if (currentCallRef.current && currentCallRef.current.peerConnection) {
      const senders = currentCallRef.current.peerConnection.getSenders();
      senders.forEach(s => {
        if (s.track && s.track.kind === 'audio') {
          s.track.enabled = nextState;
        }
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

    // Persist chat message incrementally
    if (interviewId) {
      apiClient.post(`/api/interviews/${interviewId}/chat`, {
        text: userMsg.text,
        sender: currentUserData?.name || (currentRole === 'interviewer' ? 'Interviewer' : 'Candidate')
      }).catch(err => console.warn('Chat persistence error:', err.message));
    }

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

  // Topic-specific question suggestions for interviewer
  const getTopicQuestionSuggestions = () => {
    const topic = (interview?.topic || '').toLowerCase();
    if (topic.includes('ml') || topic.includes('ai') || topic.includes('python')) {
      return [
        'Explain the bias-variance tradeoff and methods you use to avoid overfitting.',
        'How does a RAG architecture work with vector embeddings and vector DBs?',
        'Describe methods to optimize model inference latency in production.',
        'How do you detect and handle data drift or model degradation in production?'
      ];
    }
    if (topic.includes('system') || topic.includes('cloud') || topic.includes('microservice')) {
      return [
        'How do you design a high-throughput distributed rate limiter with Redis?',
        'Explain CQRS and event sourcing patterns in distributed microservices.',
        'How do you handle distributed transactions and eventual consistency (Saga)?',
        'Describe your caching strategy with Redis/CDN and cache invalidation.'
      ];
    }
    // Default: Frontend, MERN, Full Stack
    return [
      'How does the React Fiber reconciler handle concurrent rendering and interrupts?',
      'Explain your strategy for state management, caching, and race condition prevention.',
      'How do you design scalable MongoDB schemas and compound indexes (ESR rule)?',
      'Can you walk through how you ensure security in Node.js REST APIs (JWT, CSRF, rate limiting)?'
    ];
  };

  // Add / Log Live Question Asked by HR during session
  const handleAddLiveQuestion = async (e) => {
    if (e) e.preventDefault();
    if (!newQuestionText.trim()) {
      alert('Please enter a question asked to the candidate.');
      return;
    }

    const newQA = {
      question: newQuestionText.trim(),
      candidateAnswer: newCandidateAnswer.trim() || 'Verbal explanation provided by candidate during live session.',
      feedback: newQuestionCritique.trim() || 'Assessed for technical depth, accuracy, and communication.',
      score: Number(newQuestionScore) || 85
    };

    const updated = [...liveQuestions, newQA];
    setLiveQuestions(updated);
    setNewQuestionText('');
    setNewCandidateAnswer('');
    setNewQuestionCritique('');
    setNewQuestionScore(85);

    if (interviewId) {
      try {
        setIsSavingQuestion(true);
        await apiClient.post(`/api/interviews/${interviewId}/questions`, {
          questions: updated,
          transcript: messages
        });
      } catch (err) {
        console.warn('Error saving question:', err.message);
      } finally {
        setIsSavingQuestion(false);
      }
    }

    // Sync to partner via WebRTC data channel
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send({
        type: 'qa_update',
        questions: updated
      });
    }
  };

  // Delete a live question
  const handleDeleteLiveQuestion = async (idx) => {
    const updated = liveQuestions.filter((_, i) => i !== idx);
    setLiveQuestions(updated);

    if (interviewId) {
      try {
        await apiClient.post(`/api/interviews/${interviewId}/questions`, {
          questions: updated,
          transcript: messages
        });
      } catch (err) {
        console.warn('Error syncing deleted question:', err.message);
      }
    }

    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send({
        type: 'qa_update',
        questions: updated
      });
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

        // Always save live questions and chat transcript to database
        await fetch(`${API_BASE_URL}/api/interviews/${interviewId}/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: liveQuestions,
            transcript: messages
          })
        });
      } catch (err) {
        console.error('Error marking interview complete:', err);
      }
      navigate(`/feedback?interviewId=${interviewId}&completed=true&role=${currentRole}`);
    } else {
      navigate('/interviews');
    }
  };

  const isInterviewer = currentRole === 'interviewer';

  // Resolve participant names matching exact screenshot
  const interviewerDisplayName = interview?.interviewerId?.name || (currentRole === 'interviewer' && currentUserData?.name) || 'Rahul Sharma';
  const candidateDisplayName = interview?.candidateId?.name || (currentRole === 'candidate' && currentUserData?.name) || 'You';

  // Local Screen Details (You)
  const localDisplayName = isInterviewer ? interviewerDisplayName : candidateDisplayName;
  const localRoleBadge = isInterviewer ? 'Professional' : 'Candidate';
  const localCompanyTag = isInterviewer ? 'Cognizant' : null;

  // Remote Screen Details (Partner)
  const partnerName = isInterviewer ? candidateDisplayName : interviewerDisplayName;
  const remoteRoleBadge = isInterviewer ? 'Candidate' : 'Professional';
  const remoteCompanyTag = isInterviewer ? null : 'Cognizant';

  const rawPartnerTitle = interview
    ? (isInterviewer 
        ? (interview.candidateId?.email || 'Engineering Candidate') 
        : (interview.interviewerId?.title || 'Professional'))
    : (isInterviewer ? 'Engineering Candidate' : 'Professional');
  const partnerTitle = rawPartnerTitle?.includes('Batch 3') ? 'Professional' : rawPartnerTitle;

  const partnerAvatar = interview
    ? (isInterviewer ? interview.candidateId?.avatar : interview.interviewerId?.avatar)
    : '';

  return (
    <div className="video-room-container" style={{ position: 'relative', overflow: 'hidden', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#090d16' }}>
      {/* Dedicated high-priority WebRTC remote audio element */}
      <audio 
        ref={remoteAudioRef} 
        autoPlay 
        playsInline 
        style={{ position: 'fixed', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px', bottom: 0, left: 0 }} 
      />

      {/* Browser Autoplay Blocked Banner */}
      {audioAutoplayBlocked && (
        <div 
          onClick={() => {
            if (remoteAudioRef.current) {
              remoteAudioRef.current.muted = false;
              remoteAudioRef.current.play().then(() => setAudioAutoplayBlocked(false));
            }
          }}
          style={{
            position: 'absolute',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            backgroundColor: '#f59e0b',
            color: '#0f172a',
            padding: '8px 20px',
            borderRadius: '25px',
            fontWeight: 'bold',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)'
          }}
        >
          <span>🔊 Audio muted by browser — Click anywhere to unmute live partner</span>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center p-3 px-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#0f172a', flexShrink: 0 }}>
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
      <div style={{ flex: 1, minHeight: 0, height: 'calc(100vh - 138px)', display: 'flex', overflow: 'hidden' }}>
        {/* Cinema / PiP Stage matching user screenshot */}
        <main className="vr-cinema-stage">
          {/* Main Remote Video Container */}
          <div className="vr-remote-video-container">
            {/* Live WebRTC Video */}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              className="vr-remote-video"
              style={{ display: isCallConnected && remoteStream ? 'block' : 'none' }}
            />

            {/* Standby / Interviewer Image when waiting for peer stream */}
            {(!isCallConnected || !remoteStream) && (
              <img 
                src="/rahul-sharma.jpg" 
                alt={partnerName} 
                className="vr-remote-poster"
              />
            )}

            {/* Remote Interviewer Floating Card (Bottom-Left) */}
            <div className="vr-interviewer-card">
              <div className="vr-card-icon">
                <User size={16} />
              </div>
              <div className="vr-card-text">
                <span className="vr-card-name">{partnerName}</span>
                <span className="vr-card-role">{remoteRoleBadge}</span>
              </div>
            </div>
          </div>

          {/* Picture-in-Picture Floating Card (Top-Right) */}
          <div className="vr-pip-card">
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              className="vr-pip-video"
              style={{ 
                transform: isScreenSharing ? 'none' : (isMirrored ? 'scaleX(-1)' : 'none'),
                display: cameraActive && isVideoOn ? 'block' : 'none' 
              }}
            />

            {(!cameraActive || !isVideoOn) && (
              <div className="vr-pip-placeholder">
                <VideoOff size={22} />
                <span style={{ fontSize: '0.72rem', marginTop: '4px' }}>Camera Off</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsMirrored(prev => !prev)}
              className="vr-pip-flip-btn"
              title="Mirror / Flip Video"
            >
              <RefreshCw size={11} />
            </button>

            {/* Pill: 🎙️ You (Candidate) */}
            <div className="vr-pip-pill">
              {isMicOn ? <Mic size={11} /> : <MicOff size={11} style={{ color: '#ef4444' }} />}
              <span>You ({currentRole === 'interviewer' ? 'Interviewer' : 'Candidate'})</span>
            </div>
          </div>
        </main>

      {/* Dynamic In-Call Drawer: Chat & Live Q&A */}
      {isChatOpen && (
        <aside 
          className="flex flex-col border-l"
          style={{ 
            width: '380px', 
            height: '100%',
            flexShrink: 0,
            backgroundColor: '#0f172a', 
            borderColor: 'rgba(255,255,255,0.1)' 
          }}
        >
          {/* Drawer Top Navigation Tabs */}
          <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#1e293b' }}>
            <button
              type="button"
              onClick={() => setDrawerTab('chat')}
              className="flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              style={{
                backgroundColor: drawerTab === 'chat' ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: drawerTab === 'chat' ? '#38bdf8' : '#94a3b8',
                borderBottom: drawerTab === 'chat' ? '2px solid #38bdf8' : '2px solid transparent',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer'
              }}
            >
              <MessageSquare size={15} />
              <span>In-Call Chat ({messages.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab('questions')}
              className="flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              style={{
                backgroundColor: drawerTab === 'questions' ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: drawerTab === 'questions' ? '#38bdf8' : '#94a3b8',
                borderBottom: drawerTab === 'questions' ? '2px solid #38bdf8' : '2px solid transparent',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer'
              }}
            >
              <ListChecks size={15} />
              <span>Live Q&A ({liveQuestions.length})</span>
            </button>
            <button 
              onClick={() => setIsChatOpen(false)} 
              className="px-3 text-gray-400 hover:text-white" 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              title="Close Drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* TAB 1: Chat Content */}
          {drawerTab === 'chat' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
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

              <form onSubmit={handleSendMessage} className="p-3 border-t flex gap-2" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#1e293b' }}>
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
            </div>
          )}

          {/* TAB 2: Live Q&A Assessment Content */}
          {drawerTab === 'questions' && (
            <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 gap-4">
              {/* Header Info */}
              <div className="p-3 rounded-lg border text-xs" style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', borderColor: 'rgba(56, 189, 248, 0.25)', color: '#bae6fd' }}>
                <div className="font-bold flex items-center gap-1.5 mb-1 text-white">
                  <ListChecks size={14} className="text-primary" />
                  Live Q&A Transcript & Assessment
                </div>
                <span>Questions and candidate answers logged here are automatically synced to the official Evaluation Report.</span>
              </div>

              {/* Interviewer Form to Log Question Asked & Candidate Answer */}
              {isInterviewer ? (
                <form onSubmit={handleAddLiveQuestion} className="p-3.5 rounded-xl border flex flex-col gap-3" style={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.12)' }}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-white flex items-center gap-1">
                      <Plus size={14} className="text-primary" /> Log Question Asked by You
                    </span>
                    <span className="text-[10px] text-gray-400">Score: {newQuestionScore}%</span>
                  </div>

                  {/* Quick Domain Suggestion Chips */}
                  <div>
                    <span className="text-[10px] text-gray-400 block mb-1">Suggested questions for this session:</span>
                    <div className="flex flex-wrap gap-1">
                      {getTopicQuestionSuggestions().slice(0, 3).map((sugg, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setNewQuestionText(sugg)}
                          className="text-[10px] px-2 py-0.5 rounded border text-left truncate max-w-full"
                          style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#94a3b8' }}
                          title={sugg}
                        >
                          + {sugg}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question Asked Input */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-300 block mb-1">Question Asked by Interviewer:</label>
                    <input 
                      type="text" 
                      className="input-field text-xs w-full"
                      style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
                      placeholder="e.g. How does React Fiber handle concurrent rendering?"
                      value={newQuestionText}
                      onChange={(e) => setNewQuestionText(e.target.value)}
                    />
                  </div>

                  {/* Candidate Answer Given */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-300 block mb-1">Candidate's Answer / Summary:</label>
                    <textarea 
                      className="input-field text-xs w-full"
                      style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
                      rows={2}
                      placeholder="Summarize key points answered by the candidate..."
                      value={newCandidateAnswer}
                      onChange={(e) => setNewCandidateAnswer(e.target.value)}
                    />
                  </div>

                  {/* HR Feedback Critique */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-300 block mb-1">HR Critique / Feedback Note:</label>
                    <input 
                      type="text" 
                      className="input-field text-xs w-full"
                      style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
                      placeholder="e.g. In-depth understanding of Fiber architecture and state scheduling."
                      value={newQuestionCritique}
                      onChange={(e) => setNewQuestionCritique(e.target.value)}
                    />
                  </div>

                  {/* Score Slider */}
                  <div>
                    <div className="flex justify-between items-center text-[11px] text-gray-300 mb-1">
                      <span>Candidate Score on this Question:</span>
                      <span className="font-bold text-success">{newQuestionScore}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" 
                      className="w-full"
                      value={newQuestionScore} 
                      onChange={(e) => setNewQuestionScore(e.target.value)} 
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary text-xs py-2 flex items-center justify-center gap-1.5"
                    disabled={isSavingQuestion}
                  >
                    <Plus size={14} />
                    <span>{isSavingQuestion ? 'Saving to Database...' : 'Log Question & Score'}</span>
                  </button>
                </form>
              ) : (
                <div className="p-3 rounded-xl border text-xs text-gray-300" style={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)' }}>
                  <span className="font-semibold text-white">Live Candidate View:</span>
                  <p className="mt-1 text-gray-400">Questions asked by the interviewer and your responses will appear below in real-time as they are evaluated.</p>
                </div>
              )}

              {/* Recorded Questions List */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-gray-300 flex items-center justify-between">
                  <span>Questions Evaluated ({liveQuestions.length}):</span>
                  {liveQuestions.length > 0 && <span className="text-[10px] text-success">● Synced to Report</span>}
                </span>

                {liveQuestions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400 border border-dashed rounded-lg" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                    No questions logged yet for this interview.
                  </div>
                ) : (
                  liveQuestions.map((item, idx) => (
                    <div 
                      key={idx}
                      className="p-3 rounded-lg border flex flex-col gap-2"
                      style={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-start gap-1.5">
                          <span style={{ backgroundColor: 'var(--primary)', color: 'white', fontSize: '10px', fontWeight: 'bold', padding: '1px 5px', borderRadius: '4px' }}>
                            Q{idx + 1}
                          </span>
                          <span className="font-bold text-xs text-white leading-tight">
                            {item.question}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="badge badge-success text-[10px] font-bold">
                            {item.score || 85}%
                          </span>
                          {isInterviewer && (
                            <button 
                              type="button" 
                              onClick={() => handleDeleteLiveQuestion(idx)} 
                              className="text-danger p-0.5 hover:text-red-400"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                              title="Delete Question"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Candidate Answer Display */}
                      <div className="p-2 rounded text-[11px] italic text-gray-300 border-l-2" style={{ backgroundColor: 'rgba(0,0,0,0.25)', borderLeftColor: 'var(--primary)' }}>
                        <span className="font-semibold not-italic text-[10px] text-gray-400 block mb-0.5">Candidate Answer:</span>
                        "{item.candidateAnswer}"
                      </div>

                      {/* HR Feedback Display */}
                      {item.feedback && (
                        <div className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Sparkles size={11} className="text-warning flex-shrink-0" />
                          <span><strong>Feedback:</strong> {item.feedback}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>
      )}
      </div>

      {/* Controls Footer */}
      <footer className="p-3 flex justify-center items-center gap-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#0b1120' }}>
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
        
        {/* In-Call Chat Button */}
        <button 
          onClick={() => {
            if (isChatOpen && drawerTab === 'chat') {
              setIsChatOpen(false);
            } else {
              setIsChatOpen(true);
              setDrawerTab('chat');
            }
          }}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: (isChatOpen && drawerTab === 'chat') ? 'var(--primary)' : '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div 
            className="p-3 rounded-full transition-colors"
            style={{ backgroundColor: (isChatOpen && drawerTab === 'chat') ? 'rgba(26, 115, 232, 0.2)' : '#1e293b' }}
          >
            <MessageSquare size={20} className={(isChatOpen && drawerTab === 'chat') ? 'text-primary' : 'text-white'} />
          </div>
          <span className="text-[11px] font-medium">Chat ({messages.length})</span>
        </button>

        {/* Live Q&A Assessment Button */}
        <button 
          onClick={() => {
            if (isChatOpen && drawerTab === 'questions') {
              setIsChatOpen(false);
            } else {
              setIsChatOpen(true);
              setDrawerTab('questions');
            }
          }}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: (isChatOpen && drawerTab === 'questions') ? 'var(--primary)' : '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div 
            className="p-3 rounded-full transition-colors relative"
            style={{ backgroundColor: (isChatOpen && drawerTab === 'questions') ? 'rgba(26, 115, 232, 0.2)' : '#1e293b' }}
          >
            <ListChecks size={20} className={(isChatOpen && drawerTab === 'questions') ? 'text-primary' : 'text-white'} />
            {liveQuestions.length > 0 && (
              <span 
                style={{ 
                  position: 'absolute', 
                  top: '-3px', 
                  right: '-3px', 
                  backgroundColor: '#10b981', 
                  color: 'white', 
                  borderRadius: '50%', 
                  width: '18px', 
                  height: '18px', 
                  fontSize: '10px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 'bold' 
                }}
              >
                {liveQuestions.length}
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium">Live Q&A ({liveQuestions.length})</span>
        </button>

        {/* View / Submit Feedback Button */}
        {interviewId && (
          <Link to={`/feedback?interviewId=${interviewId}&role=${currentRole}`}>
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
