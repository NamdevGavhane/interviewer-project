const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Payment = require('../models/Payment');
const Interview = require('../models/Interview');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Counter = require('../models/Counter');
const Payout = require('../models/Payout');
const Availability = require('../models/Availability');
const { atomicBookSlot, releaseSlotForInterview } = require('../services/availabilityService');
const { authenticate, requireRole } = require('../middleware/auth');

// Helper to initialize Razorpay if configured
const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (key_id && key_secret) {
    try {
      return new Razorpay({ key_id, key_secret });
    } catch (e) {
      console.warn('Razorpay initialization warning:', e.message);
    }
  }
  return null;
};

// @route   GET /api/payment/config
// @desc    Get payment gateway config
// @access  Public
router.get('/config', (req, res) => {
  const hasRazorpayKeys = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  res.json({
    keyId: process.env.RAZORPAY_KEY_ID || '',
    isLiveConfigured: hasRazorpayKeys,
    currency: 'INR',
    gatewayName: 'InterviewPro Razorpay Gateway'
  });
});

// @route   POST /api/payment/create-order
// @desc    Create a payment order strictly computed from DB settings and interviewer rate
// @access  Protected
router.post('/create-order', authenticate, async (req, res) => {
  try {
    const candidateId = req.user._id;
    const { interviewerId } = req.body;

    if (!interviewerId) {
      return res.status(400).json({ success: false, message: 'Interviewer ID is required.' });
    }

    const interviewer = await User.findById(interviewerId).select('name email title company hourlyRate role');
    if (!interviewer || interviewer.role !== 'professional') {
      return res.status(404).json({ success: false, message: 'Professional interviewer not found.' });
    }

    const settings = await Settings.getSettings();
    const sessionFee = Number(interviewer.hourlyRate) || 0;

    // Zero-fee session: directly bookable without gateway
    if (sessionFee === 0) {
      return res.json({
        success: true,
        freeSession: true,
        orderId: `FREE_${Date.now()}`,
        amount: 0,
        sessionFee: 0,
        platformFee: 0,
        gstAmount: 0,
        currency: settings.currency || 'INR',
        candidate: { _id: req.user._id, name: req.user.name, email: req.user.email },
        interviewer
      });
    }

    const commissionPercent = Number(settings.platformCommissionPercent) || 0;
    const gstPercent = Number(settings.gstPercent) || 0;

    const platformFee = Math.round((sessionFee * commissionPercent) / 100);
    const gstAmount = Math.round(((sessionFee + platformFee) * gstPercent) / 100);
    const totalAmount = sessionFee + platformFee + gstAmount;

    const rzp = getRazorpayInstance();
    if (!rzp) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is currently not configured by administrator. RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET are required.'
      });
    }

    const order = await rzp.orders.create({
      amount: Math.round(totalAmount * 100), // in paise
      currency: settings.currency || 'INR',
      receipt: `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      notes: {
        candidateId: String(candidateId),
        interviewerId: String(interviewerId)
      }
    });

    res.json({
      success: true,
      freeSession: false,
      orderId: order.id,
      amount: totalAmount,
      sessionFee,
      platformFee,
      gstAmount,
      currency: settings.currency || 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      candidate: { _id: req.user._id, name: req.user.name, email: req.user.email },
      interviewer
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/payment/verify-and-book
// @desc    Verify payment signature / details and finalize mock interview booking
// @access  Protected
router.post('/verify-and-book', authenticate, async (req, res) => {
  try {
    const candidateId = req.user._id;
    const {
      interviewerId,
      date,
      timeSlot,
      slotId,
      topic,
      notes,
      orderId,
      paymentId,
      signature,
      paymentMethod = 'razorpay'
    } = req.body;

    if (!interviewerId || !date || !timeSlot) {
      return res.status(400).json({ success: false, message: 'Missing required booking details (interviewer, date, timeSlot).' });
    }

    const interviewer = await User.findById(interviewerId).select('name email title company hourlyRate role');
    if (!interviewer || interviewer.role !== 'professional') {
      return res.status(404).json({ success: false, message: 'Interviewer not found.' });
    }

    const settings = await Settings.getSettings();
    const sessionFee = Number(interviewer.hourlyRate) || 0;
    const isFree = sessionFee === 0;

    let finalPaymentId = paymentId;
    let finalOrderId = orderId;
    let platformFee = 0;
    let gstAmount = 0;
    let totalAmount = 0;

    if (isFree) {
      finalPaymentId = `FREE_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      finalOrderId = `FREE_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    } else {
      const commissionPercent = Number(settings.platformCommissionPercent) || 0;
      const gstPercent = Number(settings.gstPercent) || 0;
      platformFee = Math.round((sessionFee * commissionPercent) / 100);
      gstAmount = Math.round(((sessionFee + platformFee) * gstPercent) / 100);
      totalAmount = sessionFee + platformFee + gstAmount;

      // Real signature verification
      const secret = process.env.RAZORPAY_KEY_SECRET;
      if (!secret || !process.env.RAZORPAY_KEY_ID) {
        return res.status(503).json({
          success: false,
          message: 'Payment gateway is not configured. Live transactions cannot be verified.'
        });
      }

      if (!orderId || !paymentId || !signature) {
        return res.status(400).json({
          success: false,
          message: 'Missing Razorpay signature verification parameters (orderId, paymentId, signature).'
        });
      }

      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      if (generatedSignature !== signature) {
        return res.status(400).json({
          success: false,
          message: 'Payment signature verification failed. Invalid or fraudulent transaction.'
        });
      }
    }

    // Atomic sequential invoice number
    const invoiceNumber = await Counter.getNextInvoiceNumber();

    // Verify availability slot if slotId provided
    let slotDoc = null;
    if (slotId) {
      slotDoc = await Availability.findById(slotId);
      if (slotDoc && slotDoc.isBooked) {
        return res.status(409).json({
          success: false,
          message: 'The selected time slot was just booked by another candidate. Please choose a different slot.'
        });
      }
    }

    // 1. Create Interview record
    const meetingRoomId = crypto.randomBytes(8).toString('hex');
    const newInterview = new Interview({
      candidateId,
      interviewerId,
      date,
      timeSlot,
      slotId: slotId || null,
      startTime: slotDoc?.startTime || null,
      endTime: slotDoc?.endTime || null,
      topic: topic || 'Mock Technical Interview',
      price: sessionFee,
      platformFee,
      paidAmount: totalAmount,
      notes: notes || '',
      status: 'scheduled',
      paymentStatus: 'paid',
      paymentId: finalPaymentId,
      orderId: finalOrderId,
      paymentMethod: isFree ? 'free' : paymentMethod,
      invoiceNumber,
      meetingRoomId
    });

    const savedInterview = await newInterview.save();

    // 2. Atomically book the slot in Availability collection
    if (slotId) {
      await atomicBookSlot({
        interviewerId,
        slotId,
        interviewId: savedInterview._id
      });
    }

    // 3. Create Payment record in MongoDB
    const newPayment = new Payment({
      candidateId,
      interviewerId,
      interviewId: savedInterview._id,
      orderId: finalOrderId,
      paymentId: finalPaymentId,
      signature: signature || '',
      amount: totalAmount,
      sessionFee,
      platformFee,
      gstAmount,
      currency: settings.currency || 'INR',
      status: 'captured',
      paymentMethod: isFree ? 'free' : paymentMethod,
      invoiceNumber,
      notes: notes || `Mock interview session: ${topic}`
    });

    const savedPayment = await newPayment.save();

    const populatedInterview = await Interview.findById(savedInterview._id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company hourlyRate');

    const populatedPayment = await Payment.findById(savedPayment._id)
      .populate('candidateId', 'name email')
      .populate('interviewerId', 'name email title company');

    res.status(201).json({
      success: true,
      message: 'Payment verified and interview scheduled successfully!',
      interview: populatedInterview,
      payment: populatedPayment
    });
  } catch (err) {
    console.error('Error verifying and booking:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/payment/webhook
// @desc    Razorpay Webhook receiver with HMAC SHA256 signature verification
// @access  Public (Gateway webhook)
router.post('/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('RAZORPAY_WEBHOOK_SECRET is not configured. Webhook rejected.');
      return res.status(400).json({ message: 'Webhook secret unconfigured.' });
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ message: 'Missing webhook signature.' });
    }

    // rawBody was preserved by express.raw parser in server.js
    const bodyPayload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyPayload)
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({ message: 'Invalid webhook signature.' });
    }

    const event = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(bodyPayload);
    const eventName = event.event;

    if (eventName === 'payment.captured') {
      const paymentEntity = event.payload.payment.entity;
      await Payment.findOneAndUpdate(
        { orderId: paymentEntity.order_id },
        { $set: { status: 'captured', paymentId: paymentEntity.id } }
      );
    } else if (eventName === 'payment.failed') {
      const paymentEntity = event.payload.payment.entity;
      await Payment.findOneAndUpdate(
        { orderId: paymentEntity.order_id },
        { $set: { status: 'failed' } }
      );
    } else if (eventName === 'refund.processed') {
      const refundEntity = event.payload.refund.entity;
      await Payment.findOneAndUpdate(
        { paymentId: refundEntity.payment_id },
        {
          $set: {
            refundStatus: 'processed',
            refundId: refundEntity.id,
            refundAmount: refundEntity.amount / 100,
            refundedAt: new Date()
          }
        }
      );
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/payment/refund/:interviewId
// @desc    Process refund through Razorpay API for cancelled interview
// @access  Protected
router.post('/refund/:interviewId', authenticate, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.interviewId);
    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found' });
    }

    const isCandidate = String(interview.candidateId) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isCandidate && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const payment = await Payment.findOne({ interviewId: interview._id });
    if (!payment || payment.status !== 'captured') {
      return res.status(400).json({ success: false, message: 'No captured payment found for this interview' });
    }

    if (payment.refundStatus === 'processed') {
      return res.status(400).json({ success: false, message: 'Payment has already been refunded' });
    }

    if (payment.paymentMethod === 'free' || payment.amount === 0) {
      payment.refundStatus = 'processed';
      payment.refundAmount = 0;
      payment.refundedAt = new Date();
      await payment.save();

      interview.status = 'cancelled';
      interview.refundAmount = 0;
      await interview.save();
      await releaseSlotForInterview(interview._id);

      return res.json({ success: true, message: 'Free session booking cancelled and slot released.' });
    }

    const rzp = getRazorpayInstance();
    if (!rzp) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway unconfigured. Cannot process refund.'
      });
    }

    const refund = await rzp.payments.refund(payment.paymentId, {
      amount: Math.round(payment.amount * 100),
      notes: {
        interviewId: String(interview._id),
        cancelledBy: String(req.user._id)
      }
    });

    payment.refundStatus = 'processed';
    payment.refundId = refund.id;
    payment.refundAmount = payment.amount;
    payment.refundedAt = new Date();
    await payment.save();

    interview.status = 'cancelled';
    interview.refundAmount = payment.amount;
    interview.cancelledAt = new Date();
    await interview.save();

    await releaseSlotForInterview(interview._id);

    res.json({
      success: true,
      message: `Full refund of ₹${payment.amount} processed successfully.`,
      refundId: refund.id
    });
  } catch (err) {
    console.error('Error processing refund:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/payment/history
// @desc    Get payment and transaction records
// @access  Protected
router.get('/history', authenticate, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'candidate') {
      filter = { candidateId: req.user._id };
    } else if (req.user.role === 'professional') {
      filter = { interviewerId: req.user._id };
    } else if (req.user.role === 'admin') {
      const { userId, role } = req.query;
      if (userId) {
        filter = role === 'professional' ? { interviewerId: userId } : { candidateId: userId };
      }
    }

    const payments = await Payment.find(filter)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId', 'date timeSlot topic meetingRoomId status')
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/payment/payouts
// @desc    Get payout ledger for professional
// @access  Protected (Professional, Admin)
router.get('/payouts', authenticate, requireRole('professional', 'admin'), async (req, res) => {
  try {
    const interviewerId = req.user.role === 'admin' && req.query.interviewerId ? req.query.interviewerId : req.user._id;

    const [payouts, completedSessions] = await Promise.all([
      Payout.find({ interviewerId }).sort({ createdAt: -1 }),
      Interview.find({ interviewerId, status: 'completed' }).select('price paidAmount')
    ]);

    const totalEarned = completedSessions.reduce((sum, s) => sum + (s.price || 0), 0);
    const paidOut = payouts.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
    const pendingPayout = payouts.filter(p => p.status === 'pending' || p.status === 'processing').reduce((sum, p) => sum + p.amount, 0);
    const availableBalance = Math.max(0, totalEarned - paidOut - pendingPayout);

    res.json({
      success: true,
      stats: {
        totalEarned,
        paidOut,
        pendingPayout,
        availableBalance
      },
      payouts
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/payment/payouts/request
// @desc    Request a payout
// @access  Protected (Professional)
router.post('/payouts/request', authenticate, requireRole('professional'), async (req, res) => {
  try {
    const interviewerId = req.user._id;
    const { amount, payoutMethod = 'bank_transfer', bankDetails } = req.body;

    const requestedAmount = Number(amount);
    if (!requestedAmount || requestedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid payout amount is required' });
    }

    const [payouts, completedSessions] = await Promise.all([
      Payout.find({ interviewerId }),
      Interview.find({ interviewerId, status: 'completed' }).select('price')
    ]);

    const totalEarned = completedSessions.reduce((sum, s) => sum + (s.price || 0), 0);
    const withdrawnOrPending = payouts.filter(p => p.status !== 'failed').reduce((sum, p) => sum + p.amount, 0);
    const availableBalance = Math.max(0, totalEarned - withdrawnOrPending);

    if (requestedAmount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Requested amount (₹${requestedAmount}) exceeds available balance (₹${availableBalance}).`
      });
    }

    const payout = new Payout({
      interviewerId,
      amount: requestedAmount,
      payoutMethod,
      bankDetails: bankDetails || {},
      status: 'pending'
    });

    await payout.save();

    res.status(201).json({
      success: true,
      message: 'Payout request submitted successfully.',
      payout
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/payment/:id
// @desc    Get a single payment receipt by ID
// @access  Protected
router.get('/:id', authenticate, async (req, res) => {
  try {
    let payment = await Payment.findById(req.params.id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId');

    if (!payment) {
      payment = await Payment.findOne({
        $or: [
          { interviewId: req.params.id },
          { paymentId: req.params.id },
          { invoiceNumber: req.params.id }
        ]
      })
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId');
    }

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    // Authorization: only candidate, interviewer, or admin
    const isOwner = String(payment.candidateId._id) === String(req.user._id) ||
                    String(payment.interviewerId._id) === String(req.user._id) ||
                    req.user.role === 'admin';
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json(payment);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
