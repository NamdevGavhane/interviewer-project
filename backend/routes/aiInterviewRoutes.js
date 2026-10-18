const express = require('express');
const router = express.Router();
const multer = require('multer');
const { PDFParse } = require('pdf-parse');
const crypto = require('crypto');
const Interview = require('../models/Interview');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const Settings = require('../models/Settings');
const InterviewConfig = require('../models/InterviewConfig');
const AIInterviewSession = require('../models/AIInterviewSession');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

// Helper to call External AI (Google Gemini or OpenAI)
const callExternalAI = async (prompt, systemInstruction = '', jsonMode = false) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) {
    throw new Error('AI Service Unconfigured: Neither GEMINI_API_KEY nor OPENAI_API_KEY is defined in environment.');
  }

  // 1. Try Google Gemini API
  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\n${prompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 1500,
          responseMimeType: jsonMode ? 'application/json' : 'text/plain'
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } else {
        const errText = await res.text();
        console.warn('Gemini API call returned error status:', res.status, errText);
      }
    } catch (err) {
      console.warn('Gemini API call failed:', err.message);
    }
  }

  // 2. Try OpenAI API
  if (openaiKey) {
    try {
      const bodyPayload = {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6
      };
      if (jsonMode) {
        bodyPayload.response_format = { type: 'json_object' };
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify(bodyPayload)
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) return text;
      } else {
        const errText = await res.text();
        console.warn('OpenAI API call returned error status:', res.status, errText);
      }
    } catch (err) {
      console.warn('OpenAI API call failed:', err.message);
    }
  }

  throw new Error('AI providers failed to generate response. Please verify your GEMINI_API_KEY or OPENAI_API_KEY.');
};

// @route   GET /api/ai/options
// @desc    Get dynamic list of topics, levels, and target companies
// @access  Protected
router.get('/options', async (req, res) => {
  try {
    const config = await InterviewConfig.getConfig();
    const settings = await Settings.getSettings();

    // Check sessions today for this user
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sessionsToday = await AIInterviewSession.countDocuments({
      candidateId: req.user._id,
      createdAt: { $gte: startOfDay }
    });

    const isAIConfigured = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

    res.json({
      success: true,
      topics: config.topics,
      difficulties: config.difficulties,
      companies: config.companies,
      dailyLimit: settings.aiDailyLimit || 5,
      sessionsUsedToday: sessionsToday,
      remainingSessions: Math.max(0, (settings.aiDailyLimit || 5) - sessionsToday),
      isAIConfigured
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/ai/active-session
// @desc    Get candidate's in-progress AI interview session to allow seamless resumption
// @access  Protected
router.get('/active-session', async (req, res) => {
  try {
    const session = await AIInterviewSession.findOne({
      candidateId: req.user._id,
      status: 'in_progress'
    }).sort({ updatedAt: -1 });

    res.json({
      success: true,
      hasActiveSession: Boolean(session),
      session
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/ai/parse-resume
// @desc    Extract clean human-readable text from uploaded PDF or text file
// @access  Protected
router.post('/parse-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No resume file uploaded.' });
    }

    const { originalname, mimetype, buffer } = req.file;
    let extractedText = '';

    const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      try {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        extractedText = result.text || '';
        extractedText = extractedText.replace(/-- \d+ of \d+ --/g, '');
        extractedText = extractedText.replace(/\0/g, '').replace(/\r\n/g, '\n').trim();
      } catch (pdfErr) {
        console.error('PDF parsing error:', pdfErr);
        return res.status(422).json({
          success: false,
          message: 'Could not extract text from this PDF. Please ensure it is text-searchable (not scanned images) or paste text directly.'
        });
      }
    } else {
      extractedText = buffer.toString('utf-8').replace(/\0/g, '').trim();
    }

    extractedText = extractedText.replace(/\n{3,}/g, '\n\n').trim();

    if (!extractedText || extractedText.length < 20) {
      return res.status(422).json({
        success: false,
        message: 'The uploaded file appears to be empty or has no readable text. Please paste your resume text directly.'
      });
    }

    const wordCount = extractedText.split(/\s+/).filter(Boolean).length;

    res.json({
      success: true,
      filename: originalname,
      characters: extractedText.length,
      wordCount,
      text: extractedText
    });
  } catch (err) {
    console.error('Resume upload error:', err);
    res.status(500).json({ success: false, message: 'Failed to process resume: ' + err.message });
  }
});

// @route   POST /api/ai/start
// @desc    Start an AI mock interview session with real LLM generation & session limits
// @access  Protected
router.post('/start', async (req, res) => {
  try {
    const candidateId = req.user._id;
    const { topic = 'Frontend', difficulty = 'Mid-Level', company = 'Google', resumeText = '' } = req.body;

    // 1. Enforce per-user daily AI session limits from Settings
    const settings = await Settings.getSettings();
    const dailyLimit = settings.aiDailyLimit || 5;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sessionsToday = await AIInterviewSession.countDocuments({
      candidateId,
      createdAt: { $gte: startOfDay }
    });

    if (sessionsToday >= dailyLimit) {
      return res.status(429).json({
        success: false,
        message: `Daily AI interview limit reached (${dailyLimit} sessions per day). Please try again tomorrow or contact support.`
      });
    }

    // 2. Enforce real LLM API key presence (No fake questions or fabricated simulation)
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'AI Interview service is unavailable: Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured in backend environment. Real LLM connection is required.'
      });
    }

    // 3. Prompt real LLM for the initial question
    const systemInstruction = `You are Alex, a Staff Software Engineer and hiring bar raiser at ${company}. You are conducting a rigorous, professional 1-on-1 mock technical interview for a ${difficulty} role focusing on ${topic}. Output valid JSON with keys: "greeting" (string), "question" (string), "keyConceptsExpected" (array of strings).`;

    let userPrompt = `Introduce yourself briefly as Alex from ${company}. Ask the first technical question on ${topic} calibrated for ${difficulty} level.`;
    if (resumeText && resumeText.trim().length > 50) {
      userPrompt += `\nCandidate Resume excerpt:\n"${resumeText.substring(0, 1500)}"\nAnchor the first question into one of the actual technical projects, technologies, or architectures listed on the candidate's resume.`;
    }

    const rawResponse = await callExternalAI(userPrompt, systemInstruction, true);
    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (e) {
      const match = rawResponse.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Could not parse structured JSON from LLM: ' + rawResponse);
    }

    const firstQuestion = `${parsed.greeting ? parsed.greeting + '\n\n' : ''}${parsed.question}`;

    // 4. Create and persist AIInterviewSession in MongoDB
    const session = new AIInterviewSession({
      candidateId,
      topic,
      difficulty,
      company,
      resumeText: resumeText || '',
      status: 'in_progress',
      totalQuestions: 4,
      currentQuestionIndex: 0,
      turns: [
        {
          turnNumber: 1,
          question: firstQuestion
        }
      ]
    });

    await session.save();

    res.json({
      success: true,
      sessionId: session._id,
      interviewerName: `Alex (AI Staff Engineer @ ${company})`,
      topic,
      difficulty,
      company,
      totalQuestions: session.totalQuestions,
      currentQuestionIndex: 0,
      question: firstQuestion
    });
  } catch (err) {
    console.error('Error starting AI interview:', err);
    res.status(err.message.includes('GEMINI') || err.message.includes('API') ? 503 : 500).json({
      success: false,
      message: err.message
    });
  }
});

// @route   POST /api/ai/chat
// @desc    Candidate submits answer; AI evaluates answer and asks next question
// @access  Protected
router.post('/chat', async (req, res) => {
  try {
    const { sessionId, userAnswer } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required.' });
    }

    if (!userAnswer || !userAnswer.trim()) {
      return res.status(400).json({ success: false, message: 'Candidate answer cannot be empty.' });
    }

    const session = await AIInterviewSession.findOne({
      _id: sessionId,
      candidateId: req.user._id,
      status: 'in_progress'
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Active in-progress interview session not found.' });
    }

    const currentTurn = session.turns[session.turns.length - 1];
    const nextIndex = session.currentQuestionIndex + 1;
    const isCompleted = nextIndex >= session.totalQuestions;

    // Real LLM evaluation of answer and next question generation
    const systemInstruction = `You are Alex, Staff Software Engineer at ${session.company}. Evaluate the candidate's answer for technical accuracy, depth, architectural trade-offs, and communication clarity. Output strictly valid JSON with keys: "score" (integer 0-100 reflecting real technical competence), "feedback" (string: 2-3 sentences of constructive critique), "nextQuestion" (string: the next probing question, or if isCompleted is true, a closing sentence), "isCompleted" (boolean: ${isCompleted}).`;

    const userPrompt = `Context: ${session.topic} (${session.difficulty})\nQuestion Asked:\n"${currentTurn.question}"\n\nCandidate's Response:\n"${userAnswer}"\n\nTask: Grade the answer objectively (0-100), give precise constructive feedback, and ${isCompleted ? 'provide a congratulatory closing wrap-up' : 'ask the next deep technical question'}.`;

    const rawResponse = await callExternalAI(userPrompt, systemInstruction, true);
    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (e) {
      const match = rawResponse.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Could not parse LLM evaluation response.');
    }

    // Update current turn
    currentTurn.candidateAnswer = userAnswer.trim();
    currentTurn.feedback = parsed.feedback;
    currentTurn.score = Number(parsed.score) || 75;

    session.currentQuestionIndex = nextIndex;

    if (isCompleted) {
      session.status = 'completed';
    } else {
      session.turns.push({
        turnNumber: nextIndex + 1,
        question: parsed.nextQuestion
      });
    }

    await session.save();

    res.json({
      success: true,
      feedback: parsed.feedback,
      score: parsed.score,
      nextQuestion: parsed.nextQuestion,
      nextIndex,
      isCompleted
    });
  } catch (err) {
    console.error('Error processing AI chat turn:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/ai/evaluate
// @desc    Generate full AI evaluation scorecard from transcript and persist to Interview & Feedback
// @access  Protected
router.post('/evaluate', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required.' });
    }

    const session = await AIInterviewSession.findOne({
      _id: sessionId,
      candidateId: req.user._id
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    const evaluatedTurns = session.turns.filter(t => t.candidateAnswer);
    if (evaluatedTurns.length === 0) {
      return res.status(400).json({ success: false, message: 'No completed Q&A turns found in this session.' });
    }

    // Call LLM for comprehensive bar-raiser scorecard
    const systemInstruction = `You are a Principal Engineering Bar Raiser evaluating a candidate's mock interview at ${session.company}.
Output valid JSON with keys:
"overallScore" (integer 0-100),
"technicalScore" (integer 0-100),
"communicationScore" (integer 0-100),
"relevanceScore" (integer 0-100),
"strengths" (array of 3 specific bullet points citing what candidate did well),
"improvements" (array of 3 concrete actionable recommendations),
"suggestedTopics" (array of 3 technical topics to study),
"detailedNotes" (string: 3-4 sentence executive summary).`;

    const userPrompt = `Interview Topic: ${session.topic} (${session.difficulty})\nCandidate Q&A Transcript:\n${JSON.stringify(evaluatedTurns, null, 2)}`;

    const rawResponse = await callExternalAI(userPrompt, systemInstruction, true);
    let evaluation;
    try {
      evaluation = JSON.parse(rawResponse);
    } catch (e) {
      const match = rawResponse.match(/\{[\s\S]*\}/);
      if (match) evaluation = JSON.parse(match[0]);
      else throw new Error('Failed to parse final evaluation scorecard.');
    }

    // Find or create AI System User
    let aiUser = await User.findOne({ email: 'ai.interviewer@interviewpro.ai' });
    if (!aiUser) {
      aiUser = new User({
        name: `Alex (AI Staff Engineer)`,
        email: 'ai.interviewer@interviewpro.ai',
        password: crypto.randomBytes(16).toString('hex'),
        role: 'professional',
        title: `AI Technical Interviewer`,
        company: session.company,
        hourlyRate: 0,
        bio: 'Autonomous AI Technical Interviewer powered by large language models.',
        rating: 5.0,
        reviewsCount: 1
      });
      await aiUser.save();
    }

    // Persist into permanent Interview and Feedback collections
    const meetingRoomId = crypto.randomBytes(8).toString('hex');
    const interview = new Interview({
      candidateId: req.user._id,
      interviewerId: aiUser._id,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      timeSlot: 'AI Mock Session',
      topic: `AI Interview: ${session.topic} (${session.company})`,
      price: 0,
      status: 'completed',
      paymentStatus: 'paid',
      meetingRoomId,
      paidAmount: 0
    });
    const savedInterview = await interview.save();

    const formattedQAList = evaluatedTurns.map((turn, idx) => ({
      question: turn.question,
      candidateAnswer: turn.candidateAnswer,
      feedback: turn.feedback || 'Evaluated by AI bar raiser.',
      score: turn.score || evaluation.overallScore
    }));

    const feedback = new Feedback({
      interviewId: savedInterview._id,
      candidateId: req.user._id,
      interviewerId: aiUser._id,
      overallScore: Number(evaluation.overallScore) || 75,
      technicalScore: Number(evaluation.technicalScore) || Number(evaluation.overallScore) || 75,
      communicationScore: Number(evaluation.communicationScore) || Number(evaluation.overallScore) || 75,
      relevanceScore: Number(evaluation.relevanceScore) || Number(evaluation.overallScore) || 75,
      qaList: formattedQAList,
      strengths: evaluation.strengths || [],
      improvements: evaluation.improvements || [],
      suggestedTopics: evaluation.suggestedTopics || [],
      detailedNotes: evaluation.detailedNotes || ''
    });
    const savedFeedback = await feedback.save();

    session.interviewId = savedInterview._id;
    session.feedbackId = savedFeedback._id;
    session.status = 'completed';
    await session.save();

    res.json({
      success: true,
      evaluation,
      interviewId: savedInterview._id,
      feedbackId: savedFeedback._id
    });
  } catch (err) {
    console.error('Error generating AI evaluation:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
