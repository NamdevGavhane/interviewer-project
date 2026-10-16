import { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  Download, 
  FileText, 
  HelpCircle,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  Building2,
  Check,
  Award,
  MessageSquare
} from 'lucide-react';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import { downloadInterviewReportPDF } from '../utils/interviewReportGenerator';
import { API_BASE_URL } from '../config/api';

const FeedbackReport = () => {
  const [searchParams] = useSearchParams();
  const { interviewId: paramInterviewId } = useParams();
  const interviewId = searchParams.get('interviewId') || paramInterviewId;
  const justCompleted = searchParams.get('completed') === 'true';

  const [feedback, setFeedback] = useState(null);
  const [interview, setInterview] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Form states for submitting evaluation
  const [formData, setFormData] = useState({
    overallScore: 82,
    technicalScore: 85,
    communicationScore: 80,
    relevanceScore: 80,
    qaList: [
      {
        question: 'How does the React Fiber reconciler handle concurrent rendering, interrupts, and DOM updates?',
        candidateAnswer: 'Fiber introduces a linked-list work-in-progress tree with priority lanes. Rather than blocking the main thread during recursive diffing, Fiber yields back to the browser event loop for high-priority user events and commits finished work in a single atomic phase.',
        feedback: 'In-depth conceptual understanding of Fiber reconciliation, cooperative scheduling, and atomic commit phase.',
        score: 90
      },
      {
        question: 'Explain your strategy for managing state, asynchronous data fetching, and race condition prevention.',
        candidateAnswer: 'I use custom hooks or TanStack Query for server state caching and optimistic updates. To mitigate race conditions, I pass AbortController signals to Axios/fetch to cancel outdated pending promises when query parameters change.',
        feedback: 'Great explanation of request deduplication, cache invalidation, and AbortController cleanup.',
        score: 88
      },
      {
        question: 'How do you design scalable MongoDB schemas and compound indexes following the Equality-Sort-Range (ESR) rule?',
        candidateAnswer: 'I align index keys with query patterns: first exact equality filters, then sort keys, followed by range predicates. For relation schemas, I embed 1-to-few bounded data and reference 1-to-many unbounded documents to avoid document size limit issues.',
        feedback: 'Accurate and practical application of MongoDB ESR rules and embedding versus referencing tradeoffs.',
        score: 85
      },
      {
        question: 'Can you walk through how you ensure security in Node.js REST APIs regarding authentication, CSRF, and rate limiting?',
        candidateAnswer: 'I implement short-lived JWT access tokens with Secure, HttpOnly, SameSite cookies for refresh tokens. For DDoS and brute-force protection, I apply express-rate-limit backed by Redis, use Helmet for HTTP security headers, and sanitize inputs with Joi.',
        feedback: 'Comprehensive architectural answer covering JWT refresh patterns, Redis rate-limiting, and defense-in-depth headers.',
        score: 89
      }
    ],
    newQuestion: '',
    newAnswer: '',
    newCritique: '',
    newScore: 85,
    strengthInput: '',
    strengths: [
      'Strong grasp of JavaScript asynchronous execution & event loop',
      'Clean state decomposition and React hook architecture',
      'Articulate and structured answers'
    ],
    improvementInput: '',
    improvements: [
      'Deepen knowledge of Webpack/Vite bundler internals',
      'Adopt STAR method for answering open-ended system design questions'
    ],
    topicInput: '',
    suggestedTopics: ['React 19 Server Components', 'System Design & Distributed Caching'],
    detailedNotes: 'Candidate demonstrated high aptitude. With targeted practice on system scale questions, candidate will comfortably succeed in FAANG-level loops.'
  });
  const [submitting, setSubmitting] = useState(false);

  const currentUserId = localStorage.getItem('userId');
  const currentUserRole = localStorage.getItem('userRole') || 'candidate';
  const roleQuery = searchParams.get('role');

  const isInterviewerOrEvaluator = 
    currentUserRole === 'professional' ||
    currentUserRole === 'interviewer' ||
    roleQuery === 'interviewer' ||
    roleQuery === 'professional' ||
    (feedback?.interviewerId?._id && String(feedback.interviewerId._id) === String(currentUserId)) ||
    (interview?.interviewerId?._id && String(interview.interviewerId._id) === String(currentUserId)) ||
    justCompleted;

  const fetchFeedback = async () => {
    try {
      setLoading(true);
      let url = '';
      if (interviewId) {
        url = `${API_BASE_URL}/api/feedbacks/interview/${interviewId}`;
      } else if (currentUserId) {
        url = `${API_BASE_URL}/api/feedbacks/candidate/${currentUserId}`;
      }

      // Fetch feedback and interview session data in parallel
      const [feedbackRes, interviewRes] = await Promise.all([
        url ? fetch(url).catch(() => null) : Promise.resolve(null),
        interviewId ? fetch(`${API_BASE_URL}/api/interviews/${interviewId}`).catch(() => null) : Promise.resolve(null)
      ]);

      let singleFeedback = null;
      if (feedbackRes && feedbackRes.ok) {
        const data = await feedbackRes.json();
        singleFeedback = Array.isArray(data) ? data[0] : data;
      }

      let interviewData = null;
      if (interviewRes && interviewRes.ok) {
        interviewData = await interviewRes.json();
      }

      setFeedback(singleFeedback);
      setInterview(interviewData);

      if (interviewData?.transcript && Array.isArray(interviewData.transcript)) {
        setTranscript(interviewData.transcript);
      }

      // Prioritize live recorded questions from interview session
      const liveQuestions = (interviewData?.questions && Array.isArray(interviewData.questions) && interviewData.questions.length > 0)
        ? interviewData.questions
        : null;

      const feedbackQuestions = (singleFeedback?.qaList && Array.isArray(singleFeedback.qaList) && singleFeedback.qaList.length > 0)
        ? singleFeedback.qaList
        : null;

      const activeQuestions = liveQuestions || feedbackQuestions;

      if (singleFeedback || interviewData) {
        setFormData(prev => ({
          ...prev,
          overallScore: singleFeedback?.overallScore ?? 82,
          technicalScore: singleFeedback?.technicalScore ?? 85,
          communicationScore: singleFeedback?.communicationScore ?? 80,
          relevanceScore: singleFeedback?.relevanceScore ?? 80,
          qaList: (activeQuestions && activeQuestions.length > 0) ? activeQuestions : prev.qaList,
          strengths: singleFeedback?.strengths || prev.strengths,
          improvements: singleFeedback?.improvements || prev.improvements,
          suggestedTopics: singleFeedback?.suggestedTopics || (interviewData?.topic ? [interviewData.topic] : prev.suggestedTopics),
          detailedNotes: singleFeedback?.detailedNotes || (interviewData?.topic ? `Mock interview conducted for ${interviewData.topic}.` : prev.detailedNotes),
          strengthInput: '',
          improvementInput: '',
          topicInput: '',
          newQuestion: '',
          newAnswer: '',
          newCritique: '',
          newScore: 85
        }));
      } else {
        if (currentUserRole === 'professional' || currentUserRole === 'interviewer' || justCompleted) {
          setShowForm(true);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [interviewId, currentUserId]);

  const handleAddStrength = () => {
    if (!formData.strengthInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      strengths: [...prev.strengths, prev.strengthInput.trim()],
      strengthInput: ''
    }));
  };

  const handleRemoveStrength = (idx) => {
    setFormData(prev => ({
      ...prev,
      strengths: prev.strengths.filter((_, i) => i !== idx)
    }));
  };

  const handleAddImprovement = () => {
    if (!formData.improvementInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      improvements: [...prev.improvements, prev.improvementInput.trim()],
      improvementInput: ''
    }));
  };

  const handleRemoveImprovement = (idx) => {
    setFormData(prev => ({
      ...prev,
      improvements: prev.improvements.filter((_, i) => i !== idx)
    }));
  };

  const handleAddQA = () => {
    if (!formData.newQuestion.trim()) {
      alert('Please enter a question asked by HR.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      qaList: [
        ...prev.qaList,
        {
          question: prev.newQuestion.trim(),
          candidateAnswer: prev.newAnswer.trim() || 'Candidate provided detailed verbal explanation.',
          feedback: prev.newCritique.trim() || 'Evaluated for conceptual accuracy and clarity.',
          score: Number(prev.newScore) || 85
        }
      ],
      newQuestion: '',
      newAnswer: '',
      newCritique: '',
      newScore: 85
    }));
  };

  const handleEditQA = (idx) => {
    const item = formData.qaList[idx];
    setFormData(prev => ({
      ...prev,
      newQuestion: item.question,
      newAnswer: item.candidateAnswer,
      newCritique: item.feedback,
      newScore: item.score || 85,
      qaList: prev.qaList.filter((_, i) => i !== idx)
    }));
  };

  const handleClearQA = () => {
    if (window.confirm('Clear all questions to record the actual questions asked?')) {
      setFormData(prev => ({ ...prev, qaList: [] }));
    }
  };

  const handleLoadDomainPreset = (domain) => {
    if (domain === 'mern') {
      setFormData(prev => ({
        ...prev,
        newQuestion: 'How does the React Fiber reconciler handle concurrent rendering and interrupts?'
      }));
    } else if (domain === 'system_design') {
      setFormData(prev => ({
        ...prev,
        newQuestion: 'How do you design a high-throughput distributed rate limiter with Redis and sliding windows?'
      }));
    } else if (domain === 'dsa') {
      setFormData(prev => ({
        ...prev,
        newQuestion: 'Explain the algorithm and time/space complexity to detect cycles in a directed graph.'
      }));
    } else if (domain === 'ai') {
      setFormData(prev => ({
        ...prev,
        newQuestion: 'Explain the bias-variance tradeoff and methods you use to avoid overfitting in production models.'
      }));
    }
  };

  const handleRemoveQA = (idx) => {
    setFormData(prev => ({
      ...prev,
      qaList: prev.qaList.filter((_, i) => i !== idx)
    }));
  };

  const handleSaveEvaluation = async (e) => {
    e.preventDefault();
    if (!interviewId) {
      alert('Cannot save feedback without an active Interview ID.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/api/feedbacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId,
          candidateId: feedback?.candidateId?._id || interview?.candidateId?._id || currentUserId,
          interviewerId: feedback?.interviewerId?._id || interview?.interviewerId?._id || currentUserId,
          overallScore: Number(formData.overallScore),
          technicalScore: Number(formData.technicalScore),
          communicationScore: Number(formData.communicationScore),
          relevanceScore: Number(formData.relevanceScore),
          qaList: formData.qaList,
          strengths: formData.strengths,
          improvements: formData.improvements,
          suggestedTopics: formData.suggestedTopics,
          detailedNotes: formData.detailedNotes
        })
      });

      // Synchronize directly into Interview.questions as well
      await fetch(`${API_BASE_URL}/api/interviews/${interviewId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: formData.qaList })
      }).catch(err => console.warn('Questions sync notice:', err));

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to save evaluation');
      }

      const updated = await res.json();
      setFeedback(updated);
      setInterview(prev => prev ? ({ ...prev, questions: formData.qaList }) : prev);
      setShowForm(false);
      alert('Evaluation and actual Q&A report saved successfully to database!');
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPDF = () => {
    try {
      setDownloading(true);
      const dataToExport = {
        ...(feedback || {}),
        overallScore: feedback?.overallScore ?? formData.overallScore,
        technicalScore: feedback?.technicalScore ?? formData.technicalScore,
        communicationScore: feedback?.communicationScore ?? formData.communicationScore,
        relevanceScore: feedback?.relevanceScore ?? formData.relevanceScore,
        qaList: (feedback?.qaList && feedback.qaList.length > 0) ? feedback.qaList : formData.qaList,
        strengths: feedback?.strengths?.length ? feedback.strengths : formData.strengths,
        improvements: feedback?.improvements?.length ? feedback.improvements : formData.improvements,
        suggestedTopics: feedback?.suggestedTopics?.length ? feedback.suggestedTopics : formData.suggestedTopics,
        detailedNotes: feedback?.detailedNotes || formData.detailedNotes,
        interviewerId: {
          name: feedback?.interviewerId?.name || interviewerName,
          title: feedback?.interviewerId?.title || 'Technical Specialist & HR Evaluator',
          company: feedback?.interviewerId?.company || 'InterviewPro Expert'
        },
        candidateId: {
          name: feedback?.candidateId?.name || localStorage.getItem('userName') || 'Namdev Sharma',
          email: feedback?.candidateId?.email || localStorage.getItem('userEmail') || 'namdev.sharma@gmail.com'
        },
        interviewId: {
          topic: feedback?.interviewId?.topic || 'Mock Technical & HR Interview',
          date: feedback?.interviewId?.date || new Date().toLocaleDateString('en-GB'),
          timeSlot: feedback?.interviewId?.timeSlot || '45 Mins Session',
          _id: interviewId || feedback?.interviewId?._id || 'INV2026'
        }
      };

      downloadInterviewReportPDF(dataToExport);
    } catch (err) {
      console.error(err);
      alert('Error generating PDF report: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <div className="card text-center p-12 text-muted">Loading feedback evaluation...</div>;
  }

  const overall = feedback ? feedback.overallScore : formData.overallScore;
  const technical = feedback ? feedback.technicalScore : formData.technicalScore;
  const communication = feedback ? feedback.communicationScore : formData.communicationScore;
  const relevance = feedback ? feedback.relevanceScore : formData.relevanceScore;
  const strengthsList = (feedback && feedback.strengths?.length > 0) ? feedback.strengths : formData.strengths;
  const improvementsList = (feedback && feedback.improvements?.length > 0) ? feedback.improvements : formData.improvements;
  const topicsList = (feedback && feedback.suggestedTopics?.length > 0) ? feedback.suggestedTopics : formData.suggestedTopics;
  
  // Live questions priority: interview.questions -> feedback.qaList -> formData.qaList
  const liveQuestionsFromInterview = (interview?.questions && Array.isArray(interview.questions) && interview.questions.length > 0) ? interview.questions : null;
  const feedbackQuestions = (feedback?.qaList && Array.isArray(feedback.qaList) && feedback.qaList.length > 0) ? feedback.qaList : null;
  const qaListToDisplay = liveQuestionsFromInterview || feedbackQuestions || formData.qaList;

  const interviewerName = feedback?.interviewerId?.name || interview?.interviewerId?.name || 'Shushant Gaikwad';
  const interviewerTitle = feedback?.interviewerId?.title || interview?.interviewerId?.title || 'Senior Technical Lead & HR Evaluator';
  const interviewerCompany = feedback?.interviewerId?.company || interview?.interviewerId?.company || 'Cognizant';
  const candidateName = feedback?.candidateId?.name || interview?.candidateId?.name || localStorage.getItem('userName') || 'Candidate';
  const topicName = feedback?.interviewId?.topic || interview?.topic || 'Mock Technical & HR Interview';

  return (
    <div>
      {/* Top Navigation & Action Controls */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <Link to="/interviews" className="inline-flex items-center gap-2 text-muted hover:text-primary transition-colors">
          <ArrowLeft size={18} />
          <span className="font-medium">Back to Interviews</span>
        </Link>
        <div className="flex items-center gap-2">
          {/* Prominent PDF Download Button */}
          <button 
            type="button" 
            className="btn btn-primary flex items-center gap-2 shadow-sm"
            onClick={handleDownloadPDF}
            disabled={downloading}
          >
            <Download size={16} />
            <span>{downloading ? 'Generating PDF...' : 'Download PDF Report'}</span>
          </button>

          {isInterviewerOrEvaluator && (
            <button 
              type="button" 
              className="btn btn-outline flex items-center gap-2"
              onClick={() => setShowForm(!showForm)}
            >
              <Edit3 size={16} />
              {showForm ? 'Cancel Editing' : 'Edit / Submit Evaluation'}
            </button>
          )}
        </div>
      </div>

      {/* Just Finished Celebration Banner */}
      {justCompleted && (
        <div 
          className="card mb-6 border-2 flex items-center justify-between flex-wrap gap-4"
          style={{ backgroundColor: '#f0fdf4', borderColor: '#22c55e' }}
        >
          <div className="flex items-center gap-3">
            <div style={{ backgroundColor: '#22c55e', color: 'white', padding: '0.6rem', borderRadius: '50%' }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg" style={{ color: '#15803d' }}>
                Interview Finished Successfully! 🎉
              </h3>
              <p className="text-sm" style={{ color: '#166534' }}>
                Your complete performance report with all questions asked by HR, your answers, and ratings is ready.
              </p>
            </div>
          </div>
          <button 
            type="button"
            className="btn flex items-center gap-2" 
            style={{ backgroundColor: '#15803d', color: 'white' }}
            onClick={handleDownloadPDF}
          >
            <Download size={16} />
            Download Report PDF
          </button>
        </div>
      )}

      {/* Header Info Banner */}
      <div className="card mb-6 p-6" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)', borderColor: '#bfdbfe' }}>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge badge-primary text-xs uppercase font-bold tracking-wider">Official Report</span>
              <span className="badge badge-success text-xs font-semibold flex items-center gap-1">
                <ShieldCheck size={12} /> Verified Session
              </span>
            </div>
            <h2 className="text-2xl font-bold mt-1">Mock Interview Performance & Q&A Report</h2>
            <p className="text-muted mt-1 text-sm">
              Conducted by <strong>{interviewerName}</strong> ({interviewerTitle} @ {interviewerCompany})
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted">Domain & Focus Area</div>
            <div className="font-bold text-primary text-sm mt-0.5">{topicName}</div>
            <div className="text-xs text-muted mt-1 flex items-center justify-end gap-1">
              <User size={12} />
              <span>Candidate: <strong>{candidateName}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Evaluation Input Form (For Interviewer) */}
      {showForm && (
        <div className="card mb-8 border-2" style={{ borderColor: 'var(--primary)', backgroundColor: '#fcfdfd' }}>
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Edit3 size={18} className="text-primary" />
            Interviewer Evaluation & Q&A Form
          </h3>

          <form onSubmit={handleSaveEvaluation} className="flex flex-col gap-6">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div className="input-group">
                <label>Overall Score: {formData.overallScore}/100</label>
                <input 
                  type="range" min="0" max="100" 
                  value={formData.overallScore} 
                  onChange={(e) => setFormData(p => ({ ...p, overallScore: e.target.value }))} 
                />
              </div>
              <div className="input-group">
                <label>Technical: {formData.technicalScore}%</label>
                <input 
                  type="range" min="0" max="100" 
                  value={formData.technicalScore} 
                  onChange={(e) => setFormData(p => ({ ...p, technicalScore: e.target.value }))} 
                />
              </div>
              <div className="input-group">
                <label>Communication: {formData.communicationScore}%</label>
                <input 
                  type="range" min="0" max="100" 
                  value={formData.communicationScore} 
                  onChange={(e) => setFormData(p => ({ ...p, communicationScore: e.target.value }))} 
                />
              </div>
              <div className="input-group">
                <label>Relevance: {formData.relevanceScore}%</label>
                <input 
                  type="range" min="0" max="100" 
                  value={formData.relevanceScore} 
                  onChange={(e) => setFormData(p => ({ ...p, relevanceScore: e.target.value }))} 
                />
              </div>
            </div>

            {/* Questions Asked by HR & Candidate Answers Editor */}
            <div className="p-4 rounded-xl border bg-white" style={{ borderColor: 'var(--border)' }}>
              <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                <div>
                  <label className="font-bold text-sm block">
                    Questions Asked by HR & Candidate Answers ({formData.qaList.length})
                  </label>
                  <span className="text-xs text-muted">Directly synced to evaluation report and PDF</span>
                </div>
                <div className="flex items-center gap-2">
                  {formData.qaList.length > 0 && (
                    <button 
                      type="button" 
                      onClick={handleClearQA}
                      className="btn btn-outline text-xs text-danger py-1 px-2.5 flex items-center gap-1"
                      style={{ borderColor: 'var(--danger)' }}
                      title="Clear template questions to add actual questions asked"
                    >
                      <Trash2 size={13} /> Clear All
                    </button>
                  )}
                </div>
              </div>

              {/* Topic Preset Chips */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap p-2 rounded-lg bg-gray-50 border" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[11px] font-semibold text-gray-500">Quick Topic Presets:</span>
                <button type="button" onClick={() => handleLoadDomainPreset('mern')} className="text-[11px] px-2 py-0.5 rounded border bg-white hover:bg-blue-50 text-gray-700">React / MERN</button>
                <button type="button" onClick={() => handleLoadDomainPreset('system_design')} className="text-[11px] px-2 py-0.5 rounded border bg-white hover:bg-blue-50 text-gray-700">System Design</button>
                <button type="button" onClick={() => handleLoadDomainPreset('dsa')} className="text-[11px] px-2 py-0.5 rounded border bg-white hover:bg-blue-50 text-gray-700">DSA</button>
                <button type="button" onClick={() => handleLoadDomainPreset('ai')} className="text-[11px] px-2 py-0.5 rounded border bg-white hover:bg-blue-50 text-gray-700">AI / ML</button>
              </div>

              {/* List of currently recorded Q&As */}
              <div className="flex flex-col gap-3 mb-4">
                {formData.qaList.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted border border-dashed rounded-lg">
                    No questions in list. Use the form below to add questions actually asked by the interviewer and candidate answers.
                  </div>
                ) : (
                  formData.qaList.map((qa, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg border flex flex-col gap-1 text-xs" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex justify-between items-start font-bold">
                        <span className="text-primary">Q{idx + 1} (HR): {qa.question}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="badge badge-info text-[10px]">{qa.score || 85}%</span>
                          <button 
                            type="button" 
                            onClick={() => handleEditQA(idx)} 
                            className="text-primary p-0.5 hover:text-blue-700" 
                            title="Edit this question"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleRemoveQA(idx)} 
                            className="text-danger p-0.5 hover:text-red-700" 
                            title="Delete this question"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="text-gray-700 italic">Ans: "{qa.candidateAnswer}"</div>
                      {qa.feedback && <div className="text-muted text-[11px]">Critique: {qa.feedback}</div>}
                    </div>
                  ))
                )}
              </div>

              {/* Add New Question & Answer */}
              <div className="p-3 bg-blue-50/50 rounded-lg border flex flex-col gap-3" style={{ borderColor: '#dbeafe' }}>
                <span className="font-semibold text-xs text-primary">+ Add / Edit Question Asked by HR & Candidate Response:</span>
                <input 
                  type="text" 
                  className="input-field text-xs" 
                  placeholder="Question asked by HR (e.g. How does React reconcile Virtual DOM?)"
                  value={formData.newQuestion}
                  onChange={(e) => setFormData(p => ({ ...p, newQuestion: e.target.value }))}
                />
                <textarea 
                  className="input-field text-xs" 
                  rows={2}
                  placeholder="Answer given by candidate during call..."
                  value={formData.newAnswer}
                  onChange={(e) => setFormData(p => ({ ...p, newAnswer: e.target.value }))}
                />
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="input-field text-xs flex-1" 
                    placeholder="HR Assessment note / feedback on answer..."
                    value={formData.newCritique}
                    onChange={(e) => setFormData(p => ({ ...p, newCritique: e.target.value }))}
                  />
                  <input 
                    type="number" 
                    className="input-field text-xs" 
                    style={{ width: '90px' }}
                    placeholder="Score %"
                    value={formData.newScore}
                    onChange={(e) => setFormData(p => ({ ...p, newScore: e.target.value }))}
                  />
                  <button type="button" className="btn btn-primary text-xs py-1 px-3" onClick={handleAddQA}>
                    <Plus size={14} /> Add Q&A
                  </button>
                </div>
              </div>
            </div>

            {/* Strengths editor */}
            <div>
              <label className="font-medium text-sm block mb-2">Strengths</label>
              <div className="flex gap-2 mb-2">
                <input 
                  type="text" 
                  className="input-field flex-1" 
                  placeholder="Add a strength observed during call..."
                  value={formData.strengthInput}
                  onChange={(e) => setFormData(p => ({ ...p, strengthInput: e.target.value }))}
                />
                <button type="button" className="btn btn-outline" onClick={handleAddStrength}>
                  <Plus size={16} /> Add
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {formData.strengths.map((str, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded border" style={{ borderColor: 'var(--border)' }}>
                    <span>✓ {str}</span>
                    <button type="button" onClick={() => handleRemoveStrength(idx)} className="text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Improvements editor */}
            <div>
              <label className="font-medium text-sm block mb-2">Areas for Improvement</label>
              <div className="flex gap-2 mb-2">
                <input 
                  type="text" 
                  className="input-field flex-1" 
                  placeholder="Add an improvement suggestion..."
                  value={formData.improvementInput}
                  onChange={(e) => setFormData(p => ({ ...p, improvementInput: e.target.value }))}
                />
                <button type="button" className="btn btn-outline" onClick={handleAddImprovement}>
                  <Plus size={16} /> Add
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {formData.improvements.map((imp, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded border" style={{ borderColor: 'var(--border)' }}>
                    <span>⚠ {imp}</span>
                    <button type="button" onClick={() => handleRemoveImprovement(idx)} className="text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="input-group">
              <label>Detailed Feedback & Summary Notes</label>
              <textarea 
                className="input-field" 
                rows={3}
                value={formData.detailedNotes}
                onChange={(e) => setFormData(p => ({ ...p, detailedNotes: e.target.value }))}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary py-2 self-start flex items-center gap-2"
              disabled={submitting}
            >
              <Save size={16} />
              {submitting ? 'Saving Evaluation...' : 'Save Evaluation to Database'}
            </button>
          </form>
        </div>
      )}

      {/* Main Scorecard Card */}
      <div className="card mb-6">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '3rem', alignItems: 'center' }}>
          {/* Overall Score Circle */}
          <div className="flex flex-col items-center justify-center">
            <div style={{ 
              position: 'relative', 
              width: '140px', 
              height: '140px', 
              borderRadius: '50%', 
              border: '10px solid #f0f4f8',
              borderTopColor: overall >= 75 ? 'var(--success)' : overall >= 60 ? 'var(--warning)' : 'var(--danger)',
              borderRightColor: overall >= 75 ? 'var(--success)' : overall >= 60 ? 'var(--warning)' : 'var(--danger)',
              borderBottomColor: overall >= 75 ? 'var(--success)' : overall >= 60 ? 'var(--warning)' : 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'rotate(-45deg)'
            }}>
              <div style={{ transform: 'rotate(45deg)', textAlign: 'center' }}>
                <span className="text-4xl font-bold" style={{ color: overall >= 75 ? 'var(--success)' : overall >= 60 ? '#b06000' : 'var(--danger)' }}>
                  {overall}
                </span>
                <span className="text-sm text-muted block">/100</span>
              </div>
            </div>
            <h3 className="font-bold text-lg mt-4">Overall Score</h3>
            <span className="badge badge-info mt-1">
              {overall >= 80 ? 'Strong Hire' : overall >= 70 ? 'Proficient' : 'Needs Practice'}
            </span>
          </div>

          {/* Detailed Scores */}
          <div className="flex flex-col gap-5">
            <div>
              <div className="flex justify-between mb-2 text-sm font-medium">
                <span>Technical Knowledge & Depth</span>
                <span className="font-bold">{technical}%</span>
              </div>
              <div style={{ height: '8px', backgroundColor: '#f0f4f8', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${technical}%`, height: '100%', backgroundColor: 'var(--primary)', borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2 text-sm font-medium">
                <span>Communication, Articulation & Clarity</span>
                <span className="font-bold">{communication}%</span>
              </div>
              <div style={{ height: '8px', backgroundColor: '#f0f4f8', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${communication}%`, height: '100%', backgroundColor: 'var(--primary)', borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2 text-sm font-medium">
                <span>Answer Relevance & Structured Problem Solving</span>
                <span className="font-bold">{relevance}%</span>
              </div>
              <div style={{ height: '8px', backgroundColor: '#f0f4f8', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${relevance}%`, height: '100%', backgroundColor: 'var(--primary)', borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CORE FEATURE: Questions Asked by HR & Candidate Answers */}
      <div className="card mb-6">
        <div className="flex justify-between items-center mb-5 border-b pb-4 flex-wrap gap-3" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <FileText size={20} className="text-primary" />
              <span>Questions Asked by HR & Candidate Answers</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Live Q&A transcript and individual answer scores assessed by the interviewer.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {liveQuestionsFromInterview ? (
              <span className="badge badge-success text-xs font-semibold px-2.5 py-1">
                ✓ {qaListToDisplay.length} Live Session Questions
              </span>
            ) : (
              <span className="badge badge-info text-xs px-2.5 py-1">
                {qaListToDisplay.length} Questions Evaluated
              </span>
            )}

            {transcript && transcript.length > 0 && (
              <button 
                type="button" 
                onClick={() => setShowTranscript(p => !p)}
                className="btn btn-outline text-xs py-1 px-2.5 flex items-center gap-1"
                style={{ borderColor: 'var(--border)' }}
              >
                <MessageSquare size={13} />
                <span>{showTranscript ? 'Hide Chat' : `Chat Transcript (${transcript.length})`}</span>
              </button>
            )}

            {isInterviewerOrEvaluator && (
              <button 
                type="button" 
                onClick={() => setShowForm(true)}
                className="btn btn-outline text-xs py-1 px-3 flex items-center gap-1.5"
                style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
              >
                <Edit3 size={13} />
                <span>Edit / Record Actual Q&A</span>
              </button>
            )}
          </div>
        </div>

        {/* Expandable Chat Transcript from Video Session */}
        {showTranscript && transcript && transcript.length > 0 && (
          <div className="p-3 mb-4 rounded-xl border bg-gray-50 flex flex-col gap-2 text-xs" style={{ borderColor: 'var(--border)' }}>
            <div className="font-bold text-gray-700 flex items-center gap-1.5">
              <MessageSquare size={14} className="text-primary" />
              Live In-Call Chat Transcript
            </div>
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5">
              {transcript.map((t, idx) => (
                <div key={idx} className="p-2 rounded bg-white border" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex justify-between text-muted text-[10px] mb-0.5">
                    <strong className="text-gray-700">{t.sender}</strong>
                    <span>{t.time}</span>
                  </div>
                  <div className="text-gray-800">{t.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {qaListToDisplay.length === 0 ? (
            <div className="p-6 text-center text-muted border border-dashed rounded-xl">
              No questions recorded yet for this session.
              {isInterviewerOrEvaluator && (
                <div className="mt-2">
                  <button type="button" onClick={() => setShowForm(true)} className="btn btn-primary text-xs py-1.5 px-3">
                    + Add Actual Questions Asked
                  </button>
                </div>
              )}
            </div>
          ) : (
            qaListToDisplay.map((item, idx) => (
              <div 
                key={idx} 
                className="p-4 rounded-xl border transition-all"
                style={{ backgroundColor: '#ffffff', borderColor: 'var(--border)' }}
              >
                {/* Question Header */}
                <div className="flex justify-between items-start gap-4 mb-2">
                  <div className="flex items-start gap-2.5">
                    <span 
                      style={{ 
                        backgroundColor: 'var(--primary)', 
                        color: 'white', 
                        fontSize: '0.75rem', 
                        fontWeight: 'bold', 
                        padding: '0.2rem 0.55rem', 
                        borderRadius: '6px' 
                      }}
                    >
                      Q{idx + 1}
                    </span>
                    <div>
                      <span className="text-xs uppercase font-bold text-primary block tracking-wider">
                        Question Asked by HR:
                      </span>
                      <h4 className="font-semibold text-base mt-0.5" style={{ color: '#0f172a' }}>
                        {item.question}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="badge badge-success text-xs font-semibold px-2 py-1">
                      Score: {item.score || 85}%
                    </span>
                    {isInterviewerOrEvaluator && (
                      <button 
                        type="button"
                        onClick={() => {
                          setShowForm(true);
                          handleEditQA(idx);
                        }}
                        className="text-primary hover:text-blue-700 p-1"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        title="Edit this question"
                      >
                        <Edit3 size={14} />
                      </button>
                    )}
                  </div>
                </div>

              {/* Candidate Answer Box */}
              <div 
                className="my-3 p-3.5 rounded-lg border-l-4 text-sm"
                style={{ 
                  backgroundColor: '#f8fafc', 
                  borderLeftColor: 'var(--primary)',
                  borderColor: 'var(--border)' 
                }}
              >
                <div className="text-xs font-bold uppercase tracking-wider mb-1 text-gray-500">
                  Candidate Answer:
                </div>
                <div className="italic" style={{ color: '#334155', lineHeight: '1.6' }}>
                  "{item.candidateAnswer}"
                </div>
              </div>

              {/* Evaluator Notes / Critique */}
              {item.feedback && (
                <div className="flex items-start gap-2 text-xs pt-1" style={{ color: '#64748b' }}>
                  <Sparkles size={14} className="text-warning flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>HR Feedback:</strong> {item.feedback}
                  </span>
                </div>
              )}
            </div>
          )))}
        </div>
      </div>

      {/* Strengths & Improvements */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Strengths */}
        <div className="card">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span style={{ color: 'var(--success)' }}>●</span> Key Strengths Observed
          </h3>
          <ul className="flex flex-col gap-3">
            {strengthsList.map((str, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 size={18} className="text-success mt-0.5 flex-shrink-0" />
                <span>{str}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Areas for Improvement */}
        <div className="card">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span style={{ color: 'var(--warning)' }}>●</span> Areas for Targeted Improvement
          </h3>
          <ul className="flex flex-col gap-3">
            {improvementsList.map((imp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertCircle size={18} className="text-warning mt-0.5 flex-shrink-0" style={{ color: 'var(--warning)' }} />
                <span>{imp}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Suggested Next Topics */}
      <div className="card mb-6">
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          Recommended Topics to Practice
        </h3>
        <div className="flex gap-2 flex-wrap">
          {topicsList.map((topic, i) => (
            <span key={i} className="badge" style={{ backgroundColor: '#eff6ff', color: 'var(--primary)', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              {topic}
            </span>
          ))}
        </div>
      </div>

      {/* Evaluator Notes Card */}
      {formData.detailedNotes && (
        <div className="card mb-6">
          <h3 className="font-bold text-base mb-2">Interviewer Feedback Notes & Closing Summary</h3>
          <p className="text-sm text-gray-700" style={{ lineHeight: '1.6' }}>
            {formData.detailedNotes}
          </p>
        </div>
      )}

      {/* Bottom CTA Card: Download PDF */}
      <div className="card p-6 border-2" style={{ borderColor: 'var(--primary)', backgroundColor: '#f8fafc' }}>
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h4 className="font-bold text-base flex items-center gap-2">
              <Download size={18} className="text-primary" />
              Download Official Interview Q&A Report (PDF)
            </h4>
            <p className="text-xs text-muted mt-1">
              Includes full score breakdowns, HR questions, candidate answers, and official verification seal.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/booking">
              <button type="button" className="btn btn-outline text-xs">
                Book Another Interview
              </button>
            </Link>
            <button 
              type="button"
              className="btn btn-primary flex items-center gap-2 text-xs py-2 px-4 shadow-sm"
              onClick={handleDownloadPDF}
              disabled={downloading}
            >
              <Download size={15} />
              <span>{downloading ? 'Preparing PDF...' : 'Download PDF Report'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackReport;
