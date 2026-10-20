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
| [ ] | F1 | Pending | | |
| [ ] | F2 | Pending | | |
| [ ] | F3 | Pending | | |
| [ ] | F4 | Pending | | |
| [ ] | O1 | Pending | | |
| [ ] | O2 | Pending | | |
| [ ] | O3 | Pending | | |
| [ ] | O4 | Pending | | |
| [ ] | O5 | Pending | | |
| [ ] | O6 | Pending | | |
| [ ] | O7 | Pending | | |
| [ ] | H1 | Pending | | |
| [ ] | H2 | Pending | | |
| [ ] | H3 | Pending | | |
| [ ] | H4 | Pending | | |
| [ ] | H5 | Pending | | |
| [ ] | H6 | Pending | | |
| [ ] | H7 | Pending | | |
| [ ] | H8 | Pending | | |
| [ ] | H9 | Pending | | |
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
| [ ] | X7 | Pending | | |
| [ ] | X8 | Pending | | |
| [ ] | X9 | Pending | | |
| [ ] | X10 | Pending | | |
| [ ] | X11 | Pending | | |
| [ ] | X12 | Pending | | |
| [ ] | X13 | Pending | | |

NEXT: P1
