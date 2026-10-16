import { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Send, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw,
  FileText,
  Upload,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { API_BASE_URL } from '../config/api';

const SAMPLE_RESUME = `Full Stack Software Engineer with 3+ years experience building web applications.
Core Skills: React 19, Node.js, Express, MongoDB, Redis, WebRTC, TypeScript, AWS S3.
Featured Project: E-Commerce & Real-time Mock Interview Platform.
- Architected real-time video conferencing service with MediaStream and WebSocket signalling.
- Designed distributed rate limiting and caching layer with Redis, reducing API latency by 45%.
- Implemented MongoDB aggregation pipelines for user analytics and session tracking.`;

const AIInterview = () => {
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');

  useEffect(() => {
    const userRole = localStorage.getItem('userRole');
    if (userRole === 'professional' || userRole === 'admin') {
      navigate('/');
    }
  }, [navigate]);

  // Screen Stages: 'setup' | 'room' | 'report'
  const [stage, setStage] = useState('setup');

  // Setup Options
  const [topic, setTopic] = useState('mern');
  const [difficulty, setDifficulty] = useState('mid');
  const [company, setCompany] = useState('Google');
  const [resumeText, setResumeText] = useState('');
  const [detectedSkills, setDetectedSkills] = useState([]);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [resumeParseError, setResumeParseError] = useState('');

  // Active Session State
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(4);
  const [transcript, setTranscript] = useState([]);
  const [candidateAnswer, setCandidateAnswer] = useState('');
  
  // Media & Interaction States
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [loading, setLoading] = useState(false);

  // Live Timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Final Report Data
  const [reportData, setReportData] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [expandedQA, setExpandedQA] = useState({});

  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  // 1. Initialize Speech Synthesis for AI Voice
  const speakText = (text) => {
    if (!isVoiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
      if (naturalVoice) utterance.voice = naturalVoice;

      utterance.onstart = () => setIsAISpeaking(true);
      utterance.onend = () => setIsAISpeaking(false);
      utterance.onerror = () => setIsAISpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
      setIsAISpeaking(false);
    }
  };

  // 2. Initialize Speech Recognition for Candidate Voice Input
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setCandidateAnswer(prev => prev ? `${prev} ${currentTranscript}` : currentTranscript);
      };

      recognition.onerror = (e) => {
        console.warn('Speech recognition error:', e);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech-to-Text is not supported by your browser. Please type your answer in the box below!');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn(err);
      }
    }
  };

  // 3. Initialize Webcam Stream
  const initWebcam = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }
    } catch (err) {
      console.warn('Webcam permission not granted or available:', err.message);
    }
  };

  // 4. Timer interval
  useEffect(() => {
    let interval = null;
    if (stage === 'room') {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [stage]);

  // Clean up media streams
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Handle Resume File Upload (Extract text from PDF / TXT via backend parser)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting same file triggers onChange
    e.target.value = '';

    setResumeParseError('');
    setIsParsingResume(true);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const res = await fetch(`${API_BASE_URL}/api/ai/parse-resume`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract text from resume');
      }

      setResumeText(data.text);
      setUploadedFile({
        name: data.filename || file.name,
        characters: data.characters,
        wordCount: data.wordCount
      });
    } catch (err) {
      console.error('Resume upload error:', err);
      setResumeParseError(err.message || 'Failed to parse resume file');
      alert(`Could not parse resume: ${err.message}\n\nPlease copy and paste your resume text directly into the box.`);
    } finally {
      setIsParsingResume(false);
    }
  };

  // Start AI Interview Session
  const handleStartInterview = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/ai/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topic, 
          difficulty, 
          company, 
          resumeText: resumeText.trim() 
        })
      });

      if (!res.ok) throw new Error('Failed to start AI interview');

      const data = await res.json();
      setCurrentQuestion(data.question);
      setQuestionIndex(0);
      setTotalQuestions(data.totalQuestions || 4);
      setDetectedSkills(data.detectedSkills || []);
      setTranscript([{ role: 'ai', text: data.question }]);
      setElapsedSeconds(0);
      setStage('room');

      // Init webcam and speak first question
      setTimeout(() => {
        initWebcam();
        speakText(data.question);
      }, 400);

    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Answer & Fetch Next AI Question
  const handleSubmitAnswer = async (e) => {
    e.preventDefault();
    if (!candidateAnswer.trim()) {
      alert('Please speak or type your answer before submitting.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    try {
      setSubmittingAnswer(true);
      const currentAns = candidateAnswer.trim();
      const updatedTranscript = [
        ...transcript,
        { role: 'candidate', text: currentAns }
      ];
      setTranscript(updatedTranscript);

      const res = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: topic,
          difficulty,
          company,
          currentQuestionIndex: questionIndex,
          userAnswer: currentAns,
          resumeText,
          history: updatedTranscript
        })
      });

      const data = await res.json();

      setCandidateAnswer('');
      setCurrentQuestion(data.nextQuestion);
      setQuestionIndex(data.nextIndex);

      setTranscript(prev => [
        ...prev,
        { role: 'ai', text: data.nextQuestion }
      ]);

      // Speak AI response
      speakText(data.nextQuestion);

      if (data.isCompleted) {
        setTimeout(() => {
          handleGenerateReport(updatedTranscript);
        }, 1200);
      }

    } catch (err) {
      alert('Error submitting answer: ' + err.message);
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // Generate Final AI Report
  const handleGenerateReport = async (finalTranscript = transcript) => {
    try {
      setGeneratingReport(true);
      if (window.speechSynthesis) window.speechSynthesis.cancel();

      const res = await fetch(`${API_BASE_URL}/api/ai/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: userId || null,
          category: topic,
          company,
          resumeText,
          transcript: finalTranscript
        })
      });

      if (!res.ok) throw new Error('Failed to generate AI evaluation report');

      const data = await res.json();
      setReportData(data.evaluation);
      setStage('report');

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

    } catch (err) {
      alert('Error generating report: ' + err.message);
    } finally {
      setGeneratingReport(false);
    }
  };

  // PDF Generator using jsPDF
  const handleDownloadPDF = () => {
    if (!reportData) return;
    try {
      setDownloadingPdf(true);
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const margin = 40;
      let y = 45;
      const pageWidth = doc.internal.pageSize.getWidth();
      const maxLineWidth = pageWidth - margin * 2;

      // Header Banner
      doc.setFillColor(26, 115, 232);
      doc.rect(0, 0, pageWidth, 75, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('InterviewPro - AI Assessment & Q&A Transcript', margin, 35);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Domain: ${topic.toUpperCase()} | Company Target: ${company} | Date: ${new Date().toLocaleDateString('en-GB')}`, margin, 55);

      y = 100;

      // Summary Score Card
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, y, maxLineWidth, 60, 4, 4, 'FD');

      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Overall Score: ${reportData.overallScore}/100`, margin + 15, y + 25);
      doc.text(`Technical Depth: ${reportData.technicalScore}%`, margin + 160, y + 25);
      doc.text(`Communication: ${reportData.communicationScore}%`, margin + 310, y + 25);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Verdict: ${reportData.overallScore >= 80 ? 'Strong Hire' : 'Hire with Practice'} • Evaluated by Alex (Staff AI Engineer @ ${company})`, margin + 15, y + 44);

      y += 85;

      // Section: Questions and Answers Transcript
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 115, 232);
      doc.text('Complete Question & Answer Transcript:', margin, y);
      y += 18;

      const pairs = reportData.qaPairs || [];
      pairs.forEach((item, idx) => {
        if (y > 670) {
          doc.addPage();
          y = 45;
        }

        // Question
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        const qLines = doc.splitTextToSize(`Q${idx + 1}: ${item.question}`, maxLineWidth);
        doc.text(qLines, margin, y);
        y += qLines.length * 13 + 3;

        // Candidate Answer
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const aLines = doc.splitTextToSize(`Candidate Answer: "${item.candidateAnswer}"`, maxLineWidth);
        doc.text(aLines, margin, y);
        y += aLines.length * 12 + 4;

        // AI Feedback
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(71, 85, 105);
        const critiqueLines = doc.splitTextToSize(`AI Critique: ${item.critique}`, maxLineWidth);
        doc.text(critiqueLines, margin, y);
        y += critiqueLines.length * 12 + 16;
      });

      // Section: Strengths & Improvements
      if (y > 640) {
        doc.addPage();
        y = 45;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 101, 52);
      doc.text('Key Strengths:', margin, y);
      y += 14;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      (reportData.strengths || []).forEach(str => {
        doc.text(`• ${str}`, margin + 10, y);
        y += 12;
      });

      y += 8;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 83, 9);
      doc.text('Areas for Improvement:', margin, y);
      y += 14;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      (reportData.improvements || []).forEach(imp => {
        doc.text(`• ${imp}`, margin + 10, y);
        y += 12;
      });

      // Trigger instant PDF download
      doc.save(`InterviewPro_AI_Interview_${topic}_${Date.now()}.pdf`);
    } catch (err) {
      alert('Error generating PDF: ' + err.message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const toggleQAExpand = (idx) => {
    setExpandedQA(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div>
      {/* 1. SETUP STAGE WITH RESUME INPUT */}
      {stage === 'setup' && (
        <div style={{ maxWidth: '840px', margin: '0 auto' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge badge-info flex items-center gap-1">
              <Sparkles size={13} /> Resume-Driven AI Mock Interview
            </span>
          </div>
          <h2 className="text-3xl font-bold mb-2">AI Technical Interview with Resume Analysis</h2>
          <p className="text-muted mb-6">
            Enter or upload your resume below. Alex (Staff AI Engineer) will dissect your actual projects, technologies, and achievements, and challenge you with targeted interview questions.
          </p>

          <div className="card mb-6">
            {/* Resume Input Box */}
            <div className="mb-6 p-4 rounded-2xl border-2 transition-all" style={{ borderColor: resumeText ? 'var(--primary)' : 'var(--border)', backgroundColor: '#fcfdfd' }}>
              <div className="flex justify-between items-center mb-2">
                <label className="font-bold text-sm flex items-center gap-2 text-text-main">
                  <FileText size={18} className="text-primary" />
                  Your Resume / Projects / Tech Stack
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept=".txt,.md,.json,.pdf" 
                    className="hidden" 
                  />
                  <button 
                    type="button" 
                    disabled={isParsingResume}
                    className="btn btn-outline text-xs flex items-center gap-1.5 font-semibold"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isParsingResume ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-primary" />
                        Extracting PDF...
                      </>
                    ) : (
                      <>
                        <Upload size={14} /> Upload Resume File
                      </>
                    )}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-ghost text-xs text-primary font-semibold"
                    onClick={() => {
                      setResumeText(SAMPLE_RESUME);
                      setUploadedFile({ name: 'Sample Full-Stack Resume', wordCount: 180, characters: SAMPLE_RESUME.length });
                      setResumeParseError('');
                    }}
                  >
                    Load Sample Resume
                  </button>
                  {resumeText && (
                    <button 
                      type="button" 
                      className="btn btn-ghost text-xs text-danger font-semibold"
                      onClick={() => {
                        setResumeText('');
                        setUploadedFile(null);
                        setResumeParseError('');
                      }}
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Parsing Loading State */}
              {isParsingResume && (
                <div className="p-3 mb-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin flex-shrink-0" />
                  <span><strong>Reading PDF Resume...</strong> Extracting your text, skills, and projects cleanly.</span>
                </div>
              )}

              {/* Uploaded File Success Badge */}
              {uploadedFile && !isParsingResume && (
                <div className="p-2.5 mb-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                    <span>
                      <strong>{uploadedFile.name}</strong> successfully parsed ({uploadedFile.wordCount ? `${uploadedFile.wordCount.toLocaleString()} words` : `${uploadedFile.characters} chars`} extracted).
                    </span>
                  </div>
                  <button 
                    type="button" 
                    className="text-xs text-red-600 font-semibold hover:underline ml-2"
                    onClick={() => {
                      setResumeText('');
                      setUploadedFile(null);
                    }}
                  >
                    ✕ Remove
                  </button>
                </div>
              )}

              {/* Binary PDF Warning Check */}
              {resumeText.trim().startsWith('%PDF-') && (
                <div className="p-3 mb-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                    <span>
                      <strong>Binary PDF detected:</strong> The box contains raw file code. Click <strong>Upload Resume File</strong> to automatically extract clean text, or clear and paste.
                    </span>
                  </div>
                  <button 
                    type="button" 
                    className="px-2.5 py-1 rounded bg-amber-200 hover:bg-amber-300 font-semibold text-amber-900 text-xs ml-2"
                    onClick={() => { setResumeText(''); setUploadedFile(null); }}
                  >
                    Clear Raw Code
                  </button>
                </div>
              )}

              {/* Parse Error Notification */}
              {resumeParseError && (
                <div className="p-3 mb-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                  <span>{resumeParseError}</span>
                </div>
              )}

              <textarea 
                rows={5}
                placeholder="Paste your resume, skills, and projects here, or click 'Upload Resume File' above to extract your PDF automatically..."
                className="input-field w-full text-sm font-sans"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
              />

              {resumeText && !resumeText.trim().startsWith('%PDF-') && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-success font-medium flex items-center gap-1">
                    <CheckCircle2 size={14} /> Resume Loaded ({resumeText.length.toLocaleString()} characters)
                  </span>
                  <span className="text-muted">AI will probe your specific project claims and architecture decisions</span>
                </div>
              )}
            </div>

            {/* Track Selector */}
            <div className="input-group mb-5">
              <label className="font-semibold text-sm">Select Primary Technical Domain</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {[
                  { id: 'mern', name: 'Full Stack MERN Interview', desc: 'MongoDB, Express, React, Node.js Full Stack' },
                  { id: 'ml', name: 'Machine Learning & AI Track', desc: 'Python, PyTorch, Deep Learning, ML Systems' },
                  { id: 'frontend', name: 'Frontend React & Architecture', desc: 'React 19, DOM, State, Performance' },
                  { id: 'backend', name: 'Backend Node.js & Microservices', desc: 'Node.js, Databases, APIs, Concurrency' },
                  { id: 'system-design', name: 'System Design & High Scale', desc: 'Distributed Systems, Caching, Storage' },
                  { id: 'dsa', name: 'Data Structures & Algorithms', desc: 'Problem Solving, Big-O, Patterns' },
                  { id: 'behavioral', name: 'Behavioral & Leadership', desc: 'STAR method, Culture, Conflict' }
                ].map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setTopic(item.id)}
                    className="p-3 border rounded-xl transition-all"
                    style={{
                      cursor: 'pointer',
                      borderColor: topic === item.id ? 'var(--primary)' : 'var(--border)',
                      backgroundColor: topic === item.id ? 'rgba(26, 115, 232, 0.05)' : 'white',
                      borderWidth: topic === item.id ? '2px' : '1px'
                    }}
                  >
                    <div className="font-bold text-sm mb-1">{item.name}</div>
                    <div className="text-xs text-muted">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Seniority & Company */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="input-group">
                <label className="font-semibold text-sm">Seniority Level</label>
                <select 
                  className="input-field"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="junior">Junior Engineer (0 - 2 yrs)</option>
                  <option value="mid">Mid-Level Software Engineer (2 - 5 yrs)</option>
                  <option value="senior">Senior / Staff Engineer (5+ yrs)</option>
                </select>
              </div>

              <div className="input-group">
                <label className="font-semibold text-sm">Target Company Loop</label>
                <select 
                  className="input-field"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                >
                  <option value="Google">Google (L4 / L5 Standard)</option>
                  <option value="Microsoft">Microsoft (SDE II / Senior)</option>
                  <option value="Amazon">Amazon (Leadership Principles & Tech)</option>
                  <option value="Meta">Meta (Fast-paced Architecture Loop)</option>
                  <option value="Tier-1 Tech Startup">Tier-1 High Scale Startup</option>
                </select>
              </div>
            </div>

            <button 
              className="btn btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2"
              onClick={handleStartInterview}
              disabled={loading}
            >
              {loading ? (
                'Analyzing Resume & Initializing AI Room...'
              ) : (
                <>
                  <Sparkles size={18} />
                  Start Resume-Based AI Mock Interview
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 2. LIVE AI INTERVIEW ROOM STAGE */}
      {stage === 'room' && (
        <div className="flex flex-col gap-5">
          {/* Top Bar */}
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <div style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '0.4rem 0.6rem', borderRadius: '10px' }}>
                <Bot size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base leading-tight">AI Interview Session</h3>
                <span className="text-xs text-muted">
                  {company} • {topic.toUpperCase()} ({difficulty}) {detectedSkills.length > 0 ? `• Skills: ${detectedSkills.slice(0, 3).join(', ')}` : ''}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="badge badge-info text-sm py-1 px-3">
                Question {questionIndex + 1} of {totalQuestions}
              </div>

              <div className="font-mono text-sm font-semibold flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-lg">
                <Clock size={16} className="text-primary" />
                <span>{formatTimer(elapsedSeconds)}</span>
              </div>

              <button 
                className="btn btn-outline text-xs"
                onClick={() => handleGenerateReport()}
                disabled={generatingReport}
              >
                {generatingReport ? 'Evaluating...' : 'Finish & Generate PDF'}
              </button>
            </div>
          </div>

          {/* Videos Row: AI Avatar & Candidate Video */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* AI Avatar Box */}
            <div 
              className="card relative flex flex-col items-center justify-center overflow-hidden" 
              style={{ 
                height: '300px', 
                backgroundColor: '#0f172a', 
                color: 'white',
                border: isAISpeaking ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <div 
                style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50%',
                  backgroundColor: '#1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '3px solid var(--primary)',
                  boxShadow: isAISpeaking ? '0 0 25px rgba(26, 115, 232, 0.8)' : 'none',
                  transition: 'all 0.3s ease'
                }}
              >
                <Bot size={50} className="text-primary" />
              </div>

              <div className="mt-3 font-bold text-base">Alex • AI Staff Engineer</div>
              <div className="text-xs text-gray-400 mt-0.5">Interviewer @ {company}</div>

              <div className="flex items-center gap-2 mt-2">
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isAISpeaking ? '#22c55e' : '#94a3b8' }}></span>
                <span className="text-xs text-gray-300">
                  {isAISpeaking ? 'Speaking question...' : 'Listening to candidate'}
                </span>
              </div>

              <button 
                onClick={() => {
                  if (isVoiceEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
                  setIsVoiceEnabled(!isVoiceEnabled);
                }}
                className="absolute top-4 right-4 p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300"
                title={isVoiceEnabled ? 'Mute AI voice' : 'Enable AI voice'}
              >
                {isVoiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>

            {/* Candidate Webcam Box */}
            <div 
              className="card relative flex flex-col items-center justify-center overflow-hidden" 
              style={{ height: '300px', backgroundColor: '#1e293b', color: 'white' }}
            >
              {isVideoOn ? (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <VideoOff size={44} className="mb-2" />
                  <span className="text-sm">Camera Off</span>
                </div>
              )}

              <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-2">
                <span>You (Candidate)</span>
                {!isMicOn && <MicOff size={13} className="text-danger" />}
              </div>

              <div className="absolute bottom-4 right-4 flex gap-2">
                <button 
                  onClick={() => setIsVideoOn(!isVideoOn)}
                  className="p-2 rounded-full bg-black bg-opacity-60 text-white hover:bg-opacity-80"
                >
                  {isVideoOn ? <VideoIcon size={16} /> : <VideoOff size={16} />}
                </button>
                <button 
                  onClick={() => setIsMicOn(!isMicOn)}
                  className="p-2 rounded-full bg-black bg-opacity-60 text-white hover:bg-opacity-80"
                >
                  {isMicOn ? <Mic size={16} /> : <MicOff size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Active Question Box */}
          <div className="card border-2" style={{ borderColor: 'rgba(26, 115, 232, 0.3)', backgroundColor: '#fcfdfd' }}>
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-xs uppercase text-primary tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} /> AI Technical Challenge
              </span>
              <button 
                className="text-xs text-muted hover:text-primary flex items-center gap-1"
                onClick={() => speakText(currentQuestion)}
              >
                <Volume2 size={14} /> Replay Audio
              </button>
            </div>
            <p className="text-base font-semibold text-text-main leading-relaxed">
              {currentQuestion}
            </p>
          </div>

          {/* Candidate Answer Box */}
          <form onSubmit={handleSubmitAnswer} className="card">
            <div className="flex justify-between items-center mb-3">
              <label className="font-bold text-sm">Your Response / Explanation</label>
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={toggleListening}
                  className={`btn ${isListening ? 'btn-primary' : 'btn-outline'} text-xs flex items-center gap-1.5`}
                  style={{ backgroundColor: isListening ? '#ea4335' : undefined }}
                >
                  <Mic size={14} className={isListening ? 'animate-pulse' : ''} />
                  {isListening ? 'Listening (Speak Now...)' : 'Dictate with Voice 🎙️'}
                </button>
              </div>
            </div>

            <textarea 
              rows={4}
              placeholder="Speak your answer using the microphone or type your explanation & code here..."
              className="input-field w-full mb-4 font-sans text-sm"
              value={candidateAnswer}
              onChange={(e) => setCandidateAnswer(e.target.value)}
            />

            <div className="flex justify-between items-center">
              <span className="text-xs text-muted">
                Tip: Relate your answer to your real-world project challenges and trade-offs.
              </span>

              <button 
                type="submit" 
                className="btn btn-primary px-6 py-2.5 flex items-center gap-2"
                disabled={submittingAnswer}
              >
                {submittingAnswer ? (
                  'AI Evaluating...'
                ) : (
                  <>
                    <span>Submit Answer</span>
                    <Send size={15} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. FINAL AI EVALUATION & COMPLETE Q&A TRANSCRIPT (PDF DOWNLOAD) */}
      {stage === 'report' && reportData && (
        <div style={{ maxWidth: '880px', margin: '0 auto' }}>
          {/* Top Bar with PDF Download Button */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <span className="badge badge-success text-xs mb-1">Session Complete</span>
              <h2 className="text-2xl font-bold">Interview Assessment & Transcript</h2>
              <p className="text-muted text-sm">
                Candidate Evaluation • {company} Standards • {topic.toUpperCase()}
              </p>
            </div>

            <div className="flex gap-3">
              {/* PRIMARY DOWNLOAD PDF BUTTON */}
              <button 
                className="btn btn-primary flex items-center gap-2 px-5 py-2.5 text-sm shadow-md"
                onClick={handleDownloadPDF}
                disabled={downloadingPdf}
              >
                <Download size={16} />
                <span>{downloadingPdf ? 'Generating PDF...' : 'Download Q&A PDF Document'}</span>
              </button>

              <button 
                className="btn btn-outline flex items-center gap-1.5 text-sm"
                onClick={() => window.print()}
                title="Print or Save via Browser"
              >
                <Printer size={16} /> Print
              </button>

              <button 
                className="btn btn-outline flex items-center gap-1.5 text-sm"
                onClick={() => setStage('setup')}
              >
                <RotateCcw size={16} /> Retake
              </button>
            </div>
          </div>

          {/* Overall Score Circle Card */}
          <div className="card mb-6">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '3rem', alignItems: 'center' }}>
              <div className="flex flex-col items-center justify-center">
                <div style={{ 
                  position: 'relative', 
                  width: '140px', 
                  height: '140px', 
                  borderRadius: '50%', 
                  border: '10px solid #f0f4f8',
                  borderTopColor: reportData.overallScore >= 75 ? 'var(--success)' : 'var(--warning)',
                  borderRightColor: reportData.overallScore >= 75 ? 'var(--success)' : 'var(--warning)',
                  borderBottomColor: reportData.overallScore >= 75 ? 'var(--success)' : 'var(--warning)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: 'rotate(-45deg)'
                }}>
                  <div style={{ transform: 'rotate(45deg)', textAlign: 'center' }}>
                    <span className="text-4xl font-bold text-success">
                      {reportData.overallScore}
                    </span>
                    <span className="text-xs text-muted block">/ 100</span>
                  </div>
                </div>
                <h4 className="font-bold text-base mt-3">Final Performance Score</h4>
                <span className="badge badge-info text-xs mt-1">
                  {reportData.overallScore >= 80 ? 'Strong Hire' : reportData.overallScore >= 70 ? 'Hire with Reservations' : 'Needs Practice'}
                </span>
              </div>

              {/* Progress Bars */}
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex justify-between text-sm font-medium mb-1">
                    <span>Technical Accuracy & Depth</span>
                    <span>{reportData.technicalScore}%</span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#f0f4f8', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${reportData.technicalScore}%`, height: '100%', backgroundColor: 'var(--primary)', borderRadius: '4px' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm font-medium mb-1">
                    <span>Communication & Structuring</span>
                    <span>{reportData.communicationScore}%</span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#f0f4f8', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${reportData.communicationScore}%`, height: '100%', backgroundColor: 'var(--primary)', borderRadius: '4px' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm font-medium mb-1">
                    <span>Solution Relevance & Trade-offs</span>
                    <span>{reportData.relevanceScore}%</span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#f0f4f8', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${reportData.relevanceScore}%`, height: '100%', backgroundColor: 'var(--primary)', borderRadius: '4px' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DETAILED QUESTION & ANSWER TRANSCRIPT LIST */}
          <div className="card mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <FileText size={20} className="text-primary" />
                  Interview Q&A Transcript & Answers
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Detailed review of all questions asked by the AI and your responses. (Included in PDF)
                </p>
              </div>
              <span className="badge badge-secondary text-xs">
                {reportData.qaPairs?.length || 0} Questions
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {reportData.qaPairs?.map((item, idx) => (
                <div 
                  key={idx} 
                  className="p-4 rounded-xl border transition-all"
                  style={{ backgroundColor: '#f8fafc', borderColor: 'var(--border)' }}
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="flex items-start gap-2.5">
                      <span className="badge badge-primary text-xs" style={{ padding: '0.2rem 0.5rem' }}>
                        Q{idx + 1}
                      </span>
                      <h4 className="font-bold text-sm text-text-main leading-snug">
                        {item.question}
                      </h4>
                    </div>
                    <button 
                      onClick={() => toggleQAExpand(idx)}
                      className="text-muted hover:text-primary p-1"
                    >
                      {expandedQA[idx] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {/* Candidate Answer */}
                  <div className="ml-7 p-3 bg-white rounded-lg border text-sm mb-2" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                      Your Given Answer:
                    </div>
                    <p className="text-text-main leading-relaxed">
                      "{item.candidateAnswer}"
                    </p>
                  </div>

                  {/* AI Evaluation */}
                  <div className="ml-7 flex flex-col gap-1 text-xs">
                    <div className="text-primary font-semibold flex items-center gap-1">
                      <Bot size={13} /> AI Feedback & Critique:
                    </div>
                    <p className="text-muted leading-relaxed">
                      {item.critique}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Strengths & Improvements */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <h3 className="font-bold text-base mb-3 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-success" /> Key Strengths
              </h3>
              <ul className="flex flex-col gap-2">
                {reportData.strengths?.map((str, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-success mt-0.5">●</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h3 className="font-bold text-base mb-3 flex items-center gap-2">
                <AlertCircle size={18} className="text-warning" /> Areas for Improvement
              </h3>
              <ul className="flex flex-col gap-2">
                {reportData.improvements?.map((imp, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-warning mt-0.5">●</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex justify-between items-center mt-6">
            <Link to="/interviews" className="btn btn-outline text-sm">
              ← Return to My Interviews
            </Link>

            <button 
              className="btn btn-primary flex items-center gap-2 text-sm px-6 py-2.5 shadow-md"
              onClick={handleDownloadPDF}
              disabled={downloadingPdf}
            >
              <Download size={16} />
              <span>Download Official Q&A Transcript PDF</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIInterview;
