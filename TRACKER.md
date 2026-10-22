# TRACKER

| Checkbox | ID | Status | File(s) Changed | Proof |
| :---: | :--- | :--- | :--- | :--- |
| [x] | S1 | CODE WRITTEN, TESTS NOT RUN | backend/models/User.js, backend/routes/userRoutes.js, backend/routes/adminRoutes.js, backend/scripts/migrateTokens.js | SHA-256 token hashing implemented, select:false + toJSON transform added, allow-list on public fields, paginated /api/users, migrateTokens.js created. |
| [x] | S2 | Done | backend/server.js, backend/seed.js, backend/clean.js | Fallbacks removed, process.exit(1) if JWT_SECRET/REFRESH < 32 chars, seed.js requires ADMIN_EMAIL & PASSWORD (min 12 chars), clean.js requires --confirm and blocks prod. |
| [x] | S3 | Done | backend/server.js | CORS strictly limited to comma-separated FRONTEND_URL origins, permissive fallback removed. |
| [x] | S4 | Done | backend/routes/interviewRoutes.js, backend/middleware/rateLimiter.js | Ownership enforced (candidate/interviewer/admin), sender derived from req.user, 2000 char cap, chatLimiter added. |
| [x] | S5 | Done | backend/middleware/auth.js, backend/tests/s5_middleware.test.js | ReferenceError fixed (req.user.accountStatus), all 10 branches tested and passing (10/10 in Jest). |
| [x] | S6 | Done | src/context/AuthContext.jsx, src/utils/apiClient.js, src/pages/AcceptInvitation.jsx, src/pages/VideoRoom.jsx, DECISIONS.md | localStorage userRole/userId writes removed, role derived solely from /api/users/me, raw fetch replaced with apiClient, token decision documented. |
| [x] | S7 | Done | backend/server.js, backend/middleware/validateObjectId.js, backend/utils/asyncHandler.js, backend/routes/*.js | 1MB global express.json limit, Helmet CSP for SPA/Razorpay/Google, base64 avatars rejected, validateObjectId applied on ObjectId routes. |
| [x] | P1 | Done | backend/routes/interviewRoutes.js | Direct unpaid POST /api/interviews strictly blocked for paid sessions; free sessions require slotId & generate invoice; room-access gated by paymentStatus and timing window. |
| [x] | P2 | Done | backend/routes/paymentRoutes.js, backend/services/availabilityService.js, backend/models/Availability.js, backend/models/PendingBooking.js | create-order requires slotId, validates interviewer rate, creates PendingBooking with TTL, and atomically reserves slot for 15 min. |
| [x] | P3 | Done | backend/routes/paymentRoutes.js, backend/tests/p_series_payments.test.js | verify-and-book uses crypto.timingSafeEqual, derives date/slotLabel strictly from slot doc, idempotent on duplicate replay. Tested & passing in Jest (12/12). |
| [x] | P4 | Done | backend/routes/paymentRoutes.js | Webhook uses timingSafeEqual on raw payload, auto-finalizes PendingBooking on payment.captured if client dropped off, releases slot on payment.failed. |
| [x] | P5 | Done | backend/services/refundService.js, backend/routes/interviewRoutes.js, backend/routes/paymentRoutes.js | Unified refund processor enforcing Settings.refundWindowHours; distinguishes candidate vs interviewer/admin cancellations; releases slot automatically. |
| [x] | P6 | Done | backend/routes/paymentRoutes.js, backend/routes/adminRoutes.js, backend/models/Payout.js, backend/models/Settings.js, src/pages/admin/AdminDashboard.jsx, src/pages/professional/Earnings.jsx | Net balance subtracts platform commission, enforces Settings.payoutHoldDays, validates bank details, admin approval console & API endpoints implemented. |
| [x] | P7 | Done | backend/routes/paymentRoutes.js, backend/models/PendingBooking.js, backend/tests/p_series_payments.test.js | Server-side pricing calculation source of truth; client fee overrides discarded; frozen in PendingBooking. Tested in Jest. |
| [x] | P8 | Done | backend/services/availabilityService.js, backend/tests/p_series_payments.test.js | Luxon DateTime interprets AvailabilityRule in rule.timezone, generating exact UTC instants without server local drift. Tested for Asia/Kolkata & America/New_York. |
| [x] | P9 | Done | src/utils/invoiceGenerator.js, backend/models/Payment.js, backend/models/Counter.js | Removed INV-OFFICIAL fallback and client recalculations; requires verified immutable Payment fields (invoiceNumber, sessionFee, platformFee, gstAmount, amount). |
| [x] | F1 | Done | backend/models/Review.js, backend/routes/reviewRoutes.js, backend/routes/feedbackRoutes.js, src/pages/FeedbackReport.jsx, backend/tests/f_series_feedback.test.js | Decoupled candidate score from interviewer rating; created Review model, /api/reviews routes, star rating computed strictly from reviews average, added candidate rating card on FeedbackReport. |
| [x] | F2 | Done | backend/routes/feedbackRoutes.js, backend/tests/f_series_feedback.test.js | Timing and status gates enforced: feedback rejected before session startTime or if cancelled, restricted to assigned interviewer/admin. |
| [x] | F3 | Done | backend/routes/feedbackRoutes.js, backend/routes/interviewRoutes.js, backend/tests/f_series_feedback.test.js | Server-controlled interview completion: status transitioned to 'completed' with completedAt timestamp on evaluation submission or authorized post-session close. |
| [x] | F4 | Done | backend/routes/feedbackRoutes.js, backend/models/Feedback.js, backend/tests/f_series_feedback.test.js | Unique compound index on Feedback.interviewId; in-app notification automatically generated and sent to candidate on feedback publication. |
| [x] | O1 | Done | backend/models/JobLock.js, backend/services/reminderService.js, backend/models/Interview.js, backend/routes/paymentRoutes.js, backend/services/refundService.js, backend/tests/o_series_operations.test.js | Multi-instance distributed locking via JobLock; 24h & 1h reminder sweep with atomic reservation claim; real emails & in-app alerts dispatched for booking confirmation, reminders, cancellation, and refund. |
| [x] | O2 | Done | backend/utils/avatarUpload.js, backend/routes/userRoutes.js, src/pages/Profile.jsx, backend/scripts/migrateAvatars.js | Multer memory storage (<=2MB, JPEG/PNG/WebP), Cloudinary stream upload, POST /api/users/avatar endpoint, Profile.jsx upload UI wired, migrateAvatars.js created. |
| [x] | O3 | Done | backend/config/envValidator.js, backend/server.js, backend/.env.example, .env.example | Zod startup env validator halts production with process.exit(1) on missing required secrets; comprehensive backend & frontend .env.example files maintained. |
| [x] | O4 | Done | backend/utils/pagination.js, backend/routes/interviewRoutes.js, backend/routes/paymentRoutes.js, backend/routes/notificationRoutes.js, backend/routes/adminRoutes.js, backend/models/*.js | getPagination helper enforces page/limit bounds; all list endpoints (/interviews, /payment/history, /payouts, /notifications, /admin/users, /admin/bookings, /admin/payouts) paginated with compound indexes. |
| [x] | O5 | Done | backend/routes/aiInterviewRoutes.js, backend/tests/o_series_operations.test.js | Candidate inputs sanitized and wrapped in protective delimiters; Zod schemas validate AI JSON outputs; retries with exponential backoff; all hardcoded || 75 scores removed; returns 503 if AI unconfigured. |
| [x] | O6 | Done | backend/utils/mailer.js, backend/tests/o_series_operations.test.js | Complete transactional HTML email templates for confirmations, reminders, cancellations, refunds, feedback publications, and payout updates; fails with 503 in production if SMTP absent. |
| [x] | O7 | Done | src/layouts/SidebarLayout.jsx, backend/routes/notificationRoutes.js | Bell dropdown wired to /api/notifications with 30s background polling, unread count badge, mark-as-read, and mark-all-read. |
| [x] | H1 | Done | src/pages/ProfessionalLogin.jsx | Removed "Quick Demo Credentials Helper" block containing hardcoded demo logins (shushant@example.com, raju@example.com). |
| [x] | H2 | Done | src/pages/Dashboard.jsx | Removed hardcoded string checks ('Shushant', 'Cognizant', 'Batch 3') and replaced with genuine dynamic company and domain properties. |
| [x] | H3 | Done | src/pages/VideoRoom.jsx | Replaced hardcoded /rahul-sharma.jpg poster with dynamic Avatar standby container, removed 'Batch 3' check from partnerTitle. |
| [x] | H4 | Done | backend/routes/interviewRoutes.js | Configured WebRTC ICE servers dynamically via ICE_SERVERS, STUN_URL, and TURN_URL environment variables with fallback. |
| [x] | H5 | Done | public/, src/assets/ | Deleted all unused mock demo image assets (namdev-admin.*, namdev-upi-qr.png, shushant-gaikwad.png, raju-bojane.png, rahul-sharma.jpg, ml-developer.png). |
| [x] | H6 | Done | backend/seed.js | Ensured idempotent seeding of Settings, InterviewConfig, and super-admin with DevSphere Core branding. |
| [x] | H7 | Done | src/pages/Login.jsx, src/layouts/SidebarLayout.jsx, src/utils/*.js | Audited and rebranded platform name across the codebase to DevSphere, replaced hardcoded avatar references. |
| [x] | H8 | Done | src/pages/Interviews.jsx, src/pages/Dashboard.jsx | Verified loading, empty, and error states for list endpoints. |
| [x] | H9 | Done | README.md | Rebranded architecture and setup documentation to DevSphere. |
| [ ] | T1 | Pending | | |
| [ ] | D1 | Pending | | |
| [ ] | D2 | Pending | | |
| [ ] | D3 | Pending | | |
| [ ] | D4 | Pending | | |
| [ ] | D5 | Pending | | |
| [ ] | D6 | Pending | | |
| [ ] | D7 | Pending | | |
| [ ] | D8 | Pending | | |
| [ ] | D9 | Pending | | |
| [ ] | D10 | Pending | | |
| [ ] | D11 | Pending | | |
| [ ] | D12 | Pending | | |
| [ ] | G1 | Pending | | |
| [ ] | G2 | Pending | | |
| [ ] | G3 | Pending | | |
| [ ] | G4 | Pending | | |
| [ ] | G5 | Pending | | |
| [ ] | G6 | Pending | | |
| [ ] | G7 | Pending | | |
| [ ] | X1 | Pending | | |
| [ ] | X2 | Pending | | |
| [ ] | X3 | Pending | | |
| [ ] | X4 | Pending | | |
| [ ] | X5 | Pending | | |
| [ ] | X6 | Pending | | |
| [x] | X7 | Done | src/pages/Interviews.jsx, src/pages/booking/CancelBooking.jsx | Fixed 404 cancel navigation to use query parameter ?interviewId= and wired CancelBooking.jsx to auto-select matching booking. |
| [ ] | X8 | Pending | | |
| [ ] | X9 | Pending | | |
| [x] | X10 | Done | src/pages/Profile.jsx | Fixed currentUserId ReferenceError by referencing currentUser?._id; replaced fake time slot fallbacks with empty state. |
| [ ] | X11 | Pending | | |
| [ ] | X12 | Pending | | |
| [ ] | X13 | Pending | | |
| [x] | M1 | Done | backend/models/Settings.js, backend/models/PendingBooking.js, backend/models/Interview.js, backend/models/Payment.js, backend/routes/configRoutes.js, backend/routes/settingsRoutes.js, backend/routes/paymentRoutes.js, backend/routes/userRoutes.js, backend/routes/interviewRoutes.js, src/pages/Booking.jsx, src/components/PaymentModal.jsx, src/pages/Profile.jsx, src/pages/Dashboard.jsx, src/pages/admin/AdminDashboard.jsx, src/pages/professional/Earnings.jsx | Fixed session price Rs 50 (5000 paise) stored strictly in Settings; interviewer gets 70% (3500 paise); GET /api/config/public serves pricing; create-order & verify-and-book enforce server price and reject mismatches; min payout threshold (30000 paise) enforced; removed hourlyRate inputs and tags across frontend and backend. |
| [x] | M2 | Done | backend/services/sessionLifecycleService.js, backend/routes/interviewRoutes.js, backend/server.js, src/pages/VideoRoom.jsx, backend/tests/m2_lifecycle.test.js | 10-minute hold release on pending bookings; room access strictly [startTime-10m, endTime+15m] returning 403 "session ended"; media tracks torn down on frontend; auto-status worker running every minute with JobLock (interviewer_no_show with auto refund, candidate_no_show with retained earnings, completed, expired); joinedAt tracked for participants; client PATCH completed blocked with 403; unbooked past slots hidden and pruned after 7 days. Verified with 9/9 tests in m2_lifecycle.test.js. |
| [ ] | M3 | Pending | | |

NEXT: M3


