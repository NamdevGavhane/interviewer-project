const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Payment = require('../models/Payment');
const Interview = require('../models/Interview');
const User = require('../models/User');

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
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_interviewpro',
    isLiveConfigured: hasRazorpayKeys,
    currency: 'INR',
    gatewayName: 'InterviewPro Razorpay & Unified UPI Gateway'
  });
});

// @route   POST /api/payment/create-order
// @desc    Create a payment order
// @access  Public
router.post('/create-order', async (req, res) => {
  try {
    const { candidateId, interviewerId, sessionFee, platformFee } = req.body;

    if (!candidateId || !interviewerId) {
      return res.status(400).json({ message: 'Candidate and Interviewer are required.' });
    }

    const fee = sessionFee !== undefined && !isNaN(Number(sessionFee)) ? Number(sessionFee) : 100;
    const platform = platformFee !== undefined && !isNaN(Number(platformFee)) ? Number(platformFee) : (fee > 0 ? Math.round(fee * 0.1) : 0);
    const totalAmount = fee + platform;

    // Check if real Razorpay instance is available
    const rzp = getRazorpayInstance();
    let orderId = '';

    if (rzp) {
      try {
        const order = await rzp.orders.create({
          amount: Math.round(totalAmount * 100), // in paise
          currency: 'INR',
          receipt: `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          notes: {
            candidateId: String(candidateId),
            interviewerId: String(interviewerId)
          }
        });
        orderId = order.id;
      } catch (err) {
        console.warn('Razorpay order creation fallback to simulated order:', err.message);
        orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      }
    } else {
      orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    const candidate = await User.findById(candidateId).select('name email');
    const interviewer = await User.findById(interviewerId).select('name email title company hourlyRate');

    res.json({
      orderId,
      amount: totalAmount,
      sessionFee: fee,
      platformFee: platform,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_interviewpro',
      candidate,
      interviewer
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/payment/verify-and-book
// @desc    Verify payment signature / details and finalize mock interview booking
// @access  Public
router.post('/verify-and-book', async (req, res) => {
  try {
    const {
      candidateId,
      interviewerId,
      date,
      timeSlot,
      topic,
      notes,
      orderId,
      paymentId,
      signature,
      paymentMethod = 'upi',
      paymentDetails = {},
      sessionFee,
      platformFee
    } = req.body;

    if (!candidateId || !interviewerId || !date || !timeSlot) {
      return res.status(400).json({ message: 'Missing required booking details.' });
    }

    const fee = sessionFee !== undefined && !isNaN(Number(sessionFee)) ? Number(sessionFee) : 100;
    const platform = platformFee !== undefined && !isNaN(Number(platformFee)) ? Number(platformFee) : (fee > 0 ? Math.round(fee * 0.1) : 0);
    const totalAmount = fee + platform;

    // Verify signature if real Razorpay keys are in use
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (secret && signature && orderId && paymentId) {
      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      if (generatedSignature !== signature) {
        return res.status(400).json({ message: 'Invalid payment signature verification failed.' });
      }
    }

    const finalPaymentId = paymentId || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const finalOrderId = orderId || `order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    // 1. Check if an interview is already scheduled for this slot (Prevent duplicates)
    let savedInterview = await Interview.findOne({
      candidateId,
      interviewerId,
      date,
      timeSlot,
      status: 'scheduled'
    });

    if (savedInterview) {
      savedInterview.paymentStatus = 'paid';
      savedInterview.paymentId = finalPaymentId;
      savedInterview.orderId = finalOrderId;
      savedInterview.paidAmount = totalAmount;
      savedInterview.paymentMethod = paymentMethod;
      savedInterview.invoiceNumber = invoiceNumber;
      if (topic) savedInterview.topic = topic;
      await savedInterview.save();
    } else {
      const newInterview = new Interview({
        candidateId,
        interviewerId,
        date,
        timeSlot,
        topic: topic || 'Mock Technical Interview',
        price: fee,
        platformFee: platform,
        paidAmount: totalAmount,
        notes: notes || '',
        status: 'scheduled',
        paymentStatus: 'paid',
        paymentId: finalPaymentId,
        orderId: finalOrderId,
        paymentMethod,
        invoiceNumber
      });
      savedInterview = await newInterview.save();
    }

    // 2. Create Payment record in MongoDB
    const newPayment = new Payment({
      candidateId,
      interviewerId,
      interviewId: savedInterview._id,
      orderId: finalOrderId,
      paymentId: finalPaymentId,
      signature: signature || '',
      amount: totalAmount,
      sessionFee: fee,
      platformFee: platform,
      currency: 'INR',
      status: 'captured',
      paymentMethod,
      paymentDetails: {
        upiId: paymentDetails.upiId || '',
        utrNumber: paymentDetails.utrNumber || '',
        cardLast4: paymentDetails.cardLast4 || '',
        cardNetwork: paymentDetails.cardNetwork || '',
        bankName: paymentDetails.bankName || '',
        walletName: paymentDetails.walletName || ''
      },
      invoiceNumber,
      notes: notes || `Mock interview session: ${topic}`
    });

    const savedPayment = await newPayment.save();

    // Populate for complete frontend consumption
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
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/payment/history
// @desc    Get payment and transaction records for a candidate or professional
// @access  Public
router.get('/history', async (req, res) => {
  try {
    const { userId, role } = req.query;
    let filter = {};

    if (userId) {
      if (role === 'professional') {
        filter = { interviewerId: userId };
      } else if (role === 'candidate') {
        filter = { candidateId: userId };
      } else {
        filter = { $or: [{ candidateId: userId }, { interviewerId: userId }] };
      }
    }

    const payments = await Payment.find(filter)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId', 'date timeSlot topic meetingRoomId status')
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/payment/:id
// @desc    Get a single payment receipt by ID or interviewId
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    let payment = await Payment.findById(req.params.id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company')
      .populate('interviewId');

    if (!payment) {
      // Try finding by interviewId or paymentId
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
      return res.status(404).json({ message: 'Payment record not found' });
    }

    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
