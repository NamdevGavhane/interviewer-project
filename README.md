# 🎯 InterviewPro - Full Stack Mock Interview Platform

An end-to-end full-stack platform for technical mock interviews, AI interview preparation, expert bookings, Razorpay & Unified UPI payments, automated feedback analytics, and platform administration.

---

## 🏛️ System Architecture & Module Hierarchy

```text
InterviewPro
|
├── Authentication Module
|   ├── Register
|   ├── Login
|   └── Logout
|
├── User Module
|   ├── Profile
|   ├── Dashboard
|   └── Interview History
|
├── Professional Module
|   ├── Professional Profile
|   ├── Availability
|   └── Earnings
|
├── Interview Module
|   ├── AI Mock Interview
|   ├── Professional Interview
|   └── Interview Feedback
|
├── Booking Module
|   ├── Book Interview
|   └── Cancel Booking
|
├── Payment Module
|   ├── Make Payment
|   └── Payment History
|
└── Admin Module
    ├── Manage Users
    ├── Verify Professionals
    └── Manage Bookings
```

---

## 📦 Detailed Module Specifications

### 1. 🔐 Authentication Module
- **Register**: User onboarding for Candidates and Professionals with role specification.
- **Login**: Email/password authentication and Google OAuth 2.0 direct sign-in.
- **Logout**: Session termination, local state reset, and secure redirection.

### 2. 👤 User Module
- **Profile**: Manage candidate developer profile, bio, skills, target companies, and avatar.
- **Dashboard**: Central dynamic command center displaying upcoming sessions, performance stats, and architecture explorer.
- **Interview History**: Chronological archive of all past mock interview sessions, status filters, and recordings.

### 3. 💼 Professional Module
- **Professional Profile**: Expert credentials, current employer, years of experience, hourly/per-session rate (₹), and verification badge.
- **Availability**: Interactive 45-minute slot management tool with presets and custom availability scheduling.
- **Earnings**: Comprehensive revenue analytics, gross earned, pending payouts, platform fee breakdown, and transaction logs.

### 4. 🎙️ Interview Module
- **AI Mock Interview**: Real-time AI interviewer with speech recognition, question prompts, resume context, and automated scoring.
- **Professional Interview**: 1-on-1 WebRTC video call room with real-time video/audio, whiteboard/code editor, and live chat.
- **Interview Feedback & Q&A PDF Report**: Granular performance assessment report featuring questions asked by HR and candidate answers, score breakdowns (Technical, Communication, Relevance), actionable improvement recommendations, and 1-click official **jsPDF** downloadable evaluation report.

### 5. 📅 Booking Module
- **Book Interview**: Search verified interviewers, select preferred date and time slot, specify mock interview topics, and lock reservations.
- **Cancel Booking**: Hassle-free booking cancellation workflow with reason tracking, refund policy compliance, and automated slot release.

### 6. 💳 Payment Module
- **Make Payment**: Integrated Razorpay & Unified UPI payment gateway simulation with PCI-DSS compliance, dynamic platform fees, and signature verification.
- **Payment History**: Tax invoice ledger with one-click **jsPDF** official invoice downloads, transaction IDs, and payment audit logs.

### 7. 🛡️ Admin Module
- **Manage Users**: Super-admin directory to oversee candidates, professionals, and administrators with role-elevation and account moderation.
- **Verify Professionals**: Verification portal to evaluate interviewer credentials and toggle official verified expert badges.
- **Manage Bookings**: Platform-wide booking oversight with status override (scheduled / completed / cancelled).

---

## 🚀 Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, React Router 6, Lucide Icons, jsPDF, Vanilla CSS Design System |
| **Backend** | Node.js, Express.js 5, RESTful APIs, Multer, Crypto |
| **Database** | MongoDB (Mongoose ODM) |
| **Payments** | Razorpay SDK & UPI Gateway Integration |
| **AI Engine** | LLM API, Web Speech API (STT & TTS) |

---

## 🛠️ Getting Started

### 1. Start Backend API
```bash
cd backend
npm install
npm run dev
# Server runs on http://localhost:5000
```

### 2. Start Frontend Application
```bash
npm install
npm run dev
# Application runs on http://localhost:5173
```

---

## 🌐 API Route Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/users/login` | `POST` | User authentication |
| `/api/users/register` | `POST` | User registration |
| `/api/users/:id/earnings` | `GET` | Professional earnings and session ledger |
| `/api/interviews` | `POST` / `GET` | Book and retrieve interview sessions |
| `/api/interviews/:id/status` | `PATCH` | Update status (scheduled/completed/cancelled) |
| `/api/payment/create-order` | `POST` | Create Razorpay order |
| `/api/payment/verify-and-book` | `POST` | Verify payment & finalize booking |
| `/api/payment/history` | `GET` | Retrieve transactions & invoice records |
| `/api/admin/stats` | `GET` | Platform-wide analytics |
| `/api/admin/users` | `GET` | Manage users list |
| `/api/admin/users/:id/verify`| `PATCH` | Toggle verified professional status |
| `/api/admin/bookings` | `GET` | Oversee global interview bookings |
