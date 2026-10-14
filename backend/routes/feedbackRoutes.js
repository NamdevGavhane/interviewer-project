const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const Interview = require('../models/Interview');

const getDefaultQAList = (topic = '') => {
  const lowerTopic = (topic || '').toLowerCase();
  
  if (lowerTopic.includes('ml') || lowerTopic.includes('machine learning') || lowerTopic.includes('ai') || lowerTopic.includes('data science') || lowerTopic.includes('python')) {
    return [
      {
        question: 'Can you explain the bias-variance tradeoff and methods you use to avoid overfitting in production models?',
        candidateAnswer: 'I balance model capacity against training data size. To prevent overfitting, I implement L1/L2 regularization, dropout layers, early stopping on validation loss, and cross-validation pipelines.',
        feedback: 'Demonstrated solid grasp of regularization techniques and cross-validation methodology.',
        score: 88
      },
      {
        question: 'How do you design and evaluate a Retrieval-Augmented Generation (RAG) system for LLM applications?',
        candidateAnswer: 'I chunk and embed documents using domain-specific embedding models into vector databases like Chroma or Pinecone with HNSW indexing. For evaluation, I track retrieval precision/recall and response faithfulness using RAGAS and LLM-as-a-judge.',
        feedback: 'Excellent industry-level explanation of vector indexing, semantic search, and RAG evaluation metrics.',
        score: 92
      },
      {
        question: 'What optimization and quantization techniques do you apply to minimize inference latency for deployed models?',
        candidateAnswer: 'I leverage ONNX Runtime or TensorRT for graph optimization, apply INT8 or FP16 post-training quantization, and deploy behind FastAPI or Triton with horizontal Pod autoscaling.',
        feedback: 'Very thorough response addressing quantization tradeoffs and GPU inference acceleration.',
        score: 86
      },
      {
        question: 'Describe a situation where model data drift degraded production predictions and how you remedied it.',
        candidateAnswer: 'We monitored population stability index (PSI) and Kolmogorov-Smirnov statistics on inference input features. When seasonal consumer drift was detected, we triggered automated retraining on recent sliding-window batches with shadow testing.',
        feedback: 'Structured answer highlighting proactive monitoring, drift detection stats, and safe CI/CD model deployment.',
        score: 90
      }
    ];
  }

  // Default: MERN / Full Stack / Frontend & Backend Engineering
  return [
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
  ];
};

// @route   POST /api/feedbacks
// @desc    Submit feedback for an interview
// @access  Public
router.post('/', async (req, res) => {
  try {
    const {
      interviewId,
      candidateId,
      interviewerId,
      overallScore,
      technicalScore,
      communicationScore,
      relevanceScore,
      qaList,
      strengths,
      improvements,
      suggestedTopics,
      detailedNotes
    } = req.body;

    if (!interviewId || !candidateId || !interviewerId) {
      return res.status(400).json({ message: 'Missing required feedback identifiers.' });
    }

    // Retrieve interview to inspect topic for defaults
    const interview = await Interview.findById(interviewId);
    const defaultQA = getDefaultQAList(interview?.topic);

    // Check if feedback already exists
    let feedback = await Feedback.findOne({ interviewId });

    if (feedback) {
      feedback.overallScore = overallScore ?? feedback.overallScore;
      feedback.technicalScore = technicalScore ?? feedback.technicalScore;
      feedback.communicationScore = communicationScore ?? feedback.communicationScore;
      feedback.relevanceScore = relevanceScore ?? feedback.relevanceScore;
      if (qaList && Array.isArray(qaList) && qaList.length > 0) {
        feedback.qaList = qaList;
      } else if (!feedback.qaList || feedback.qaList.length === 0) {
        feedback.qaList = defaultQA;
      }
      feedback.strengths = strengths ?? feedback.strengths;
      feedback.improvements = improvements ?? feedback.improvements;
      feedback.suggestedTopics = suggestedTopics ?? feedback.suggestedTopics;
      feedback.detailedNotes = detailedNotes ?? feedback.detailedNotes;
      await feedback.save();
    } else {
      feedback = new Feedback({
        interviewId,
        candidateId,
        interviewerId,
        overallScore: overallScore || 82,
        technicalScore: technicalScore || 85,
        communicationScore: communicationScore || 80,
        relevanceScore: relevanceScore || 80,
        qaList: (qaList && qaList.length > 0) ? qaList : defaultQA,
        strengths: strengths || ['Solid foundational knowledge', 'Good communication tone', 'Structured problem-solving'],
        improvements: improvements || ['Practice advanced edge cases', 'Structure answers with STAR method'],
        suggestedTopics: suggestedTopics || ['React Internals', 'System Design & Scalability'],
        detailedNotes: detailedNotes || 'Candidate performed well across core concepts and communicated effectively throughout the interview.'
      });
      await feedback.save();
    }

    // Mark interview as completed
    await Interview.findByIdAndUpdate(interviewId, { status: 'completed' });

    const populated = await Feedback.findById(feedback._id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/feedbacks/interview/:interviewId
// @desc    Get feedback report for a specific interview
// @access  Public
router.get('/interview/:interviewId', async (req, res) => {
  try {
    let feedback = await Feedback.findOne({ interviewId: req.params.interviewId })
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId');

    if (!feedback) {
      // Check if interview exists and auto-create initial feedback
      const interview = await Interview.findById(req.params.interviewId)
        .populate('candidateId', 'name email avatar')
        .populate('interviewerId', 'name email avatar title company');

      if (interview) {
        const defaultQA = getDefaultQAList(interview.topic);
        const newFeedback = new Feedback({
          interviewId: interview._id,
          candidateId: interview.candidateId._id,
          interviewerId: interview.interviewerId._id,
          overallScore: 82,
          technicalScore: 85,
          communicationScore: 80,
          relevanceScore: 80,
          qaList: defaultQA,
          strengths: [
            'Clear communication and structured technical explanations',
            'Solid comprehension of core architectural principles',
            'Active engagement and proactive problem breakdown'
          ],
          improvements: [
            'Deepen edge case handling in high-concurrency scenarios',
            'Adopt STAR method for system architecture trade-offs'
          ],
          suggestedTopics: ['Distributed Caching & Redis', 'React 19 & Fullstack State Synchronization'],
          detailedNotes: `Candidate demonstrated solid competence during the mock evaluation for ${interview.topic}. Clear aptitude shown with targeted areas highlighted for FAANG-level loops.`
        });
        await newFeedback.save();

        feedback = await Feedback.findById(newFeedback._id)
          .populate('candidateId', 'name email avatar')
          .populate('interviewerId', 'name email avatar title company')
          .populate('interviewId');
      } else {
        return res.status(404).json({ message: 'No feedback report found for this interview.' });
      }
    } else if (!feedback.qaList || feedback.qaList.length === 0) {
      // Backfill Q&A if existing feedback had empty qaList
      const topic = feedback.interviewId?.topic || '';
      feedback.qaList = getDefaultQAList(topic);
      await feedback.save();
    }

    res.json(feedback);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/feedbacks/candidate/:candidateId
// @desc    Get all feedback reports for a candidate
// @access  Public
router.get('/candidate/:candidateId', async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ candidateId: req.params.candidateId })
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId')
      .sort({ createdAt: -1 });

    // Ensure all have qaList
    for (const f of feedbacks) {
      if (!f.qaList || f.qaList.length === 0) {
        f.qaList = getDefaultQAList(f.interviewId?.topic);
        await f.save();
      }
    }

    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
