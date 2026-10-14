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
  FileText
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

const VideoRoom = () => {
  const [searchParams] = useSearchParams();
  const interviewId = searchParams.get('interviewId');
  const navigate = useNavigate();

  // State
  const [interview, setInterview] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Live Timer State
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // In-Call Chat State
  const [messages, setMessages] = useState([
    {
      sender: 'System',
      text: 'Welcome to your InterviewPro live video session. Your connection is encrypted.',
      time: 'Just now'
    },
    {
      sender: 'Interviewer',
      text: 'Hello! Can you hear and see me clearly? Feel free to share your screen or code anytime.',
      time: 'Just now'
    }
  ]);
  const [chatInput, setChatInput] = useState('');

  // Refs
  const localVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chatBottomRef = useRef(null);

  const currentUserRole = localStorage.getItem('userRole') || 'candidate';

  // 1. Fetch interview details if ID present
  useEffect(() => {
    if (interviewId) {
      fetch(`http://localhost:5000/api/interviews/${interviewId}`)
        .then(res => res.json())
        .then(data => setInterview(data))
        .catch(err => console.error('Error loading interview:', err));
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

  // 3. Initialize Camera & Mic
  useEffect(() => {
    let stream = null;
    const initMedia = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: true
          });
          mediaStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          setCameraActive(true);
        } else {
          setMediaError('Browser media devices API is not supported in this environment.');
        }
      } catch (err) {
        console.warn('Media access note:', err.message);
        setMediaError('Camera/Mic permission preview mode (Simulated HD Feed).');
        setCameraActive(false);
      }
    };

    initMedia();

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  // Toggle Microphone
  const toggleMic = () => {
    if (mediaStreamRef.current) {
      const audioTracks = mediaStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !isMicOn;
      });
    }
    setIsMicOn(prev => !prev);
  };

  // Toggle Camera
  const toggleVideo = () => {
    if (mediaStreamRef.current) {
      const videoTracks = mediaStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !isVideoOn;
      });
    }
    setIsVideoOn(prev => !prev);
  };

  // Toggle Screen Share
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = screenStream;
          }
          setIsScreenSharing(true);

          screenStream.getVideoTracks()[0].onended = () => {
            if (localVideoRef.current && mediaStreamRef.current) {
              localVideoRef.current.srcObject = mediaStreamRef.current;
            }
            setIsScreenSharing(false);
          };
        } else {
          alert('Screen sharing is not supported by your browser.');
        }
      } catch (err) {
        console.warn('Screen share canceled or unsupported:', err);
      }
    } else {
      if (localVideoRef.current && mediaStreamRef.current) {
        localVideoRef.current.srcObject = mediaStreamRef.current;
      }
      setIsScreenSharing(false);
    }
  };

  // Send Chat Message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = {
      sender: currentUserRole === 'professional' ? 'Interviewer (You)' : 'Candidate (You)',
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setChatInput('');

    // Dynamic automated simulation response from partner
    setTimeout(() => {
      const replies = [
        "Received! That looks like an optimal time complexity approach.",
        "Could you also explain how this handles concurrency or race conditions?",
        "Good point! Let's continue with the technical evaluation.",
        "Thanks for sharing, I've noted that down for the evaluation summary."
      ];
      const randomReply = replies[Math.floor(Math.random() * replies.length)];
      setMessages(prev => [
        ...prev,
        {
          sender: currentUserRole === 'professional' ? 'Candidate' : 'Interviewer',
          text: randomReply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }, 2000);
  };

  // End Call & Complete Session
  const handleEndCall = async () => {
    const confirmEnd = window.confirm('Are you sure you want to end this interview session?');
    if (!confirmEnd) return;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }

    if (interviewId) {
      try {
        await fetch(`http://localhost:5000/api/interviews/${interviewId}/status`, {
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
    ? (currentUserRole === 'professional' ? (interview.candidateId?.name || 'Candidate') : (interview.interviewerId?.name || 'Interviewer')) 
    : (currentUserRole === 'professional' ? 'Candidate' : 'Interviewer');

  const partnerRole = interview
    ? (currentUserRole === 'professional' ? 'Candidate' : (interview.interviewerId?.title || 'Technical Interviewer'))
    : (currentUserRole === 'professional' ? 'Candidate' : 'Technical Interviewer');

  const partnerAvatar = interview
    ? (currentUserRole === 'professional' ? interview.candidateId?.avatar : interview.interviewerId?.avatar)
    : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80';

  return (
    <div className="video-room-container" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <header className="flex justify-between items-center p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-3">
          <div style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '8px', fontWeight: 'bold' }}>IP</div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'white' }}>InterviewPro Live Room</h1>
            <p className="text-xs text-gray-400">
              {interview?.topic || 'Batch 3 Interview - MERN Stack Architecture & Coding'}
            </p>
          </div>
        </div>
        
        <div className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }}></span>
          <span>Session with <strong>{partnerName}</strong></span>
        </div>

        <div className="flex items-center gap-6">
          <div className="font-mono text-lg tracking-wider" style={{ color: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '6px' }}>
            ⏱ {formatTime(secondsElapsed)}
          </div>
          
          <button 
            className="btn flex items-center gap-2" 
            style={{ backgroundColor: 'var(--danger)', color: 'white' }}
            onClick={handleEndCall}
          >
            <PhoneOff size={16} />
            End Interview
          </button>
        </div>
      </header>

      {/* Media Note if permissions warning */}
      {mediaError && (
        <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0.4rem 1rem', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <AlertCircle size={14} className="text-warning" />
          <span>{mediaError} — Live controls (Mute, Video, Screen Share, Chat) are fully active.</span>
        </div>
      )}

      {/* Main Area: Videos + Sliding Chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <main className="flex-1 flex items-center justify-center p-6 gap-6 relative">
          {/* Local Video (You) */}
          <div className="relative rounded-2xl overflow-hidden bg-gray-900 border" style={{ width: '48%', aspectRatio: '16/10', borderColor: 'rgba(255,255,255,0.1)' }}>
            {cameraActive && isVideoOn ? (
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover"
                style={{ transform: isScreenSharing ? 'none' : 'scaleX(-1)' }}
              />
            ) : !isVideoOn ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-gray-900">
                <VideoOff size={48} className="mb-2" />
                <span className="text-sm font-medium">Your camera is turned off</span>
              </div>
            ) : (
              <img 
                src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
                alt="You" 
                className="w-full h-full object-cover"
              />
            )}

            <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 px-3 py-1 rounded-lg text-sm font-medium flex items-center gap-2">
              <span>You ({currentUserRole})</span>
              {!isMicOn && <MicOff size={14} className="text-danger" />}
              {isScreenSharing && <span className="badge badge-info text-xs">Screen Sharing</span>}
            </div>
          </div>

          {/* Remote Video (Interviewer / Candidate) */}
          <div className="relative rounded-2xl overflow-hidden bg-gray-900 border" style={{ width: '48%', aspectRatio: '16/10', borderColor: 'rgba(255,255,255,0.1)' }}>
            <img 
              src={partnerAvatar || "https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"} 
              alt={partnerName} 
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 px-3 py-1 rounded-lg text-sm font-medium flex items-center gap-2">
              <span>{partnerName} ({partnerRole})</span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }}></span>
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
                <h3 className="font-bold text-sm text-white">In-Call Live Chat</h3>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-white">
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
                placeholder="Type a message or code..."
                className="input-field flex-1"
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
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
      <footer className="p-4 flex justify-center items-center gap-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#0b1120' }}>
        {/* Mic Toggle */}
        <button 
          onClick={toggleMic}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: isMicOn ? '#94a3b8' : 'var(--danger)' }}
        >
          <div 
            className="p-3 rounded-full transition-colors"
            style={{ backgroundColor: isMicOn ? '#1e293b' : 'rgba(234, 67, 53, 0.2)' }}
          >
            {isMicOn ? <Mic size={22} className="text-white" /> : <MicOff size={22} className="text-danger" />}
          </div>
          <span className="text-xs font-medium">{isMicOn ? 'Mute' : 'Unmute'}</span>
        </button>
        
        {/* Camera Toggle */}
        <button 
          onClick={toggleVideo}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: isVideoOn ? '#94a3b8' : 'var(--danger)' }}
        >
          <div 
            className="p-3 rounded-full transition-colors"
            style={{ backgroundColor: isVideoOn ? '#1e293b' : 'rgba(234, 67, 53, 0.2)' }}
          >
            {isVideoOn ? <VideoIcon size={22} className="text-white" /> : <VideoOff size={22} className="text-danger" />}
          </div>
          <span className="text-xs font-medium">{isVideoOn ? 'Stop Video' : 'Start Video'}</span>
        </button>
        
        {/* Screen Share */}
        <button 
          onClick={toggleScreenShare}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: isScreenSharing ? 'var(--primary)' : '#94a3b8' }}
        >
          <div 
            className="p-3 rounded-full transition-colors"
            style={{ backgroundColor: isScreenSharing ? 'rgba(26, 115, 232, 0.2)' : '#1e293b' }}
          >
            <MonitorUp size={22} className={isScreenSharing ? 'text-primary' : 'text-white'} />
          </div>
          <span className="text-xs font-medium">{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
        </button>
        
        {/* In-Call Chat */}
        <button 
          onClick={() => setIsChatOpen(prev => !prev)}
          className="flex flex-col items-center gap-1 transition-colors"
          style={{ color: isChatOpen ? 'var(--primary)' : '#94a3b8' }}
        >
          <div 
            className="p-3 rounded-full transition-colors"
            style={{ backgroundColor: isChatOpen ? 'rgba(26, 115, 232, 0.2)' : '#1e293b' }}
          >
            <MessageSquare size={22} className={isChatOpen ? 'text-primary' : 'text-white'} />
          </div>
          <span className="text-xs font-medium">Chat ({messages.length})</span>
        </button>

        {/* View / Submit Feedback Button */}
        {interviewId && (
          <Link to={`/feedback?interviewId=${interviewId}`}>
            <button className="btn btn-outline text-xs text-white border-gray-600 flex items-center gap-1">
              <FileText size={16} />
              Evaluation Report
            </button>
          </Link>
        )}
      </footer>
    </div>
  );
};

export default VideoRoom;
