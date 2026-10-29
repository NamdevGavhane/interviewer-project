# DevSphere Production Deployment Runbook & Checklist

This document details the exact, step-by-step procedures and required configuration parameters for deploying the DevSphere platform to production on **Render** (Backend API & Background Workers) and **Vercel / Render** (Frontend React 19 SPA).

---

## 1. MongoDB Atlas Setup & Database Hardening

1. **Create Atlas Cluster**:
   - Create an M0 (Free Tier) or M10+ dedicated cluster on AWS/GCP.
   - Database Name: `devsphere_prod`.
2. **Database User**:
   - Create a dedicated database user with `readWrite` role on `devsphere_prod`.
   - Use a high-entropy password (do not use special characters that break URI encoding unless encoded).
3. **Network Access / IP Allowlist**:
   - Navigate to **Security** -> **Network Access**.
   - Because Render dynamic web services use dynamic IP ranges from AWS, add `0.0.0.0/0` (Allow Access from Anywhere) protected by strict username and password credentials.
   - Connection string format:
     ```
     mongodb+srv://<username>:<password>@<cluster>.mongodb.net/devsphere_prod?retryWrites=true&w=majority
     ```

---

## 2. Backend Deployment on Render (Web Service)

1. **Create New Web Service**:
   - Connect your GitHub repository.
   - **Name**: `devsphere-api`
   - **Environment**: `Node`
   - **Region**: Choose closest to target users (e.g., `Singapore` or `Frankfurt`).
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
2. **Configure Health Check Path**:
   - In Render **Settings** -> **Health Check Path**, enter: `/health`.
   - Render will verify that MongoDB is fully connected (HTTP 200) before routing live production traffic to newly provisioned containers.
3. **Environment Variables on Render**:

| Variable Name | Required | Description / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | `production` |
| `PORT` | Auto | Render sets this automatically (e.g. `10000`). Express listens to `process.env.PORT`. |
| `MONGO_URI` | **Yes** | `mongodb+srv://.../devsphere_prod?retryWrites=true&w=majority` |
| `JWT_SECRET` | **Yes** | Min 32 chars random string. Example: `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | **Yes** | Min 32 chars random string (**must differ from `JWT_SECRET`**). |
| `FRONTEND_URL` | **Yes** | `https://devsphere.vercel.app` (Exact HTTPS frontend domain, no trailing slash). |
| `ADMIN_INVITATION_SECRET` | **Yes** | Secret seed token for generating or inviting platform administrators. |
| `RAZORPAY_KEY_ID` | **Yes** | `rzp_live_xxxxxxxxxxxxxx` (from Razorpay Dashboard). |
| `RAZORPAY_KEY_SECRET` | **Yes** | Secret matching your live Razorpay Key ID. |
| `RAZORPAY_WEBHOOK_SECRET` | **Yes** | Custom webhook secret defined in Razorpay webhook configuration. |
| `SMTP_HOST` | **Yes** | e.g. `smtp.gmail.com` or `smtp.sendgrid.net`. |
| `SMTP_PORT` | **Yes** | `587` (TLS) or `465` (SSL). |
| `SMTP_USER` | **Yes** | Email address or API key username. |
| `SMTP_PASS` | **Yes** | App password (for Gmail 2FA) or SMTP API key. |
| `SMTP_FROM` | **Yes** | `DevSphere <no-reply@devsphere.io>`. |
| `GEMINI_API_KEY` | Optional* | Google AI Studio Gemini API Key. |
| `GEMINI_MODEL` | Optional | `gemini-1.5-flash` (or newer Gemini model). |
| `OPENAI_API_KEY` | Optional* | OpenAI API Key (at least one AI key required). |
| `OPENAI_MODEL` | Optional | `gpt-4o-mini`. |
| `CLOUDINARY_CLOUD_NAME` | **Yes** | Cloudinary account cloud name. |
| `CLOUDINARY_API_KEY` | **Yes** | Cloudinary API Key. |
| `CLOUDINARY_API_SECRET` | **Yes** | Cloudinary API Secret. |
| `TURN_SERVER_URLS` | **Yes** | WebRTC TURN server relay URL (e.g., `turn:turn.metered.ca:443?transport=tcp`). |
| `TURN_USERNAME` | **Yes** | TURN authentication username. |
| `TURN_CREDENTIAL` | **Yes** | TURN authentication credential/password. |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth 2.0 Web Client ID. |

---

## 3. First-Time Database Seeding (Admin User & Default Settings)

After your Render backend finishes its initial deployment, execute the idempotent database seed script via the **Render Shell** tab or a local terminal targeting the production database:

```bash
# In Render Shell or terminal with production env vars:
ADMIN_EMAIL="admin@devsphere.io" ADMIN_PASSWORD="YourSecureAdminPassword123!" node seed.js
```

**What this seeds**:
1. Default platform settings: Session price (in paise), interviewer share (70%), min payout, hold days, join grace window.
2. Interview configurations: Dynamic seniority tiers, topic categorizations, and company filters.
3. Super Administrator user account with `admin` role, `approved` status, and verified email.

---

## 4. Razorpay Webhook Configuration

1. Log into your **Razorpay Dashboard** (Live Mode).
2. Go to **Settings** -> **Webhooks** -> **Add New Webhook**.
3. **Webhook URL**: `https://<your-render-backend-url>/api/payment/webhook`
4. **Secret**: Enter a strong random secret. Copy this value and set it as `RAZORPAY_WEBHOOK_SECRET` in Render.
5. **Active Events**: Check the following three events:
   - `payment.captured`
   - `payment.failed`
   - `refund.processed`
6. Save the webhook.

---

## 5. Google OAuth 2.0 Credentials

1. Go to the **Google Cloud Console** -> **APIs & Services** -> **Credentials**.
2. Select your OAuth 2.0 Client ID (Application type: *Web application*).
3. **Authorized JavaScript origins**:
   - `https://devsphere.vercel.app` (your production frontend domain)
   - `https://<your-custom-domain.com>`
4. **Authorized redirect URIs**:
   - `https://devsphere.vercel.app`
5. Copy the Client ID and configure `GOOGLE_CLIENT_ID` in backend and `VITE_GOOGLE_CLIENT_ID` in frontend.

---

## 6. TURN Server Relay Setup (WebRTC)

WebRTC direct peer-to-peer streaming fails across ~15-20% of residential/mobile networks due to symmetric NAT and corporate firewalls. A TURN relay is mandatory for production video rooms.

1. **Option A (Metered.ca - Recommended)**:
   - Sign up at [metered.ca](https://www.metered.ca/tools/openrelay/).
   - Obtain your TURN server URL, username, and credential.
2. **Option B (Twilio Network Traversal)**:
   - Create a Twilio Network Traversal token service.
3. Set `TURN_SERVER_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL` in the backend environment variables. The backend securely dispenses short-lived ICE credentials to authorized participants when joining `/room`.

---

## 7. Frontend Deployment on Vercel / Render Static

1. **Import Project into Vercel**:
   - Framework Preset: **Vite**
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `dist`
2. **Configure Environment Variables in Vercel Project Settings**:

| Variable Name | Value |
| :--- | :--- |
| `VITE_API_URL` | `https://devsphere-api.onrender.com` (Your Render backend URL, no trailing slash) |
| `VITE_GOOGLE_CLIENT_ID` | `xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com` |
| `VITE_RAZORPAY_KEY_ID` | `rzp_live_xxxxxxxxxxxxxx` |
| `VITE_PEER_HOST` | Leave empty to use default PeerJS cloud, or specify custom PeerServer host |
| `VITE_PEER_PORT` | `443` |
| `VITE_PEER_PATH` | `/` |
| `VITE_PEER_SECURE` | `true` |

3. **SPA Routing**:
   - [vercel.json](file:///c:/Users/namde/OneDrive/Documents/Interviewer%20Project/vercel.json) is preconfigured with the wildcard rewrite `{"source": "/(.*)", "destination": "/index.html"}` to support HTML5 pushState routing.

---

## 8. Post-Deployment Verification & Smoke Tests

1. **Health Check**:
   - Open `https://<your-backend-url>/health` in browser.
   - Expect: HTTP 200 with `{"success": true, "status": "healthy", "database": "connected"}`.
2. **Admin Login**:
   - Open frontend `/login`.
   - Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
   - Verify access to `/admin` dashboard and platform settings.
3. **Professional Flow**:
   - Register a professional account or approve one via `/admin`.
   - Log in, navigate to `/professional/availability`, and publish 3 calendar slots.
4. **Candidate Flow**:
   - Log in as a candidate.
   - Book a session via `/booking`. Verify Razorpay checkout modal opens with correct session fee and GST.
5. **Video Room & Peer Connectivity**:
   - Navigate to `/room?interviewId=<id>&role=candidate` on one browser window and role=professional in another window.
   - Confirm video/audio streams connect, mute toggles operate cleanly, and closing a tab triggers clean track teardown without camera locks.
