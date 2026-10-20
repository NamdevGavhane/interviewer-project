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
const PendingBooking = require('../models/PendingBooking');
const {
  reserveSlotForCandidate,
  confirmBookedSlot,
  releaseSlotForInterview
} = require('../services/availabilityService');
const { processInterviewRefund } = require('../services/refundService');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validateObjectId');

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
// @desc    Create a payment order strictly computed from DB settings and interviewer rate,
//          with atomic slot reservation (P2, P7)
// @access  Protected (Candidate)
router.post('/create-order', authenticate, async (req, res) => {
  try {
    const candidateId = req.user._id;
    const { interviewerId, slotId, topic, notes } = req.body;

    if (!interviewerId) {
      return res.status(400).json({ success: false, message: 'Interviewer ID is required.' });
    }
    if (!slotId) {
      return res.status(400).json({ success: false, message: 'Availability slotId is required to reserve booking.' });
    }

    const interviewer = await User.findById(interviewerId).select('name email title company hourlyRate role accountStatus isDeactivated isVerified');
    if (!interviewer || interviewer.role !== 'professional' || interviewer.isDeactivated || interviewer.accountStatus !== 'active' || !interviewer.isVerified) {
      return res.status(400).json({ success: false, message: 'Interviewer not found or not currently active and verified.' });
    }

    // Verify slot exists and belongs to interviewer
    const slotDoc = await Availability.findById(slotId);
    if (!slotDoc || String(slotDoc.interviewerId) !== String(interviewerId)) {
      return res.status(404).json({ success: false, message: 'Selected availability slot does not belong to this interviewer.' });
    }
    if (slotDoc.isBooked) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked.' });
    }
    if (new Date(slotDoc.startTime) <= new Date()) {
      return res.status(400).json({ success: false, message: 'Cannot book slots in the past.' });
    }

    const settings = await Settings.getSettings();
    const sessionFee = Number(interviewer.hourlyRate) || 0;

    // Zero-fee session: directly bookable without gateway
    if (sessionFee === 0) {
      return res.json({
        success: true,
        freeSession: true,
        orderId: `FREE_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        slotId,
        amount: 0,
        sessionFee: 0,
        platformFee: 0,
        gstAmount: 0,
        currency: settings.currency || 'INR',
        candidate: { _id: req.user._id, name: req.user.name, email: req.user.email },
        interviewer
      });
    }

    // Atomically reserve the slot for 15 minutes
    const reservedSlot = await reserveSlotForCandidate({
      slotId,
      interviewerId,
      candidateId,
      holdMinutes: 15
    });

    if (!reservedSlot) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is currently reserved by another candidate or is no longer available. Please select another slot.'
      });
    }

    // Server-side financial calculations (P7)
    const commissionPercent = Number(settings.platformCommissionPercent) || 0;
    const gstPercent = Number(settings.gstPercent) || 0;

    const platformFee = Math.round((sessionFee * commissionPercent) / 100);
    const gstAmount = Math.round(((sessionFee + platformFee) * gstPercent) / 100);
    const totalAmount = sessionFee + platformFee + gstAmount;

    const rzp = getRazorpayInstance();
    if (!rzp) {
      // Release slot reservation if gateway unconfigured
      await Availability.findByIdAndUpdate(slotId, { reservedBy: null, reservedUntil: null });
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is currently not configured by administrator. RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET are required.'
      });
    }

    let order;
    try {
      order = await rzp.orders.create({
        amount: Math.round(totalAmount * 100), // in paise
        currency: settings.currency || 'INR',
        receipt: `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        notes: {
          candidateId: String(candidateId),
          interviewerId: String(interviewerId),
          slotId: String(slotId)
        }
      });
    } catch (orderErr) {
      // Release slot reservation on gateway failure
      await Availability.findByIdAndUpdate(slotId, { reservedBy: null, reservedUntil: null });
      throw orderErr;
    }

    // Freeze financial terms and booking intent in PendingBooking (P2)
    await PendingBooking.findOneAndUpdate(
      { orderId: order.id },
      {
        orderId: order.id,
        candidateId,
        interviewerId,
        slotId,
        topic: topic || 'Mock Technical Interview',
        notes: notes || '',
        sessionFee,
        platformFee,
        gstAmount,
        amount: totalAmount,
        currency: settings.currency || 'INR',
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      freeSession: false,
      orderId: order.id,
      slotId,
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
// @desc    Verify payment signature / details and finalize mock interview booking (P3)
// @access  Protected
router.post('/verify-and-book', authenticate, async (req, res) => {
  try {
    const candidateId = req.user._id;
    const {
      interviewerId,
      slotId,
      topic,
      notes,
      orderId,
      paymentId,
      signature,
      paymentMethod = 'razorpay'
    } = req.body;

    if (!interviewerId) {
      return res.status(400).json({ success: false, message: 'Interviewer ID is required.' });
    }

    // 1. Idempotency Check (P3): If already verified, return existing booking
    if (orderId || paymentId) {
      const existingPayment = await Payment.findOne({
        $or: [
          ...(orderId ? [{ orderId }] : []),
          ...(paymentId ? [{ paymentId }] : [])
        ]
      });

      if (existingPayment) {
        const existingInterview = await Interview.findById(existingPayment.interviewId)
          .populate('candidateId', 'name email avatar')
          .populate('interviewerId', 'name email avatar title company hourlyRate');
        const populatedPayment = await Payment.findById(existingPayment._id)
          .populate('candidateId', 'name email')
          .populate('interviewerId', 'name email title company');

        return res.status(200).json({
          success: true,
          message: 'Payment already verified and interview booked (idempotent replay).',
          interview: existingInterview,
          payment: populatedPayment
        });
      }
    }

    const interviewer = await User.findById(interviewerId).select('name email title company hourlyRate role accountStatus isDeactivated isVerified');
    if (!interviewer || interviewer.role !== 'professional' || interviewer.isDeactivated || interviewer.accountStatus !== 'active' || !interviewer.isVerified) {
      return res.status(400).json({ success: false, message: 'Interviewer not found or not active.' });
    }

    const settings = await Settings.getSettings();
    const sessionFee = Number(interviewer.hourlyRate) || 0;
    const isFree = sessionFee === 0;

    let finalPaymentId = paymentId;
    let finalOrderId = orderId;
    let platformFee = 0;
    let gstAmount = 0;
    let totalAmount = 0;
    let bookingSlotId = slotId;
    let bookingTopic = topic || 'Mock Technical Interview';
    let bookingNotes = notes || '';

    if (isFree) {
      finalPaymentId = `FREE_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      finalOrderId = `FREE_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    } else {
      // Real signature verification using crypto.timingSafeEqual (P3)
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

      const sigBuf = Buffer.from(signature, 'utf8');
      const expBuf = Buffer.from(generatedSignature, 'utf8');

      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return res.status(400).json({
          success: false,
          message: 'Payment signature verification failed. Invalid or fraudulent transaction.'
        });
      }

      // Check order status against Razorpay API
      const rzp = getRazorpayInstance();
      if (rzp) {
        try {
          const rzpPayment = await rzp.payments.fetch(paymentId);
          if (rzpPayment && rzpPayment.order_id !== orderId) {
            return res.status(400).json({
              success: false,
              message: 'Payment order ID mismatch with gateway record.'
            });
          }
        } catch (fetchErr) {
          console.warn('Could not fetch payment from Razorpay API for additional check:', fetchErr.message);
        }
      }

      // Load frozen financial fields from PendingBooking (P2, P7)
      const pendingBooking = await PendingBooking.findOne({ orderId });
      if (pendingBooking) {
        bookingSlotId = pendingBooking.slotId;
        bookingTopic = pendingBooking.topic;
        bookingNotes = pendingBooking.notes;
        platformFee = pendingBooking.platformFee;
        gstAmount = pendingBooking.gstAmount;
        totalAmount = pendingBooking.amount;
      } else {
        const commissionPercent = Number(settings.platformCommissionPercent) || 0;
        const gstPercent = Number(settings.gstPercent) || 0;
        platformFee = Math.round((sessionFee * commissionPercent) / 100);
        gstAmount = Math.round(((sessionFee + platformFee) * gstPercent) / 100);
        totalAmount = sessionFee + platformFee + gstAmount;
      }
    }

    if (!bookingSlotId) {
      return res.status(400).json({ success: false, message: 'Valid slotId is required to finalize booking.' });
    }

    // Derive date, timeSlot, startTime, endTime STRICTLY from the Availability slot (P3)
    const slotDoc = await Availability.findById(bookingSlotId);
    if (!slotDoc) {
      return res.status(404).json({ success: false, message: 'Availability slot not found.' });
    }
    if (slotDoc.isBooked) {
      return res.status(409).json({
        success: false,
        message: 'The selected time slot was just booked by another candidate. Please choose a different slot.'
      });
    }

    const meetingRoomId = crypto.randomBytes(8).toString('hex');
    const invoiceNumber = await Counter.getNextInvoiceNumber();

    // 1. Create Interview record
    const newInterview = new Interview({
      candidateId,
      interviewerId,
      date: slotDoc.date,
      timeSlot: slotDoc.slotLabel,
      slotId: slotDoc._id,
      startTime: slotDoc.startTime,
      endTime: slotDoc.endTime,
      topic: bookingTopic,
      price: sessionFee,
      platformFee,
      paidAmount: totalAmount,
      notes: bookingNotes,
      status: 'scheduled',
      paymentStatus: 'paid',
      paymentId: finalPaymentId,
      orderId: finalOrderId,
      paymentMethod: isFree ? 'free' : paymentMethod,
      invoiceNumber,
      meetingRoomId
    });

    const savedInterview = await newInterview.save();

    // 2. Atomically confirm slot booking in Availability collection
    const bookedSlot = await confirmBookedSlot({
      slotId: bookingSlotId,
      candidateId,
      interviewId: savedInterview._id
    });

    if (!bookedSlot) {
      // Compensating action: Delete interview and refund if slot booking failed
      await Interview.findByIdAndDelete(savedInterview._id);
      return res.status(409).json({
        success: false,
        message: 'Failed to lock slot: Slot is no longer available or reservation expired.'
      });
    }

    // 3. Create Payment record
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
      notes: bookingNotes || `Mock interview session: ${bookingTopic}`
    });

    const savedPayment = await newPayment.save();

    // 4. Update PendingBooking to completed
    if (!isFree && orderId) {
      await PendingBooking.findOneAndUpdate(
        { orderId },
        {
          $set: {
            status: 'completed',
            paymentId: finalPaymentId,
            interviewId: savedInterview._id
          }
        }
      );
    }

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
// @desc    Razorpay Webhook receiver with HMAC SHA256 signature verification (P4)
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
    const bodyPayload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyPayload)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ message: 'Invalid webhook signature.' });
    }

    const event = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(bodyPayload);
    const eventName = event.event;

    if (eventName === 'payment.captured') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      // Check if payment already exists
      const existingPayment = await Payment.findOne({ orderId });
      if (existingPayment) {
        existingPayment.status = 'captured';
        existingPayment.paymentId = paymentId;
        await existingPayment.save();
      } else {
        // Candidate may have dropped off after payment: Auto-finalize from PendingBooking (P4)
        const pending = await PendingBooking.findOne({ orderId, status: 'pending' });
        if (pending) {
          const slotDoc = await Availability.findById(pending.slotId);
          if (slotDoc && !slotDoc.isBooked) {
            const meetingRoomId = crypto.randomBytes(8).toString('hex');
            const invoiceNumber = await Counter.getNextInvoiceNumber();

            const interview = new Interview({
              candidateId: pending.candidateId,
              interviewerId: pending.interviewerId,
              date: slotDoc.date,
              timeSlot: slotDoc.slotLabel,
              slotId: slotDoc._id,
              startTime: slotDoc.startTime,
              endTime: slotDoc.endTime,
              topic: pending.topic,
              price: pending.sessionFee,
              platformFee: pending.platformFee,
              paidAmount: pending.amount,
              notes: pending.notes,
              status: 'scheduled',
              paymentStatus: 'paid',
              paymentId,
              orderId,
              paymentMethod: 'razorpay',
              invoiceNumber,
              meetingRoomId
            });

            const savedInterview = await interview.save();
            await confirmBookedSlot({
              slotId: pending.slotId,
              candidateId: pending.candidateId,
              interviewId: savedInterview._id
            });

            const payment = new Payment({
              candidateId: pending.candidateId,
              interviewerId: pending.interviewerId,
              interviewId: savedInterview._id,
              orderId,
              paymentId,
              amount: pending.amount,
              sessionFee: pending.sessionFee,
              platformFee: pending.platformFee,
              gstAmount: pending.gstAmount,
              currency: pending.currency,
              status: 'captured',
              paymentMethod: 'razorpay',
              invoiceNumber,
              notes: pending.notes || `Webhook finalized: ${pending.topic}`
            });

            await payment.save();

            pending.status = 'completed';
            pending.paymentId = paymentId;
            pending.interviewId = savedInterview._id;
            await pending.save();
          }
        }
      }
    } else if (eventName === 'payment.failed') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      await Payment.findOneAndUpdate(
        { orderId },
        { $set: { status: 'failed' } }
      );

      // Release slot reservation
      const pending = await PendingBooking.findOne({ orderId });
      if (pending) {
        pending.status = 'failed';
        await pending.save();
        await Availability.findByIdAndUpdate(pending.slotId, {
          reservedBy: null,
          reservedUntil: null
        });
      }
    } else if (eventName === 'refund.processed') {
      const refundEntity = event.payload.refund.entity;
      const payment = await Payment.findOneAndUpdate(
        { paymentId: refundEntity.payment_id },
        {
          $set: {
            refundStatus: 'processed',
            refundId: refundEntity.id,
            refundAmount: refundEntity.amount / 100,
            refundedAt: new Date(),
            status: 'refunded'
          }
        },
        { new: true }
      );

      if (payment && payment.interviewId) {
        await Interview.findByIdAndUpdate(payment.interviewId, {
          status: 'cancelled',
          cancelledAt: new Date(),
          refundAmount: payment.amount,
          paymentStatus: 'refunded'
        });
        await releaseSlotForInterview(payment.interviewId);
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/payment/refund/:interviewId
// @desc    Process refund through unified refund service (P5)
// @access  Protected
router.post('/refund/:interviewId', validateObjectId('interviewId'), authenticate, async (req, res) => {
  try {
    const result = await processInterviewRefund({
      interviewId: req.params.interviewId,
      requestedByUserId: req.user._id,
      userRole: req.user.role,
      reason: req.body.reason
    });

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    res.json(result);
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
// @desc    Get payout ledger with commission deduction and hold period (P6 & X8)
// @access  Protected (Professional, Admin)
router.get('/payouts', authenticate, requireRole('professional', 'admin'), async (req, res) => {
  try {
    const interviewerId = req.user.role === 'admin' && req.query.interviewerId ? req.query.interviewerId : req.user._id;

    const settings = await Settings.getSettings();
    const commissionPercent = Number(settings.platformCommissionPercent) || 0;
    const payoutHoldDays = Number(settings.payoutHoldDays) || 3;
    const holdMs = payoutHoldDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const [payouts, completedSessions] = await Promise.all([
      Payout.find({ interviewerId }).sort({ createdAt: -1 }),
      Interview.find({ interviewerId, status: 'completed' }).select('price paidAmount platformFee endTime updatedAt createdAt')
    ]);

    // Calculate net earning for each session (P6): price - platform commission
    let totalEarned = 0;
    let eligibleEarned = 0;
    let onHoldEarned = 0;

    for (const s of completedSessions) {
      const sessionFee = Number(s.price) || 0;
      const commission = Math.round((sessionFee * commissionPercent) / 100);
      const netEarning = Math.max(0, sessionFee - commission);
      totalEarned += netEarning;

      // Session completion timestamp (updatedAt or endTime or createdAt)
      const completionTime = new Date(s.endTime || s.updatedAt || s.createdAt).getTime();
      if (now - completionTime >= holdMs) {
        eligibleEarned += netEarning;
      } else {
        onHoldEarned += netEarning;
      }
    }

    const paidOut = payouts.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
    const pendingPayout = payouts.filter(p => p.status === 'pending' || p.status === 'processing').reduce((sum, p) => sum + p.amount, 0);
    const availableBalance = Math.max(0, eligibleEarned - paidOut - pendingPayout);

    res.json({
      success: true,
      stats: {
        totalEarned,
        eligibleEarned,
        onHoldEarned,
        paidOut,
        pendingPayout,
        availableBalance,
        payoutHoldDays,
        platformCommissionPercent: commissionPercent
      },
      payouts
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/payment/payouts/request
// @desc    Request a payout strictly checked against commission and hold days (P6)
// @access  Protected (Professional)
router.post('/payouts/request', authenticate, requireRole('professional'), async (req, res) => {
  try {
    const interviewerId = req.user._id;
    const { amount, payoutMethod = 'bank_transfer', bankDetails } = req.body;

    const requestedAmount = Number(amount);
    if (!requestedAmount || requestedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive payout amount is required.' });
    }

    // Validate bank details / UPI details
    if (payoutMethod === 'bank_transfer') {
      if (!bankDetails || !bankDetails.accountNumber || !bankDetails.ifscCode) {
        return res.status(400).json({
          success: false,
          message: 'Bank transfer requires accountNumber and ifscCode in bankDetails.'
        });
      }
    } else if (payoutMethod === 'upi') {
      if (!bankDetails || !bankDetails.upiId) {
        return res.status(400).json({
          success: false,
          message: 'UPI payout requires upiId in bankDetails.'
        });
      }
    }

    const settings = await Settings.getSettings();
    const commissionPercent = Number(settings.platformCommissionPercent) || 0;
    const payoutHoldDays = Number(settings.payoutHoldDays) || 3;
    const holdMs = payoutHoldDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const [payouts, completedSessions] = await Promise.all([
      Payout.find({ interviewerId }),
      Interview.find({ interviewerId, status: 'completed' }).select('price endTime updatedAt createdAt')
    ]);

    let eligibleEarned = 0;
    for (const s of completedSessions) {
      const completionTime = new Date(s.endTime || s.updatedAt || s.createdAt).getTime();
      if (now - completionTime >= holdMs) {
        const sessionFee = Number(s.price) || 0;
        const commission = Math.round((sessionFee * commissionPercent) / 100);
        eligibleEarned += Math.max(0, sessionFee - commission);
      }
    }

    const activeWithdrawals = payouts
      .filter(p => ['pending', 'processing', 'completed'].includes(p.status))
      .reduce((sum, p) => sum + p.amount, 0);

    const availableBalance = Math.max(0, eligibleEarned - activeWithdrawals);

    if (requestedAmount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: `Requested amount (₹${requestedAmount}) exceeds available balance (₹${availableBalance}). Sessions completed within the last ${payoutHoldDays} days are on hold.`
      });
    }

    const payout = new Payout({
      interviewerId,
      amount: requestedAmount,
      currency: settings.currency || 'INR',
      payoutMethod,
      bankDetails: bankDetails || {},
      status: 'pending'
    });

    await payout.save();

    res.status(201).json({
      success: true,
      message: 'Payout request submitted successfully and is pending administrator approval.',
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
    const isOwner = String(payment.candidateId?._id) === String(req.user._id) ||
                    String(payment.interviewerId?._id) === String(req.user._id) ||
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
