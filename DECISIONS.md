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

