# AUDIT.md — Comprehensive Codebase Audit

**Project:** InterviewPro (React 19 + Vite frontend in `/src`, Express 5 + Mongoose backend in `/backend`)  
**Auditor:** Principal Full-Stack Engineer & Security Reviewer  
**Date:** October 2026  
**Scope:** Complete line-by-line inspection of all backend routes, models, middleware, services, utilities, and all frontend components, hooks, pages, and configs.

---

## 1. Executive Summary

A comprehensive line-by-line audit revealed significant security vulnerabilities, hardcoded mock data, broken race conditions in payment and booking flows, unhandled runtime ReferenceErrors, and leaking secrets. 

The application has been audited against:
1. **Security & Authentication** (OWASP Top 10, plaintext token exposure, missing authorization checks, CORS misconfigurations, ReferenceErrors in middleware).
2. **Payments, Booking & Concurrency** (unpaid booking creation, lack of atomic slot reservations, missing timing-safe HMAC checks, race conditions in payout withdrawals and rescheduling).
3. **Timezones & Scheduling** (UTC/local time mixing, lack of timezone-aware rule evaluation).
4. **Data Integrity & Evaluation** (interviewer rating corrupted by candidate assessment scores, missing server-side session completion proofs, unverified feedback submissions).
5. **Static/Demo Data** (hardcoded demo credentials, hardcoded names/organizations in UI, hardcoded STUN servers, demo image assets).

---

## 2. Discovered Issues & Vulnerability Breakdown

### Critical Security Vulnerabilities (S-Series & X-Series)

1. **S1 & X2: Plaintext Security Token Exposure via User Endpoints**
   - **Location:** `backend/models/User.js`, `backend/routes/userRoutes.js:24-42`, `backend/routes/adminRoutes.js:25-45`
   - **Issue:** `resetPasswordToken`, `emailVerificationToken`, and `invitationToken` are stored in plaintext in MongoDB. Neither has `select: false` nor a schema-level `toJSON` transform stripping them. User queries only use `.select('-password')`, leaking valid password reset and email verification tokens in `GET /api/users` and `GET /api/users/:id`. Candidates calling `GET /api/users` receive unpaginated user records including other candidates' and interviewers' tokens and emails.
   - **Remediation:** Store SHA-256 token hashes only; add `select: false` on token fields; implement `toJSON` transform; strictly allow-list public fields for professionals; paginate `GET /api/users`; restrict `GET /api/users/:id` to public professional profile or full profile only for self/admin; provide migration script to hash existing tokens.

2. **S2: Insecure Default Secrets & Hardcoded Credentials**
   - **Location:** `backend/server.js:19,22`, `backend/seed.js:29`, `backend/clean.js:20`
   - **Issue:** `server.js` uses fallback `'super-secret-jwt-key-interviewpro'` and refresh secret. `seed.js` sets a fallback admin password `'Admin@123456'`. `clean.js` has a hardcoded deletion exception for `'namdev.sharma@gmail.com'` and lacks a production environment guard or `--confirm` flag.
   - **Remediation:** Abort with `process.exit(1)` if `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MONGO_URI`, or `FRONTEND_URL` are missing or < 32 characters in production. Require `ADMIN_EMAIL` and `ADMIN_PASSWORD` (min 12 chars) from env in `seed.js`. Guard `clean.js` with `NODE_ENV !== 'production'` and `--confirm`.

3. **S3: Overly Permissive CORS Configuration**
   - **Location:** `backend/server.js:37-60`
   - **Issue:** CORS contains permissive localhost fallback branches and does not strictly reject unauthorized origins when `FRONTEND_URL` is parsed.
   - **Remediation:** Whitelist strictly the comma-separated origins in `FRONTEND_URL`. Reject all others with a CORS error.

4. **S4: Chat Endpoint Authorization Bypass & Injection**
   - **Location:** `backend/routes/interviewRoutes.js:189-215`
   - **Issue:** `POST /api/interviews/:id/chat` does not verify if `req.user` is a participant (candidate, interviewer, or admin). It reads `sender` directly from `req.body.sender` allowing client impersonation, lacks length limits, and lacks rate limiting.
   - **Remediation:** Derive `sender` strictly from `req.user`. Require `req.user._id` to match `candidateId`, `interviewerId`, or role `admin`. Apply message length cap (e.g., 2000 chars) and rate limiting.

5. **S5: Fatal ReferenceError in Middleware**
   - **Location:** `backend/middleware/auth.js:208`
   - **Issue:** `requireActiveProfessional` references undefined variable `user` (`if (req.user.isDeactivated || user.accountStatus === 'deactivated')`), throwing an unhandled `ReferenceError: user is not defined` whenever an active professional accesses a protected route.
   - **Remediation:** Correct to `req.user.accountStatus === 'deactivated'`. Write unit tests for all middleware branches (invited, pending, rejected, deactivated, unverified, ok, admin).

6. **S6: Client-Side Role Trust & Insecure Fetch Calls**
   - **Location:** `src/context/AuthContext.jsx`, `src/utils/apiClient.js`, `src/pages/AcceptInvitation.jsx:45`, `src/pages/VideoRoom.jsx:110`
   - **Issue:** Roles are stored and read from `localStorage.getItem('userRole')`. `AcceptInvitation.jsx` and `VideoRoom.jsx` use raw unauthenticated `fetch()` calls.
   - **Remediation:** Base role authorization solely on `AuthContext` retrieved from `/api/users/me`. Remove all `userRole` reliance from localStorage. Replace raw `fetch` calls with `apiClient`.

7. **S7: Express Hardening, Body Limits & Query Injection**
   - **Location:** `backend/server.js`, all route handlers
   - **Issue:** `express.json` limit is unconstrained or permissive (allowing base64 payload bombs). Routes lack Zod parameter validation for MongoDB `ObjectId`s. Several routes perform mutations with `$set: req.body`.
   - **Remediation:** Global `express.json({ limit: '1mb' })`. Validate all params and request bodies with Zod. Add Helmet with SPA CSP. Reject raw `$set: req.body` mutations across all routes. Add global async error handler.

---

### Payments, Booking & Timezone Issues (P-Series & X-Series)

8. **P1 & P2: Unpaid Booking Bypass & Missing Atomic Slot Reservations**
   - **Location:** `backend/routes/interviewRoutes.js:35-85`, `backend/routes/paymentRoutes.js:25-70`
   - **Issue:** `POST /api/interviews` allows creating scheduled sessions directly without payment or slot locking. `POST /api/payment/create-order` accepts arbitrary pricing and lacks atomic reservation on `Availability` slots.
   - **Remediation:** Remove direct unpaid booking for paid sessions. Require `slotId` in `POST /api/payment/create-order`. Validate slot ownership, compute fee securely from DB (`hourlyRate` + `commission` + `GST`), freeze in a new `PendingBooking` model, and atomically mark slot reserved (`reservedBy`, `reservedUntil`). Implement background job to release expired reservations.

9. **P3 & P4: Payment Verification Flaws & Webhook Idempotency**
   - **Location:** `backend/routes/paymentRoutes.js:80-160, 220-270`
   - **Issue:** Signature verification in `verify-and-book` does not use `crypto.timingSafeEqual`. Booking details (`date`, `timeSlot`) are trusted from client request body. Replayed payment verifications cause errors or duplicate entries. Webhook does not finalize bookings if the client disconnects before calling `verify-and-book`.
   - **Remediation:** Use `crypto.timingSafeEqual`. Load date/time from the reserved slot. Verify order status with Razorpay API. Run Interview creation, Payment capture, and Slot booking in a MongoDB transaction. Handle idempotent replay. Ensure webhook idempotently finalizes `PendingBooking`.

10. **P5: Dual Inconsistent Refund Implementation**
    - **Location:** `backend/routes/interviewRoutes.js:145-180`, `backend/routes/paymentRoutes.js:175-215`
    - **Issue:** Refund logic is duplicated with differing window checks. Interviews that have already completed can be refunded.
    - **Remediation:** Unified refund service respecting `Settings.refundWindowHours`. Allow refunds only for `scheduled` sessions before `startTime`. Automatically distinguish candidate cancellations (policy applies) vs interviewer/admin cancellations (full refund).

11. **P6 & X8: Payout Race Condition & Missing Commission Deduction**
    - **Location:** `backend/routes/paymentRoutes.js:280-340`, `backend/routes/adminRoutes.js`
    - **Issue:** Payout balance check sums raw session amounts without subtracting platform commission, and does not check `Settings.payoutHoldDays`. No atomic lock or MongoDB transaction prevents simultaneous withdrawal requests. Admin endpoints to approve/reject payouts do not exist.
    - **Remediation:** Compute balance as `sum(sessionFee - platformCommission)` for completed sessions older than `payoutHoldDays`. Use a ledger transaction to prevent double withdrawals. Add admin payout review endpoints and AdminDashboard UI.

12. **P8 & X4: Timezone Mixing in Availability Generation**
    - **Location:** `backend/services/availabilityService.js:45-110`
    - **Issue:** Generates slots using `new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), ...))` mixing server local calendar days with UTC hours. Ignores `rule.timezone`.
    - **Remediation:** Interpret `AvailabilityRule` strictly within `rule.timezone` using Luxon/date-fns-tz. Output UTC instants. Display localized slots to candidates with timezone indicators.

13. **P9 & X12: Invoice Fallbacks & Inaccurate Tax Records**
    - **Location:** `src/utils/invoiceGenerator.js`
    - **Issue:** Generates invoices with fallback `'INV-OFFICIAL'` and recomputes GST and fees instead of pulling immutable fields from the `Payment` document.
    - **Remediation:** Require stored `Payment` fields (`invoiceNumber`, `sessionFee`, `platformFee`, `gstAmount`, `amount`). Prohibit client-side recalculation.

---

### Feedback, Ratings & Sessions (F-Series & X-Series)

14. **F1 & X5: Interviewer Rating Corrupted by Candidate Score**
    - **Location:** `backend/routes/feedbackRoutes.js:94-104`
    - **Issue:** `feedbackRoutes.js` recalculates `interviewer.rating` by averaging the candidate's performance `overallScore` given by the interviewer.
    - **Remediation:** Decouple candidate evaluation scores from interviewer ratings. Create a `Review` model (candidate -> interviewer, 1–5 stars, review comment). Compute `rating` and `reviewsCount` strictly from `Review` records. Add review submission UI for candidates upon interview completion.

15. **F2, F3 & F4: Feedback Permissions & Server-Controlled Completion**
    - **Location:** `backend/routes/feedbackRoutes.js`, `backend/routes/interviewRoutes.js`
    - **Issue:** An interviewer can submit feedback at any time, even before the session starts or without attending. Status `'completed'` can be set by the client via a patch route without verification.
    - **Remediation:** Enforce `now >= startTime` and participant attendance (`joinedAt`). Set `'completed'` status strictly server-side upon feedback submission or interviewer session close. Add unique index on `Feedback.interviewId`. Send in-app and email notifications when feedback is published.

---

### Operations, Email, Uploads & AI (O-Series & X-Series)

16. **O1 & O6: Insecure Reminder Worker & Simulated Email Sending**
    - **Location:** `backend/services/reminderService.js`, `backend/utils/mailer.js`
    - **Issue:** `reminderService` has no distributed locking, causing duplicate alerts on multi-instance setups. Emails are simulated via `console.log` in production without error alerts.
    - **Remediation:** Implement distributed lock document in MongoDB. Send real HTML emails for 24h/1h reminders, cancellations, refunds, feedback notifications, and payout updates. Throw clear 503 / configuration errors when SMTP is missing in production.

17. **O2: Avatar Base64 Payloads**
    - **Location:** `backend/routes/userRoutes.js`, `src/pages/Profile.jsx`
    - **Issue:** Allows raw base64 data URIs for user avatars, bloating database storage and bypassing content checks.
    - **Remediation:** Restrict avatar updates to multipart form uploads (Multer memory storage + Cloudinary/S3). Validate MIME types (JPEG, PNG, WebP) and size (<= 2MB).

18. **O3: Missing Environment Validation**
    - **Location:** `backend/server.js`, `backend/.env.example`
    - **Issue:** Backend boots without verifying whether required secrets and configurations are present.
    - **Remediation:** Add comprehensive Zod startup environment validator that logs exact missing keys and terminates execution with `process.exit(1)` in production.

19. **O4: Unbounded Queries Across All Collections**
    - **Location:** All list endpoints (`/api/users`, `/api/interviews`, `/api/payment/history`, `/api/notifications`, `/api/admin/users`)
    - **Issue:** Endpoints return entire collections without pagination, risking denial of service and memory exhaustion.
    - **Remediation:** Implement mandatory pagination (`page`, `limit`, `total`) and supporting compound MongoDB indexes.

20. **O5 & X1: AI Evaluation Safety & Fake Prompt Fallbacks**
    - **Location:** `backend/routes/aiInterviewRoutes.js:75-140`
    - **Issue:** Interpolates raw candidate text into prompts without sanitization. Returns hardcoded default scores (`|| 75`). Hardcodes a dummy AI user in MongoDB.
    - **Remediation:** Sanitize resume text and answers. Use delimiters. Enforce structured schema validation for model JSON outputs. Remove dummy user hack. Return 503 when AI keys are unconfigured.

---

### Static Data & Frontend Bugs (H-Series & X-Series)

21. **H1: Hardcoded Demo Credentials in Professional Login**
    - **Location:** `src/pages/ProfessionalLogin.jsx:240-290`
    - **Issue:** Displays "Quick Verified Professional Accounts" button for `shushant@example.com` and `raju@example.com`.
    - **Remediation:** Completely remove the demo accounts UI block.

22. **H2: Hardcoded Profile Overrides in Dashboard**
    - **Location:** `src/pages/Dashboard.jsx:215-225`
    - **Issue:** Overrides names and companies based on hardcoded string checks (`'Shushant'`, `'Cognizant'`, `'Batch 3'`).
    - **Remediation:** Display real profile values directly from database or omit empty fields cleanly.

23. **H3, H4 & X13: Hardcoded Assets, Questions & STUN in VideoRoom**
    - **Location:** `src/pages/VideoRoom.jsx`, `backend/routes/interviewRoutes.js`
    - **Issue:** Contains hardcoded Google STUN servers, `/rahul-sharma.jpg` poster, hardcoded topic questions, and unrestricted room access.
    - **Remediation:** Pull ICE configuration and PeerJS config dynamically from backend `/api/interviews/:id/room-access` based on env (`TURN_URL`, `STUN_URLS`). Enforce time-windowed signed room access token. Fetch topic questions from `InterviewConfig`. Replace poster with shared `<Avatar/>`. Delete unused demo image assets.

24. **X7: Interviews.jsx Broken Navigation Route**
    - **Location:** `src/pages/Interviews.jsx:110`
    - **Issue:** `navigate('/booking/cancel/' + id)` triggers a 404 because `App.jsx` specifies path `/booking/cancel`.
    - **Remediation:** Update navigation to `/booking/cancel?interviewId=${id}` and wire `CancelBooking.jsx` to pre-select that booking.

25. **X10: Profile.jsx ReferenceError on `currentUserId`**
    - **Location:** `src/pages/Profile.jsx:92`
    - **Issue:** Uses `currentUserId` instead of `currentUser?._id`, causing a runtime crash. Also displays hardcoded fake time slots.
    - **Remediation:** Fix variable reference to `currentUser?._id`. Fetch real availability slots or show empty state.

26. **X11: Availability Reschedule Slot Release Race Condition**
    - **Location:** `backend/routes/availabilityRoutes.js:140`
    - **Issue:** Atomic reschedule books the new slot, but then releases slots matching `interview._id`, which accidentally releases the newly booked slot.
    - **Remediation:** Ensure atomic slot swap using the old slot's explicit ID.

---

## 3. Action Plan & Traceability

All 53 items (S1–S7, P1–P9, F1–F4, O1–O7, H1–H9, T1, D1–D12, G1–G7, X1–X13) are documented in `TRACKER.md`. Execution proceeds phase by phase with automated tests and zero skipped items.
