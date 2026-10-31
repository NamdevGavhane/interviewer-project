const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const Payment = require('../models/Payment');
const Interview = require('../models/Interview');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Counter = require('../models/Counter');
const Payout = require('../models/Payout');
const Availability = require('../models/Availability');
const PendingBooking = require('../models/PendingBooking');
const Notification = require('../models/Notification');
const JobLock = require('../models/JobLock');
const { sendBookingConfirmationEmail } = require('../utils/mailer');
const {
  reserveSlotForCandidate,
  confirmBookedSlot,
  releaseSlotForInterview
} = require('../services/availabilityService');
const { processInterviewRefund } = require('../services/refundService');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validateObjectId');
const { getFrontendBaseUrl } = require('../utils/urlHelper');
const { getPagination } = require('../utils/pagination');
const { paymentLimiter } = require('../middleware/rateLimiter');

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
// @desc    Create a payment order strictly computed from Settings (M1)
//          with atomic slot reservation (M2)
// @access  Protected (Candidate)
router.post('/create-order', authenticate, paymentLimiter, async (req, res) => {
  try {
    const candidateId = req.user._id;
    const { interviewerId, slotId, topic, notes } = req.body;

    if (!interviewerId) {
      return res.status(400).json({ success: false, message: 'Interviewer ID is required.' });
    }
    if (!slotId) {
      return res.status(400).json({ success: false, message: 'Availability slotId is required to reserve booking.' });
    }
    if (!mongoose.Types.ObjectId.isValid(interviewerId) || !mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ success: false, message: 'Invalid interviewer ID or slot ID format.' });
    }

    const interviewer = await User.findById(interviewerId).select('name email title company role accountStatus isDeactivated isVerified');
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
    const amountPaise = settings.mockSessionPricePaise ?? 5000;
    const interviewerSharePercent = settings.interviewerSharePercent ?? 70;
    const interviewerSharePaise = Math.round((amountPaise * interviewerSharePercent) / 100);
    const platformSharePaise = amountPaise - interviewerSharePaise;
    const holdMinutes = settings.pendingPaymentMinutes ?? 10;
    const totalAmountRupees = amountPaise / 100;

    // Atomically reserve the slot for pendingPaymentMinutes (M2)
    const reservedSlot = await reserveSlotForCandidate({
      slotId,
      interviewerId,
      candidateId,
      holdMinutes
    });

    if (!reservedSlot) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is currently reserved by another candidate or is no longer available. Please select another slot.'
      });
    }

    const rzp = getRazorpayInstance();
    let order;
    let isSimulated = false;

    if (rzp) {
      try {
        order = await rzp.orders.create({
          amount: amountPaise, // in paise strictly from Settings (M1)
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
    } else {
      // Simulation is allowed only when NODE_ENV !== 'production' AND ALLOW_PAYMENT_SIMULATION === 'true' AND Razorpay keys are missing.
      const isSimulationAllowed = process.env.NODE_ENV !== 'production' && process.env.ALLOW_PAYMENT_SIMULATION === 'true';
      if (!isSimulationAllowed) {
        await Availability.findByIdAndUpdate(slotId, { reservedBy: null, reservedUntil: null });
        return res.status(503).json({
          success: false,
          message: 'Payments are not configured'
        });
      }

      isSimulated = true;
      order = {
        id: `order_sim_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        amount: amountPaise,
        currency: settings.currency || 'INR',
        receipt: `rcpt_sim_${Date.now()}`,
        status: 'created'
      };
    }

    // Freeze financial terms and booking intent in PendingBooking (M1, M2)
    await PendingBooking.findOneAndUpdate(
      { orderId: order.id },
      {
        orderId: order.id,
        candidateId,
        interviewerId,
        slotId,
        topic: topic || 'Mock Technical Interview',
        notes: notes || '',
        amountPaise,
        interviewerSharePaise,
        platformSharePaise,
        sessionFee: totalAmountRupees,
        platformFee: 0,
        gstAmount: 0,
        amount: totalAmountRupees,
        currency: settings.currency || 'INR',
        isSimulated,
        status: 'pending',
        expiresAt: new Date(Date.now() + holdMinutes * 60 * 1000)
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      freeSession: amountPaise === 0,
      isSimulated,
      orderId: order.id,
      slotId,
      amount: totalAmountRupees,
      amountPaise,
      sessionFee: totalAmountRupees,
      platformFee: 0,
      gstAmount: 0,
      holdMinutes,
      currency: settings.currency || 'INR',
      keyId: process.env.RAZORPAY_KEY_ID || (isSimulated ? 'rzp_test_simulator' : ''),
      candidate: { _id: req.user._id, name: req.user.name, email: req.user.email },
      interviewer
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/payment/verify-and-book
// @desc    Verify payment signature / details and finalize mock interview booking (M1, M2)
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
    if (!mongoose.Types.ObjectId.isValid(interviewerId) || (slotId && !mongoose.Types.ObjectId.isValid(slotId))) {
      return res.status(400).json({ success: false, message: 'Invalid interviewer ID or slot ID format.' });
    }

    // 1. Idempotency Check: If already verified, return existing booking
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
          .populate('interviewerId', 'name email avatar title company');
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

    const interviewer = await User.findById(interviewerId).select('name email title company role accountStatus isDeactivated isVerified');
    if (!interviewer || interviewer.role !== 'professional' || interviewer.isDeactivated || interviewer.accountStatus !== 'active' || !interviewer.isVerified) {
      return res.status(400).json({ success: false, message: 'Interviewer not found or not active.' });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification parameters (orderId).'
      });
    }

    // Atomically claim the PendingBooking to eliminate race condition with webhook (2h)
    let pendingBooking = await PendingBooking.findOneAndUpdate(
      { orderId, status: 'pending' },
      { $set: { status: 'processing' } },
      { new: true }
    );

    if (!pendingBooking) {
      const existing = await PendingBooking.findOne({ orderId });
      if (existing && (existing.status === 'completed' || existing.interviewId)) {
        const existingInterview = await Interview.findById(existing.interviewId)
          .populate('candidateId', 'name email avatar')
          .populate('interviewerId', 'name email avatar title company');
        const existingPayment = await Payment.findOne({ orderId })
          .populate('candidateId', 'name email')
          .populate('interviewerId', 'name email title company');

        return res.status(200).json({
          success: true,
          message: 'Payment already verified and interview booked (idempotent replay).',
          interview: existingInterview,
          payment: existingPayment
        });
      }

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Booking reservation order not found.' });
      }

      return res.status(200).json({
        success: true,
        message: 'Payment verification is currently being finalized. Please check your bookings momentarily.',
        processing: true
      });
    }

    // Determine whether booking is simulated or free strictly from the PendingBooking document in DB
    const isFree = pendingBooking.amountPaise === 0;
    const isSimulated = Boolean(pendingBooking.isSimulated);

    if (!isFree && !isSimulated) {
      // Real payments: verify HMAC with timingSafeEqual, then fetch payment from Razorpay
      const secret = process.env.RAZORPAY_KEY_SECRET;
      if (!secret || !process.env.RAZORPAY_KEY_ID) {
        await PendingBooking.findByIdAndUpdate(pendingBooking._id, { $set: { status: 'pending' } });
        return res.status(503).json({
          success: false,
          message: 'Payment gateway is not configured. Live transactions cannot be verified.'
        });
      }

      if (!paymentId || !signature) {
        await PendingBooking.findByIdAndUpdate(pendingBooking._id, { $set: { status: 'pending' } });
        return res.status(400).json({
          success: false,
          message: 'Missing payment verification parameters (paymentId, signature).'
        });
      }

      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const sigBuf = Buffer.from(signature, 'utf8');
      const expBuf = Buffer.from(generatedSignature, 'utf8');

      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        await PendingBooking.findByIdAndUpdate(pendingBooking._id, { $set: { status: 'pending' } });
        return res.status(400).json({
          success: false,
          message: 'Payment signature verification failed. Invalid or fraudulent transaction.'
        });
      }

      const rzp = getRazorpayInstance();
      if (!rzp) {
        await PendingBooking.findByIdAndUpdate(pendingBooking._id, { $set: { status: 'pending' } });
        return res.status(503).json({
          success: false,
          message: 'Payment gateway instance unavailable.'
        });
      }

      let rzpPayment;
      try {
        rzpPayment = await rzp.payments.fetch(paymentId);
      } catch (fetchErr) {
        await PendingBooking.findByIdAndUpdate(pendingBooking._id, { $set: { status: 'pending' } });
        return res.status(400).json({
          success: false,
          message: 'Failed to fetch payment details from gateway.'
        });
      }

      // If order_id, amount or currency do not match the PendingBooking, or status is not 'captured', do NOT book: set the PendingBooking back to 'pending' and return an error
      if (
        !rzpPayment ||
        rzpPayment.order_id !== orderId ||
        Number(rzpPayment.amount) !== Number(pendingBooking.amountPaise) ||
        (rzpPayment.currency && pendingBooking.currency && rzpPayment.currency.toUpperCase() !== pendingBooking.currency.toUpperCase()) ||
        rzpPayment.status !== 'captured'
      ) {
        await PendingBooking.findByIdAndUpdate(pendingBooking._id, { $set: { status: 'pending' } });
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed: order ID, amount, currency mismatch or payment not captured.'
        });
      }
    }

    const bookingSlotId = pendingBooking.slotId || slotId;
    const bookingTopic = pendingBooking.topic || topic || 'Mock Technical Interview';
    const bookingNotes = pendingBooking.notes || notes || '';
    const finalPaymentId = paymentId || (isFree ? `FREE_${orderId}` : `pay_sim_${orderId}`);
    const finalOrderId = orderId;

    // Check slot availability
    const slotDoc = await Availability.findById(bookingSlotId);
    if (!slotDoc) {
      return res.status(404).json({ success: false, message: 'Availability slot not found.' });
    }

    // RULE M2 Expiry check:
    // If pendingBooking is expired:
    // If slot is free, confirm booking. Otherwise refund automatically!
    const isExpired = pendingBooking.status === 'expired' || (pendingBooking.expiresAt && new Date(pendingBooking.expiresAt) < new Date());
    if (isExpired) {
      if (slotDoc.isBooked) {
        // Slot is already booked by another candidate -> Auto refund
        if (rzp) {
          try {
            await rzp.payments.refund(paymentId, {
              amount: pendingBooking.amountPaise,
              notes: { reason: 'Slot reservation expired and slot was booked by another candidate' }
            });
          } catch (refErr) {
            console.error('Auto refund failed for expired slot capture:', refErr.message);
          }
        }
        return res.status(410).json({
          success: false,
          message: 'Payment hold expired and the slot is no longer available. Your payment has been refunded automatically.'
        });
      }
    } else if (slotDoc.isBooked) {
      return res.status(409).json({
        success: false,
        message: 'The selected time slot was just booked by another candidate. Please choose a different slot.'
      });
    }

    const meetingRoomId = crypto.randomBytes(8).toString('hex');
    const invoiceNumber = await Counter.getNextInvoiceNumber();

    const priceRupees = pendingBooking.amount || (pendingBooking.amountPaise / 100);

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
      price: priceRupees,
      platformFee: 0,
      paidAmount: priceRupees,
      amountPaise: pendingBooking.amountPaise,
      interviewerEarningsPaise: pendingBooking.interviewerSharePaise,
      notes: bookingNotes,
      status: 'scheduled',
      paymentStatus: 'paid',
      paymentId: finalPaymentId,
      orderId: finalOrderId,
      paymentMethod: isFree ? 'free' : (isSimulated ? 'test_simulator' : 'razorpay'),
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
      amount: priceRupees,
      amountPaise: pendingBooking.amountPaise,
      sessionFee: priceRupees,
      platformFee: 0,
      gstAmount: 0,
      currency: pendingBooking.currency || 'INR',
      status: 'captured',
      paymentMethod: isFree ? 'free' : (isSimulated ? 'test_simulator' : 'razorpay'),
      invoiceNumber,
      notes: bookingNotes || `Mock interview session: ${bookingTopic}`
    });

    const savedPayment = await newPayment.save();

    // 4. Update PendingBooking to completed
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

    const populatedInterview = await Interview.findById(savedInterview._id)
      .populate('candidateId', 'name email avatar')
      .populate('interviewerId', 'name email avatar title company');

    const populatedPayment = await Payment.findById(savedPayment._id)
      .populate('candidateId', 'name email')
      .populate('interviewerId', 'name email title company');

    // Send in-app notifications & booking confirmation emails
    try {
      await Notification.create({
        userId: candidateId,
        interviewId: savedInterview._id,
        type: 'booking_confirmed',
        title: 'Interview Booked Successfully!',
        message: `Your mock interview on "${bookingTopic}" with ${interviewer.name} is confirmed for ${slotDoc.date} (${slotDoc.slotLabel}).`,
        link: '/interviews'
      });
      await Notification.create({
        userId: interviewer._id,
        interviewId: savedInterview._id,
        type: 'booking_confirmed',
        title: 'New Mock Interview Booked',
        message: `Candidate ${req.user.name} booked a session on "${bookingTopic}" for ${slotDoc.date} (${slotDoc.slotLabel}).`,
        link: '/interviews'
      });

      const frontendBaseUrl = getFrontendBaseUrl();
      await sendBookingConfirmationEmail({
        recipientName: req.user.name,
        recipientEmail: req.user.email,
        otherPartyName: interviewer.name,
        isCandidate: true,
        topic: bookingTopic,
        date: slotDoc.date,
        timeSlot: slotDoc.slotLabel,
        interviewId: savedInterview._id,
        frontendBaseUrl
      });
      await sendBookingConfirmationEmail({
        recipientName: interviewer.name,
        recipientEmail: interviewer.email,
        otherPartyName: req.user.name,
        isCandidate: false,
        topic: bookingTopic,
        date: slotDoc.date,
        timeSlot: slotDoc.slotLabel,
        interviewId: savedInterview._id,
        frontendBaseUrl
      });
    } catch (notifErr) {
      console.warn('Booking confirmation notification notice:', notifErr.message);
    }

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

      // Check if payment already exists (idempotency check)
      const existingPayment = await Payment.findOne({ orderId });
      if (existingPayment) {
        if (existingPayment.status === 'captured') {
          return res.status(200).json({ success: true, message: 'Payment already processed and finalized.' });
        }
        existingPayment.status = 'captured';
        existingPayment.paymentId = paymentId;
        await existingPayment.save();
        return res.status(200).json({ success: true, message: 'Existing payment marked captured.' });
      } else {
        // Candidate may have dropped off after payment: Auto-finalize from PendingBooking (P4 & 2h)
        const pending = await PendingBooking.findOneAndUpdate(
          { orderId, status: 'pending' },
          { $set: { status: 'processing' } },
          { new: true }
        );

        if (!pending) {
          const completed = await PendingBooking.findOne({ orderId });
          if (completed && (completed.status === 'completed' || completed.status === 'processing')) {
            console.log(`[WEBHOOK] Order ${orderId} is already ${completed.status}. Idempotent return.`);
            return res.status(200).json({ success: true, message: 'Order already completed or processing.' });
          }
          return res.status(200).json({ success: true, message: 'No actionable pending booking found.' });
        }

        // Verify amount and currency
        const expectedPaise = pending.amountPaise ?? Math.round(pending.amount * 100);
          const actualPaise = Number(paymentEntity.amount);
          const expectedCurrency = (pending.currency || 'INR').toUpperCase();
          const actualCurrency = (paymentEntity.currency || 'INR').toUpperCase();

          if (actualPaise !== expectedPaise || actualCurrency !== expectedCurrency) {
            console.error(`[SECURITY ALERT] Webhook payment amount/currency mismatch! Order: ${orderId}. Expected ${expectedPaise} ${expectedCurrency}, got ${actualPaise} ${actualCurrency}`);
            return res.status(400).json({ success: false, message: 'Payment amount or currency mismatch.' });
          }
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

            // Send in-app notification & confirmation emails on webhook finalization
            try {
              const [candidateUser, interviewerUser] = await Promise.all([
                User.findById(pending.candidateId).select('name email'),
                User.findById(pending.interviewerId).select('name email')
              ]);

              if (candidateUser && interviewerUser) {
                await Notification.create({
                  userId: candidateUser._id,
                  interviewId: savedInterview._id,
                  type: 'booking_confirmed',
                  title: 'Interview Booked Successfully!',
                  message: `Your mock interview on "${pending.topic}" with ${interviewerUser.name} is confirmed for ${slotDoc.date} (${slotDoc.slotLabel}).`,
                  link: '/interviews'
                });
                await Notification.create({
                  userId: interviewerUser._id,
                  interviewId: savedInterview._id,
                  type: 'booking_confirmed',
                  title: 'New Mock Interview Booked',
                  message: `Candidate ${candidateUser.name} booked a session on "${pending.topic}" for ${slotDoc.date} (${slotDoc.slotLabel}).`,
                  link: '/interviews'
                });

                const frontendBaseUrl = getFrontendBaseUrl();
                await sendBookingConfirmationEmail({
                  recipientName: candidateUser.name,
                  recipientEmail: candidateUser.email,
                  otherPartyName: interviewerUser.name,
                  isCandidate: true,
                  topic: pending.topic,
                  date: slotDoc.date,
                  timeSlot: slotDoc.slotLabel,
                  interviewId: savedInterview._id,
                  frontendBaseUrl
                });
                await sendBookingConfirmationEmail({
                  recipientName: interviewerUser.name,
                  recipientEmail: interviewerUser.email,
                  otherPartyName: candidateUser.name,
                  isCandidate: false,
                  topic: pending.topic,
                  date: slotDoc.date,
                  timeSlot: slotDoc.slotLabel,
                  interviewId: savedInterview._id,
                  frontendBaseUrl
                });
              }
            } catch (alertErr) {
              console.warn('Webhook booking confirmation notice:', alertErr.message);
            }
            return res.status(200).json({ success: true, message: 'Webhook finalized booking successfully.' });
          } else {
            return res.status(200).json({ success: true, message: 'Slot unavailable or already booked.' });
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

    const { page, limit, skip, formatMeta } = getPagination(req.query, 20);

    const [total, payments] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.find(filter)
        .populate('candidateId', 'name email avatar')
        .populate('interviewerId', 'name email avatar title company')
        .populate('interviewId', 'date timeSlot topic meetingRoomId status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      success: true,
      data: payments,
      pagination: formatMeta(total)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/payment/payouts
// @desc    Get payout ledger with interviewer share and hold period (M1, P6)
// @access  Protected (Professional, Admin)
router.get('/payouts', authenticate, requireRole('professional', 'admin'), async (req, res) => {
  try {
    const interviewerId = req.user.role === 'admin' && req.query.interviewerId ? req.query.interviewerId : req.user._id;

    const settings = await Settings.getSettings();
    const interviewerSharePercent = Number(settings.interviewerSharePercent) || 70;
    const minPayoutPaise = settings.minPayoutPaise ?? 30000;
    const minPayoutRupees = minPayoutPaise / 100;
    const payoutHoldDays = Number(settings.payoutHoldDays) || 3;
    const holdMs = payoutHoldDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const { page, limit, skip, formatMeta } = getPagination(req.query, 20);

    const [allPayouts, eligibleSessions, totalPayouts] = await Promise.all([
      Payout.find({ interviewerId }).sort({ createdAt: -1 }),
      Interview.find({
        interviewerId,
        status: { $in: ['completed', 'candidate_no_show'] }
      }).select('price amountPaise interviewerEarningsPaise paidAmount platformFee endTime updatedAt createdAt status'),
      Payout.countDocuments({ interviewerId })
    ]);

    const paginatedPayouts = allPayouts.slice(skip, skip + limit);

    // Calculate net earning for each session (M1, M2): interviewer share
    let totalEarned = 0;
    let eligibleEarned = 0;
    let onHoldEarned = 0;

    for (const s of eligibleSessions) {
      const netEarning = s.interviewerEarningsPaise 
        ? (s.interviewerEarningsPaise / 100) 
        : Math.round((Number(s.price) || 0) * (interviewerSharePercent / 100));

      totalEarned += netEarning;

      // Session completion timestamp (updatedAt or endTime or createdAt)
      const completionTime = new Date(s.endTime || s.updatedAt || s.createdAt).getTime();
      if (now - completionTime >= holdMs) {
        eligibleEarned += netEarning;
      } else {
        onHoldEarned += netEarning;
      }
    }

    const paidOut = allPayouts.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
    const pendingPayout = allPayouts.filter(p => p.status === 'pending' || p.status === 'processing').reduce((sum, p) => sum + p.amount, 0);
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
        interviewerSharePercent,
        minPayoutPaise,
        minPayout: minPayoutRupees
      },
      payouts: paginatedPayouts,
      pagination: formatMeta(totalPayouts)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/payment/payouts/request
// @desc    Request a payout strictly checked against minPayoutPaise and hold days (M1, P6)
// @access  Protected (Professional)
router.post('/payouts/request', authenticate, requireRole('professional'), async (req, res) => {
  const interviewerId = req.user._id;
  const lockName = `payout_${interviewerId}`;
  let lockInstance = null;

  try {
    // 1. Acquire distributed lock to prevent concurrent double-payout race conditions (2h)
    const lockResult = await JobLock.acquire(lockName, 15000);
    if (!lockResult.acquired) {
      return res.status(409).json({
        success: false,
        message: 'A payout request for your account is currently being processed. Please wait a moment.'
      });
    }
    lockInstance = lockResult.instanceId;

    const { amount, payoutMethod = 'bank_transfer', bankDetails } = req.body;

    const requestedAmount = Number(amount);
    if (!requestedAmount || requestedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive payout amount is required.' });
    }

    // 2. Reject if interviewer already has a pending or processing withdrawal
    const existingActivePayout = await Payout.findOne({
      interviewerId,
      status: { $in: ['pending', 'processing'] }
    });
    if (existingActivePayout) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active payout request pending or processing. Please wait for it to be processed before requesting another.'
      });
    }

    const settings = await Settings.getSettings();
    const minPayoutPaise = settings.minPayoutPaise ?? 30000;
    const minPayoutRupees = minPayoutPaise / 100;

    // RULE M1: Payout requests below minPayoutPaise are rejected with a clear message
    if (Math.round(requestedAmount * 100) < minPayoutPaise) {
      return res.status(400).json({
        success: false,
        message: `Payout request of ₹${requestedAmount} is below the minimum required withdrawal of ₹${minPayoutRupees} (${minPayoutPaise} paise).`
      });
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

    const interviewerSharePercent = Number(settings.interviewerSharePercent) || 70;
    const payoutHoldDays = Number(settings.payoutHoldDays) || 3;
    const holdMs = payoutHoldDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const [payouts, eligibleSessions] = await Promise.all([
      Payout.find({ interviewerId }),
      Interview.find({
        interviewerId,
        status: { $in: ['completed', 'candidate_no_show'] }
      }).select('price interviewerEarningsPaise endTime updatedAt createdAt status')
    ]);

    let eligibleEarned = 0;
    for (const s of eligibleSessions) {
      const completionTime = new Date(s.endTime || s.updatedAt || s.createdAt).getTime();
      if (now - completionTime >= holdMs) {
        const netEarning = s.interviewerEarningsPaise
          ? (s.interviewerEarningsPaise / 100)
          : Math.round((Number(s.price) || 0) * (interviewerSharePercent / 100));
        eligibleEarned += netEarning;
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
  } finally {
    if (lockInstance) {
      await JobLock.release(lockName, lockInstance);
    }
  }
});

// @route   GET /api/payment/:id
// @desc    Get a single payment receipt by ID
// @access  Protected
router.get('/:id', authenticate, async (req, res) => {
  try {
    let payment = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      payment = await Payment.findById(req.params.id)
        .populate('candidateId', 'name email avatar')
        .populate('interviewerId', 'name email avatar title company')
        .populate('interviewId');
    }

    if (!payment) {
      payment = await Payment.findOne({
        $or: [
          ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ interviewId: req.params.id }] : []),
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
