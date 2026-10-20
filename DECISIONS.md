# Architecture & Security Decisions Log

This document records key decisions made during the InterviewPro audit, hardening, refactoring, and production readiness process.

---

## Decision S6-1: Access Token and Refresh Token Architecture

### Context
In single-page applications, storing authentication tokens in `localStorage` exposes them to Cross-Site Scripting (XSS) extraction. Conversely, keeping access tokens solely in-memory causes session interruption on hard refreshes unless a silent refresh handshake is performed against an `httpOnly` cookie.

### Decision
1. **Refresh Token**: Issued as an `httpOnly`, `Secure` (in production), `SameSite=Lax` cookie (`refreshToken`), preventing JavaScript access entirely.
2. **Access Token**: Short-lived (15-minute expiration) JWT. Managed through `AuthContext` state with automatic background renewal via `POST /api/users/refresh` whenever expired.
3. **Role & Identity**: The frontend NEVER trusts `localStorage.getItem('userRole')`. The user's role is established solely by `/api/users/me` on the server and kept in React state.

---

## Decision P1/P2/P3: Atomic Booking, Reservation Locks & Idempotent Verification

### Context
Allowing direct scheduling without prior payment allows candidates to book slots without paying. Simultaneously, multiple candidates proceeding to checkout for the same slot could cause double-bookings or payment capture for an unavailable slot.

### Decision
1. **Direct Unpaid Booking Disabled**: `POST /api/interviews` blocks creation of paid sessions. Paid sessions must initiate an order via `POST /api/payment/create-order`.
2. **Atomic 15-Minute Reservation**: `POST /api/payment/create-order` acquires a 15-minute lock on `Availability` (`reservedBy`, `reservedUntil`), preventing competing checkouts.
3. **PendingBooking with TTL**: Financial figures (`sessionFee`, `platformFee`, `gstAmount`, `amount`) are frozen in `PendingBooking` with MongoDB TTL indexing.
4. **Idempotency & Constant-Time Verification**: `POST /api/payment/verify-and-book` uses `crypto.timingSafeEqual` and returns existing records without duplicate insertions on replay. Webhook (`payment.captured`) auto-finalizes bookings if a candidate drops connection post-payment.
5. **Unified Refund & Payout Controls**: Centralized in `services/refundService.js` enforcing `Settings.refundWindowHours` and `Settings.payoutHoldDays` for interviewer withdrawals.
6. **Timezone Accuracy**: Pure UTC dates generated via `luxon` in `services/availabilityService.js`.

---

## Decision F1/F2/F3: Decoupling Interviewer Rating from Candidate Performance

### Context
Previously, `feedbackRoutes.js` averaged candidate technical scores (`f.overallScore / 20`) to compute the interviewer's own public rating. An evaluator giving rigorous or low technical scores to an underperforming candidate suffered an unfair penalty to their personal star rating.

### Decision
1. **Dedicated Review Collection**: Created `Review` model (`interviewId` unique, `candidateId`, `interviewerId`, `rating: 1..5`, `comment`).
2. **Authentic Interviewer Ratings**: Interviewer `rating` and `reviewsCount` are calculated exclusively from candidate `Review` submissions.
3. **Session Timing & Completion Gates**: Feedback cannot be submitted before session start time or on cancelled sessions. Submitting evaluation feedback automatically marks the interview session `completed` with a `completedAt` timestamp and triggers an in-app candidate notification.



