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

---

## Decision O1..O7: Distributed Locking, Avatar Cloudinary Storage, Pagination, and AI Safety

### Context
1. Reminder cron jobs running across multiple server instances can cause duplicate reminder alerts and spam users.
2. Base64 avatar strings inflate MongoDB documents, degrade query performance, and bypass payload constraints.
3. Unbounded queries across collections expose the server to memory exhaustion and denial-of-service.
4. Raw user input interpolated into LLM prompts creates prompt injection vulnerabilities and unreliable arbitrary outputs.

### Decision
1. **Distributed Mutex (JobLock)**: Created `JobLock` model with MongoDB TTL index and atomic `findAndModify` lease acquisition for multi-instance safe reminder workers.
2. **Cloudinary Stream with Multer Bounds**: Implemented `multer` memory storage strictly limited to 2MB and image MIME types (`image/jpeg`, `image/png`, `image/webp`), streaming to Cloudinary and storing solely secure HTTPS URLs.
3. **Fail-Fast Startup Env Validator**: Created Zod environment validator executing before server listen, immediately aborting (`process.exit(1)`) in production if critical security invariants (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `MONGO_URI`, `FRONTEND_URL`) are violated.
4. **Mandatory Query Pagination**: Introduced `getPagination` helper across all list endpoints (`/api/interviews`, `/api/payment/history`, `/api/payment/payouts`, `/api/notifications`, `/api/admin/users`, `/api/admin/bookings`, `/api/admin/payouts`, `/api/admin/requests`) with supporting MongoDB compound indexes.
5. **Prompt Injection Defense & Structured LLM Outputs**: Untrusted candidate data is sanitized, length-capped, and isolated within `=== BEGIN UNTRUSTED CANDIDATE DATA ===` delimiters accompanied by system directives. LLM outputs are validated against Zod schemas with exponential backoff retries. Removed all hardcoded fallback scores (`|| 75`).
6. **Real Transactional Email Delivery**: `backend/utils/mailer.js` provides formatted HTML templates for all transactional actions (confirmations, reminders, cancellations, refunds, feedbacks, payouts), failing explicitly with HTTP 503 in production if SMTP is unconfigured.
