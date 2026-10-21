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
  MessageSquare,
  Loader2
} from 'lucide-react';
import { Link, useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../utils/apiClient';
import { downloadInterviewReportPDF } from '../utils/interviewReportGenerator';

const FeedbackReport = () => {
  const [searchParams] = useSearchParams();
  const { interviewId: paramInterviewId } = useParams();
  const interviewId = searchParams.get('interviewId') || paramInterviewId;
  const justCompleted = searchParams.get('completed') === 'true';
  const navigate = useNavigate();

  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [feedback, setFeedback] = useState(null);
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Candidate Review State (F1)
  const [candidateReview, setCandidateReview] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMsg, setReviewMsg] = useState(null);

  // Form states for submitting evaluation
  const [formData, setFormData] = useState({
    overallScore: '',
    technicalScore: '',
    communicationScore: '',
    relevanceScore: '',
    qaList: [],
    newQuestion: '',
    newAnswer: '',
    newCritique: '',
    newScore: '',
    strengthInput: '',
    strengths: [],
    improvementInput: '',
    improvements: [],
    topicInput: '',
    suggestedTopics: [],
    detailedNotes: ''
  });

  const fetchFeedback = async () => {
    if (!interviewId) {
      setError('Interview ID is required to view evaluation report.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch interview session details
      const interviewRes = await apiClient.get(`/api/interviews/${interviewId}`).catch(() => null);
      if (interviewRes?.data) {
        setInterview(interviewRes.data);
      }

      // Fetch existing review for this interview
      try {
        const reviewRes = await apiClient.get(`/api/reviews/interview/${interviewId}`);
        if (reviewRes?.data) {
          setCandidateReview(reviewRes.data);
        }
      } catch (rErr) {
        setCandidateReview(null);
      }

      // Fetch evaluation feedback
      try {
        const feedbackRes = await apiClient.get(`/api/feedbacks/interview/${interviewId}`);
        if (feedbackRes.data && feedbackRes.data.overallScore !== undefined) {
          setFeedback(feedbackRes.data);
          setFormData({
            overallScore: feedbackRes.data.overallScore,
            technicalScore: feedbackRes.data.technicalScore ?? feedbackRes.data.overallScore,
            communicationScore: feedbackRes.data.communicationScore ?? feedbackRes.data.overallScore,
            relevanceScore: feedbackRes.data.relevanceScore ?? feedbackRes.data.overallScore,
            qaList: feedbackRes.data.qaList || [],
            strengths: feedbackRes.data.strengths || [],
            improvements: feedbackRes.data.improvements || [],
            suggestedTopics: feedbackRes.data.suggestedTopics || [],
            detailedNotes: feedbackRes.data.detailedNotes || '',
            newQuestion: '',
            newAnswer: '',
            newCritique: '',
            newScore: '',
            strengthInput: '',
            improvementInput: '',
            topicInput: ''
          });
        }
      } catch (fbErr) {
        // 404 means not yet submitted
        if (fbErr.response?.status === 404) {
          setFeedback(null);
        } else {
          setError(fbErr.response?.data?.message || fbErr.message);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchFeedback();
  }, [interviewId, isAuthenticated, authLoading]);

  const isInterviewer = user && interview && (
    String(interview.interviewerId?._id || interview.interviewerId) === String(user._id) ||
    user.role === 'admin'
  );

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setReviewMsg(null);
    try {
      setSubmittingReview(true);
      const res = await apiClient.post('/api/reviews', {
        interviewId,
        rating: Number(reviewRating),
        comment: reviewComment.trim()
      });
      setCandidateReview(res.data?.review || res.data);
      setReviewMsg({ type: 'success', text: 'Thank you! Your rating and review have been recorded.' });
    } catch (err) {
      setReviewMsg({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to submit review' });
    } finally {
      setSubmittingReview(false);
    }
  };

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

  const handleAddTopic = () => {
    if (!formData.topicInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      suggestedTopics: [...prev.suggestedTopics, prev.topicInput.trim()],
      topicInput: ''
    }));
  };

  const handleRemoveTopic = (idx) => {
    setFormData(prev => ({
      ...prev,
      suggestedTopics: prev.suggestedTopics.filter((_, i) => i !== idx)
    }));
  };

  const handleAddQA = () => {
    if (!formData.newQuestion.trim()) {
      alert('Please enter a question.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      qaList: [
        ...prev.qaList,
        {
          question: prev.newQuestion.trim(),
          candidateAnswer: prev.newAnswer.trim() || 'Verbal explanation provided by candidate.',
          feedback: prev.newCritique.trim() || 'Evaluated for depth and correctness.',
          score: Number(prev.newScore) || Number(prev.overallScore) || 75
        }
      ],
      newQuestion: '',
      newAnswer: '',
      newCritique: '',
      newScore: ''
    }));
  };

  const handleRemoveQA = (idx) => {
    setFormData(prev => ({
      ...prev,
      qaList: prev.qaList.filter((_, i) => i !== idx)
    }));
  };

  const handleSaveEvaluation = async (e) => {
    e.preventDefault();
    if (!interviewId) return;

    if (!formData.overallScore && formData.overallScore !== 0) {
      alert('Please provide an Overall Evaluation Score (0 - 100).');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiClient.post('/api/feedbacks', {
        interviewId,
        overallScore: Number(formData.overallScore),
        technicalScore: Number(formData.technicalScore || formData.overallScore),
        communicationScore: Number(formData.communicationScore || formData.overallScore),
        relevanceScore: Number(formData.relevanceScore || formData.overallScore),
        qaList: formData.qaList,
        strengths: formData.strengths,
        improvements: formData.improvements,
        suggestedTopics: formData.suggestedTopics,
        detailedNotes: formData.detailedNotes
      });

      setFeedback(res.data);
      setShowForm(false);
      alert('Evaluation feedback saved successfully!');
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to save evaluation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!feedback) {
      alert('Cannot download PDF report before evaluation feedback is submitted.');
      return;
    }
    setDownloading(true);
    try {
      downloadInterviewReportPDF(feedback);
    } finally {
      setDownloading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="card text-center p-12 text-muted flex items-center justify-center gap-2">
        <Loader2 size={20} className="animate-spin text-primary" />
        <span>Loading interview evaluation report...</span>
      </div>
    );
  }

  const candidateName = interview?.candidateId?.name || feedback?.candidateId?.name || 'Candidate';
  const interviewerName = interview?.interviewerId?.name || feedback?.interviewerId?.name || 'Interviewer';
  const interviewerTitle = interview?.interviewerId?.title || feedback?.interviewerId?.title || 'Technical Specialist';
  const interviewerCompany = interview?.interviewerId?.company || feedback?.interviewerId?.company || 'DevSphere';
  const topicName = interview?.topic || feedback?.interviewId?.topic || 'Mock Technical Interview';

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Top Navigation */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <Link to="/interviews" className="inline-flex items-center gap-2 text-muted hover:text-primary transition-colors">
          <ArrowLeft size={18} />
          <span className="font-medium">Back to Interviews</span>
        </Link>
        <div className="flex items-center gap-2">
          {feedback && (
            <button 
              type="button" 
              className="btn btn-primary flex items-center gap-2 shadow-sm"
              onClick={handleDownloadPDF}
              disabled={downloading}
            >
              <Download size={16} />
              <span>{downloading ? 'Generating PDF...' : 'Download PDF Report'}</span>
            </button>
          )}

          {isInterviewer && (
            <button 
              type="button" 
              className="btn btn-outline flex items-center gap-2"
              onClick={() => setShowForm(!showForm)}
            >
              <Edit3 size={16} />
              {showForm ? 'Close Form' : (feedback ? 'Edit Evaluation' : '+ Submit Evaluation')}
            </button>
          )}
        </div>
      </div>

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
              <h4 className="font-bold text-base text-emerald-950">Mock Interview Session Concluded</h4>
              <p className="text-xs text-emerald-800">The video meeting has finished.</p>
            </div>
          </div>
        </div>
      )}

      {/* When feedback is NOT yet submitted */}
      {!feedback && !showForm && (
        <div className="card text-center p-12">
          <Clock size={48} className="text-amber-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Evaluation Report Pending</h3>
          <p className="text-muted max-w-md mx-auto mb-6">
            {isInterviewer ? (
              'You have not submitted an evaluation for this interview session yet. Please click below to evaluate the candidate and publish the official report.'
            ) : (
              `Your interviewer (${interviewerName}) has not yet submitted the evaluation feedback for this session. As soon as they complete their evaluation, your scorecard and full report will appear here.`
            )}
          </p>
          {isInterviewer && (
            <button 
              type="button"
              className="btn btn-primary"
              onClick={() => setShowForm(true)}
            >
              <Edit3 size={16} />
              <span>Submit Evaluation Scorecard</span>
            </button>
          )}
        </div>
      )}

      {/* Evaluator Submission Form */}
      {showForm && isInterviewer && (
        <div className="card mb-6 p-6 border-2" style={{ borderColor: 'var(--primary)' }}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-bold">
                {feedback ? 'Update Interview Evaluation' : 'Candidate Assessment & Evaluation Form'}
              </h3>
              <p className="text-xs text-muted">
                Candidate: <strong>{candidateName}</strong> • Topic: <strong>{topicName}</strong>
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveEvaluation} className="flex flex-col gap-5">
            {/* Scorecard Inputs */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Evaluation Scores (0 - 100)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div>
                  <label className="text-xs font-semibold block mb-1">Overall Rating *</label>
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    className="input-field"
                    placeholder="e.g. 85"
                    value={formData.overallScore}
                    onChange={(e) => setFormData({ ...formData, overallScore: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Technical Competence</label>
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    className="input-field"
                    placeholder="e.g. 85"
                    value={formData.technicalScore}
                    onChange={(e) => setFormData({ ...formData, technicalScore: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Communication & Clarity</label>
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    className="input-field"
                    placeholder="e.g. 80"
                    value={formData.communicationScore}
                    onChange={(e) => setFormData({ ...formData, communicationScore: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">Problem Solving & Logic</label>
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    className="input-field"
                    placeholder="e.g. 80"
                    value={formData.relevanceScore}
                    onChange={(e) => setFormData({ ...formData, relevanceScore: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Q&A List */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
                Recorded Questions & Answers ({formData.qaList.length})
              </h4>
              {formData.qaList.map((qa, idx) => (
                <div key={idx} className="p-3 mb-2 rounded-lg border bg-slate-50 flex justify-between items-start gap-3">
                  <div>
                    <div className="font-bold text-xs text-slate-800">Q{idx + 1}: {qa.question}</div>
                    <div className="text-xs text-slate-600 mt-1">Ans: {qa.candidateAnswer}</div>
                    <div className="text-xs text-emerald-700 mt-1">Feedback: {qa.feedback} ({qa.score}%)</div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveQA(idx)} 
                    className="p-1 text-rose-500 hover:text-rose-700"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}

              {/* Add Question Box */}
              <div className="p-3.5 border rounded-lg bg-white mt-2">
                <div className="text-xs font-bold mb-2">Add Session Question & Critique:</div>
                <input 
                  type="text" 
                  className="input-field mb-2 text-xs" 
                  placeholder="Question asked during interview..." 
                  value={formData.newQuestion}
                  onChange={(e) => setFormData({ ...formData, newQuestion: e.target.value })}
                />
                <textarea 
                  className="input-field mb-2 text-xs" 
                  rows="2"
                  placeholder="Candidate's answer or approach..." 
                  value={formData.newAnswer}
                  onChange={(e) => setFormData({ ...formData, newAnswer: e.target.value })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <input 
                    type="text" 
                    className="input-field text-xs" 
                    placeholder="Evaluator critique / feedback..." 
                    value={formData.newCritique}
                    onChange={(e) => setFormData({ ...formData, newCritique: e.target.value })}
                  />
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    className="input-field text-xs" 
                    placeholder="Question Score (0-100)" 
                    value={formData.newScore}
                    onChange={(e) => setFormData({ ...formData, newScore: e.target.value })}
                  />
                </div>
                <button 
                  type="button" 
                  onClick={handleAddQA}
                  className="btn btn-outline text-xs py-1 px-3"
                >
                  <Plus size={14} /> Add Question
                </button>
              </div>
            </div>

            {/* Strengths & Improvements */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold block mb-1">Key Strengths</label>
                <div className="flex gap-1.5 mb-2">
                  <input 
                    type="text"
                    className="input-field text-xs"
                    placeholder="Add observed strength..."
                    value={formData.strengthInput}
                    onChange={(e) => setFormData({ ...formData, strengthInput: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddStrength())}
                  />
                  <button type="button" onClick={handleAddStrength} className="btn btn-outline text-xs px-2.5">
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formData.strengths.map((str, idx) => (
                    <span key={idx} className="badge badge-success text-xs py-1 px-2 flex items-center gap-1">
                      <span>{str}</span>
                      <button type="button" onClick={() => handleRemoveStrength(idx)} className="cursor-pointer">&times;</button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">Areas for Improvement</label>
                <div className="flex gap-1.5 mb-2">
                  <input 
                    type="text"
                    className="input-field text-xs"
                    placeholder="Add improvement point..."
                    value={formData.improvementInput}
                    onChange={(e) => setFormData({ ...formData, improvementInput: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddImprovement())}
                  />
                  <button type="button" onClick={handleAddImprovement} className="btn btn-outline text-xs px-2.5">
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formData.improvements.map((imp, idx) => (
                    <span key={idx} className="badge badge-warning text-xs py-1 px-2 flex items-center gap-1">
                      <span>{imp}</span>
                      <button type="button" onClick={() => handleRemoveImprovement(idx)} className="cursor-pointer">&times;</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary Notes */}
            <div>
              <label className="text-xs font-bold block mb-1">Executive Summary & Recommendations</label>
              <textarea 
                className="input-field text-xs"
                rows="3"
                placeholder="Detailed qualitative feedback, interview impression, and next steps..."
                value={formData.detailedNotes}
                onChange={(e) => setFormData({ ...formData, detailedNotes: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button 
                type="button" 
                onClick={() => setShowForm(false)} 
                className="btn btn-outline text-xs py-2 px-4"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitting} 
                className="btn btn-primary text-xs py-2 px-5 font-bold flex items-center gap-2"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>Save & Publish Evaluation</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Render Real Evaluated Report */}
      {feedback && (
        <div className="flex flex-col gap-6">
          {/* Header Card */}
          <div className="card p-6 bg-slate-900 text-white rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="badge badge-success text-xs font-semibold py-0.5 px-2">EVALUATION VERIFIED ●</span>
                <span className="text-xs text-slate-400">Session Assessment</span>
              </div>
              <h2 className="text-2xl font-bold text-white">{topicName}</h2>
              <p className="text-xs text-slate-300 mt-1">
                Evaluator: <strong>{interviewerName}</strong> ({interviewerTitle} • {interviewerCompany})
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Candidate: <strong>{candidateName}</strong> • Date: {interview?.date} ({interview?.timeSlot})
              </p>
            </div>

            <div className="text-right">
              <div className="text-xs uppercase text-slate-400 font-semibold">Overall Score</div>
              <div className="text-4xl font-extrabold text-emerald-400 mt-0.5">{feedback.overallScore}%</div>
              <div className="text-xs font-bold text-slate-200 mt-1">
                {feedback.overallScore >= 85 ? 'STRONG HIRE' : feedback.overallScore >= 70 ? 'HIRE / RECOMMENDED' : 'NEEDS PRACTICE'}
              </div>
            </div>
          </div>

          {/* Scores Breakdown Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="card">
              <div className="text-xs text-muted uppercase font-semibold">Technical Depth</div>
              <div className="text-2xl font-bold mt-1 text-primary">{feedback.technicalScore ?? feedback.overallScore}%</div>
            </div>
            <div className="card">
              <div className="text-xs text-muted uppercase font-semibold">Communication</div>
              <div className="text-2xl font-bold mt-1 text-purple-600">{feedback.communicationScore ?? feedback.overallScore}%</div>
            </div>
            <div className="card">
              <div className="text-xs text-muted uppercase font-semibold">Problem Solving</div>
              <div className="text-2xl font-bold mt-1 text-amber-600">{feedback.relevanceScore ?? feedback.overallScore}%</div>
            </div>
          </div>

          {/* Strengths and Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card bg-emerald-50/50 border-emerald-200">
              <h4 className="font-bold text-sm text-emerald-900 mb-2 flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Demonstrated Strengths</span>
              </h4>
              {feedback.strengths?.length === 0 ? (
                <p className="text-xs text-muted">No specific strengths listed.</p>
              ) : (
                <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                  {feedback.strengths.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card bg-rose-50/50 border-rose-200">
              <h4 className="font-bold text-sm text-rose-900 mb-2 flex items-center gap-1.5">
                <AlertCircle size={16} className="text-rose-600" />
                <span>Areas for Development</span>
              </h4>
              {feedback.improvements?.length === 0 ? (
                <p className="text-xs text-muted">No specific improvements listed.</p>
              ) : (
                <ul className="text-xs text-slate-700 space-y-1.5 list-disc pl-4">
                  {feedback.improvements.map((imp, idx) => (
                    <li key={idx}>{imp}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Evaluator Notes */}
          {feedback.detailedNotes && (
            <div className="card">
              <h4 className="font-bold text-sm text-slate-900 mb-2">Evaluator Executive Summary</h4>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{feedback.detailedNotes}</p>
            </div>
          )}

          {/* Question by Question Q&A */}
          {feedback.qaList && feedback.qaList.length > 0 && (
            <div className="card p-0" style={{ overflow: 'hidden' }}>
              <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <MessageSquare size={16} className="text-primary" />
                  <span>Session Questions & Detailed Answers</span>
                </h4>
                <span className="text-xs text-muted">{feedback.qaList.length} Questions</span>
              </div>
              <div className="p-4 flex flex-col gap-4">
                {feedback.qaList.map((qa, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border bg-white">
                    <div className="flex justify-between items-start gap-2 mb-1.5">
                      <h5 className="font-bold text-xs text-slate-900">
                        Q{idx + 1}: {qa.question}
                      </h5>
                      {qa.score !== undefined && (
                        <span className="badge badge-info text-xs">{qa.score}%</span>
                      )}
                    </div>
                    {qa.candidateAnswer && (
                      <p className="text-xs text-slate-600 mb-1">
                        <strong className="text-slate-800">Answer: </strong>{qa.candidateAnswer}
                      </p>
                    )}
                    {qa.feedback && (
                      <p className="text-xs text-emerald-700 bg-emerald-50/60 p-2 rounded border border-emerald-100">
                        <strong className="text-emerald-900">Evaluator Feedback: </strong>{qa.feedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Candidate Review Section (F1) */}
          {user && interview && String(interview.candidateId?._id || interview.candidateId) === String(user._id) && (
            <div className="card border-amber-200 bg-amber-50/30">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <span>⭐ Rate Your Interviewer</span>
                    {candidateReview && (
                      <span className="badge badge-warning text-xs font-semibold">{candidateReview.rating} / 5 Stars</span>
                    )}
                  </h4>
                  <p className="text-xs text-muted">
                    {candidateReview 
                      ? `Your review for ${interview.interviewerId?.name || 'your interviewer'} was submitted on ${new Date(candidateReview.createdAt).toLocaleDateString()}.`
                      : `How was your session with ${interview.interviewerId?.name || 'your interviewer'}? Your rating helps maintain top-tier evaluation standards.`}
                  </p>
                </div>
              </div>

              {candidateReview ? (
                <div className="p-3 bg-white rounded-xl border border-amber-200">
                  <div className="flex items-center gap-1 text-amber-500 mb-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} className="text-base">
                        {star <= candidateReview.rating ? '★' : '☆'}
                      </span>
                    ))}
                    <span className="text-xs font-bold text-slate-800 ml-1.5">{candidateReview.rating} out of 5</span>
                  </div>
                  {candidateReview.comment && (
                    <p className="text-xs text-slate-700 italic mt-1">"{candidateReview.comment}"</p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmitReview} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-700">Star Rating:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          className="text-xl leading-none transition-transform hover:scale-125 focus:outline-none"
                          style={{
                            color: star <= reviewRating ? '#f59e0b' : '#cbd5e1',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0 2px'
                          }}
                          onClick={() => setReviewRating(star)}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-amber-700">{reviewRating} Stars</span>
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Write a brief review of your interviewer's guidance, depth, and helpfulness (optional)..."
                    className="input-field text-xs py-2 px-3 w-full"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    maxLength={1000}
                  />

                  <div className="flex justify-between items-center">
                    {reviewMsg ? (
                      <span className={`text-xs font-semibold ${reviewMsg.type === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {reviewMsg.text}
                      </span>
                    ) : <span />}
                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="btn btn-primary text-xs py-1.5 px-4 font-bold flex items-center gap-1.5"
                    >
                      {submittingReview ? <Loader2 size={13} className="animate-spin" /> : null}
                      <span>Submit Interviewer Review</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedbackReport;
