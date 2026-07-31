# BazaarHub — ST6005CEM Security Coursework: Project Details Pack

> Paste this whole document to Claude (web) and ask it to write the security report
> following the ST6005CEM structure (Abstract → Introduction & System Design →
> Software Details → Security by Design → Checklist → Making BazaarHub Secure
> (E1 Password, E2 Audit Trail, E3 Authentication & RBAC, E4 Session Management,
> E5 Encryption, E6 Extra Security) → Conclusion → References → Appendix).
> Everything below is factual and drawn from the actual codebase.

---

## 0. Submission identity (fill in your own)
- **Module:** ST6005CEM Security · Coventry University (in collaboration with Softwarica College of IT & E-commerce)
- **Application name:** BazaarHub
- **Student name / CU ID / Module leader:** *(fill in yours)*
- **GitHub repo:** https://github.com/RojanShrestha77/baazarhub
- **Commits:** 111 (well past the 40-commit minimum), with incremental security improvements and a Phase-4 pentest re-review mapped to commits.

---

## 1. What BazaarHub is (Introduction / problem)
BazaarHub is a **secure, multi-seller online marketplace** (a Daraz/Amazon-style platform where people buy and sell anything). It supports buyers, sellers, and admins, with **escrow-backed payments**, **tiered seller verification**, and a **defense-in-depth security posture**.

**Problem it solves:** buying from strangers online is risky — buyers can be scammed, sellers can be cheated. BazaarHub reduces this with **escrow** (the platform holds payment until the buyer confirms delivery), **seller KYC verification tiers**, and **transparent dispute/return resolution**. Because it processes real transactions and personal data, security is central.

**Why security matters here (framing for the report):** the CIA triad (confidentiality, integrity, availability); a publicly reachable web app is exposed to XSS, CSRF, injection, IDOR, brute-force, and business-logic attacks; data-protection principles (GDPR-style data minimisation, export, and erasure).

---

## 2. System design / architecture
```
Browser
  → Frontend  (Next.js 15, React 19)      http://localhost:3000
      → Backend API (Node.js / Express)   http://localhost:5000/api
          → MongoDB (Mongoose ODM)         :27017  (auth-required)
          → MailHog (dev SMTP catcher)     :8025   / Gmail SMTP (real mail)
  All orchestrated with Docker Compose (reproducible environments).
```
- **Backend-first approach:** the API + database were built and rigorously unit/integration-tested first, then the frontend, ensuring business logic is correct and security is enforced server-side (never trusting the client).
- **Decoupled origins:** frontend (:3000) and API (:5000) are separate origins; CORS is credentialed and origin-restricted.

---

## 3. Software details & dependencies (exact, from package.json)

**Backend (Node.js / Express / TypeScript):**
`express@4.19`, `mongoose@8.4`, `argon2@0.41` (password hashing), `zod@3.23` (input validation), `helmet@7.1` (security headers/CSP), `cors@2.8`, `cookie-parser`, `morgan` (redacted request logging), `express-rate-limit@7.4`, `otplib@12` (TOTP MFA), `nodemailer@9` (email), `stripe@17.7`, `multer@2.2` + `sharp@0.35` + `file-type@16.5` (secure image uploads), `uuid`, `dotenv`.
Payments also integrate **Khalti** (Nepali gateway) via the built-in `fetch` (no extra dependency).

**Backend dev/test:** `jest@29`, `ts-jest`, `supertest@7`, `mongodb-memory-server@9`, `ts-node`, `nodemon`, `typescript@5.5`, `eslint@9`.

**Frontend (Next.js):**
`next@15`, `react@19`, `react-dom@19`, `tailwindcss@4` (`@tailwindcss/postcss`), `framer-motion@12`, `lucide-react`, `react-hot-toast`, `typescript@5.7`.

**Testing:** 45 test files, **348 automated tests across 44 suites** (Jest + supertest + in-memory MongoDB). All green.

---

## 4. Security-by-design principles (report section)
- **OWASP Top 10 alignment:** access control (IDOR/BOLA, RBAC), cryptographic storage, injection (NoSQL), insecure design, security misconfiguration, identification & auth failures, SSRF/logging.
- **Structural least-privilege ("authz router"):** a custom `createAuthzRouter` **refuses to register any route that doesn't declare an authorization gate** (`PUBLIC`, `requireSession`, `requireRole(...)`, `requireOwnership(...)`, etc.) — every `router.get/post/put/patch/delete` call is intercepted and throws at import time if the 2nd argument isn't a valid gate. This makes "forgot to protect a route" a **startup error**, not a runtime hole. Applied with zero exceptions — even the health check (`GET /api/health`) and root route go through the same router with an explicit `PUBLIC` declaration, so there's no special-cased bypass anywhere in the route table. *(Files: `backend/src/lib/authzRouter.ts`, `backend/src/middlewares/authz.ts`, `backend/src/routes/meta.routes.ts`)*
- **Threat model & decisions:** documented design decisions (server-side sessions over JWT, Argon2id, timing-parity in auth, redacted logs). *(File: `docs/security-decisions.md`)*
- **Fail safe / generic errors:** a central error handler returns `{ "error": "Internal server error" }` — never a stack trace or internal detail. *(File: `backend/src/app.ts`)*
- **Redacted logging:** a `wrapConsoleError` + redacting morgan formatter strip passwords/tokens/secrets/cookies from logs. *(File: `backend/src/lib/redact.ts`, `backend/src/app.ts`)*
- **CORS:** credentialed, never wildcard; only the configured origin + localhost in dev. *(File: `backend/src/app.ts`)*
- **Reproducibility & CI:** Docker Compose; GitHub Actions concept for CodeQL/Semgrep/Trivy/gitleaks (documented in the pentest report's Automated Supplementary section).

---

## 5. Security features — the checklist (mapped to coursework E1–E6)

### E1) Password
- **Hashing:** **Argon2id** (memory-hard, GPU-resistant), tuned cost. A pre-warmed dummy hash gives **timing parity** so login can't reveal whether an email exists. *(Files: `backend/src/services/password.service.ts`, `backend/src/controllers/auth.controller.ts` `login`)*
- **Policy (length-first, ASVS V2.1 / NIST 800-63B):** the only hard rule is **8–128 characters** — no forced composition (uppercase/number/symbol), which is the modern OWASP/NIST stance (forced-composition rules produce predictable passwords like `Password1!`). Enforced with a Zod schema **server-side** and mirrored **client-side**. *(Files: `backend/src/validators/auth.schema.ts`, `backend/src/configs/security.ts` `PASSWORD_MIN_LENGTH`, frontend register/password pages)*
- **Reuse prevention:** last N password hashes kept in `passwordHistory`; `isPasswordReused` blocks reuse on change/reset. *(File: `backend/src/services/password.service.ts`, `user.model.ts`)*
- **Expiry:** `passwordChangedAt` + `isPasswordExpired` (90-day style policy). *(File: `password.service.ts`)*
- **Strength feedback:** a live 4-segment meter (Weak→Strong) on the register page rewards length and character variety **as guidance**, while showing only the real hard rule (8+ chars) as pass/fail — it never demands composition the server doesn't enforce. *(File: `frontend/src/app/(auth)/register/page.tsx` `assessPassword`)*
- **Brute-force / lockout:** **two layers** — per-account **exponential backoff** (`login-attempt.service.ts`, not a hard lock so it can't be weaponised as DoS) **and** per-IP **rate limiting** (`express-rate-limit`), plus **CAPTCHA** on register/login. *(Files: `backend/src/services/login-attempt.service.ts`, `backend/src/middlewares/rate-limiters.ts`, `backend/src/middlewares/captcha.ts`)*

### E2) Audit trail
- **Structured audit logging:** `logEvent` writes immutable `AuditLog` docs with `actor`, `action`, `outcome`, `subject`, `ip`, `userAgent`, `metadata`, `createdAt`. Authorization failures are logged separately (`logAuthzFailure`). Sensitive data is redacted; audit writes never break the request (fire-and-forget). *(Files: `backend/src/services/audit.service.ts`, `backend/src/models/audit-log.model.ts`)*
- **Admin log viewer:** admins can review logs from the dashboard. *(Files: `backend/src/routes/admin-logs.routes.ts`, frontend `/admin` logs tab)*
- Events logged include: register, login (success/failure), logout, MFA enrol/verify, password change/reset, seller application, tier change, escrow transitions (checkout/ship/deliver/dispute/release/cancel), verification submit/approve/reject, payouts.

### E3) User authentication & RBAC
- **Server-side sessions (not JWT):** a high-entropy random session token is issued, stored **hashed (SHA-256)** in the DB; the cookie holds only the raw token. Chosen over JWT deliberately (single API/DB, real revocation needed). *(Files: `backend/src/services/session.service.ts`, `backend/src/lib/sessionToken.ts`)*
- **MFA:** **TOTP** (authenticator apps via `otplib`) + **recovery codes**; replay-protected (last-used step); enrol/verify flow. Sensitive actions require an **MFA-verified** session. *(Files: `backend/src/services/totp.service.ts`, `recovery-code.service.ts`, `auth.controller.ts`)*
- **Passwordless option:** magic-link sign-in. *(File: `magic-link.service.ts`)*
- **Email verification gate:** buyers/sellers must verify their email (link-based) before checkout, selling, or messaging. *(Files: `email-verification.service.ts`, `middlewares/session.ts` `requireEmailVerified`)*
- **RBAC (least privilege):** two axes — **role** (buyer / seller / admin) and **seller tier** (unverified → verified → trusted). Gates: `requireRole`, `requireTier`, `requireMfaVerified`, `requireOwnership`. Read fresh from `req.user` every request so an admin change takes effect immediately. *(File: `backend/src/middlewares/authz.ts`)*
- **IDOR / BOLA defense:** ownership is resolved **server-side**; mismatches return **404 (not 403)** so resource IDs can't be enumerated (404-parity used across profiles, orders, returns, messaging, addresses, wishlist).
- **Mass-assignment / privilege-escalation defense:** `role`, `sellerTier`, `sellerApplicationStatus` are **never** settable from a request body — enforced at two layers (Zod `.strict()` whitelists + explicit field allow-lists at every write, never `...req.body`). *(Files: `user.model.ts` comments, `admin.service.ts`, `profile.service.ts`)*
- **Admin/user separation:** admin routes are separate, gated by `requireRole("admin")` **and** `requireMfaVerified`; a stolen pre-MFA admin session can't reach them. *(File: `backend/src/routes/admin.routes.ts`)*

### E4) Session management
- **Secure cookies:** `__Host-` prefix (forces Secure + Path=/ + no Domain), **HttpOnly**, **Secure**, **SameSite=Lax**. *(File: `backend/src/lib/cookies.ts`, `configs/security.ts`)*
- **Expiration & invalidation:** **sliding** window + **absolute cap**; server-side **revocation**; **logout** and **logout-everywhere**; sessions revoked on password change/reset and on account deletion. *(File: `session.service.ts`)*
- **Session-fixation defense:** a brand-new session is always issued on login. *(File: `auth.controller.ts` `login`)*
- **CSRF (double-submit):** a non-HttpOnly CSRF cookie + matching `x-csrf-token` header, compared with `crypto.timingSafeEqual`, on all authenticated state-changing routes. *(File: `backend/src/lib/csrf.ts`)*

### E5) Encryption & data protection
- **Passwords:** Argon2id (see E1).
- **TOTP secrets at rest:** **AES-256-GCM** envelope encryption (ciphertext + IV + auth tag), with a **key version** so keys can rotate without mass re-enrolment. Key from env (`TOTP_ENCRYPTION_KEY_V1`), never in code. *(Files: `backend/src/services/totp.service.ts`, `user.model.ts` `totpSecret`)*
- **In transit — real HTTPS/TLS (implemented):** the API can be served over **HTTPS** using a self-signed certificate (`backend/scripts/gen-certs.sh` → OpenSSL; enabled with `HTTPS_ENABLED=true`, wired in `backend/src/index.ts` via `https.createServer`). The frontend runs over HTTPS with `next dev --experimental-https` (`npm run dev:https`). With TLS on, **HTTP is refused and only HTTPS responds** (verified: `http → connection refused`, `https → 200`). This exercises the `Secure`/`__Host-` cookies and the `Strict-Transport-Security` (HSTS) header over a genuinely encrypted channel, defeating man-in-the-middle interception. In production, TLS is terminated by a reverse proxy (nginx). *(Files: `backend/src/index.ts`, `backend/scripts/gen-certs.sh`, `app.ts` helmet HSTS)*
- **Secrets management:** all secrets (session secret, TOTP key, SMTP, Khalti, Mongo creds) live in **gitignored `.env`** files, documented via `.env.example`; never committed.
- **Privacy:** data **export** and **account deletion/erasure** (anonymises PII, tombstones email, revokes sessions/tokens) — GDPR-style. *(Files: `profile.controller.ts`, `account-deletion.service.ts`)*

**Deliberate encryption decision (report this — it's a stronger position than "encrypt everything"):**
BazaarHub does **not** apply reversible field-encryption to general PII (email, address), and this is a **considered security decision**, not an omission:
- Reversible encryption with an **app-held key** protects little against the realistic threat (app/DB compromise): the running app must decrypt PII to use it, so the key lives in the same process/environment as the data. If the app is compromised, the attacker has the key too — this is largely **security theatre**.
- Instead, encryption is applied **where it genuinely matters**: passwords are **hashed** (Argon2id — one-way, never needs recovery), and **TOTP secrets** — recoverable shared secrets that must be usable but never exposed — are **encrypted with AES-256-GCM + key versioning**. That is the correct place for reversible encryption.
- PII confidentiality is instead defended by **layers that actually work**: TLS in transit, MongoDB authentication, RBAC + ownership access control, data minimisation, and export/erasure.
This demonstrates the rubric's required **"justification of encryption choices and key management"** — a reasoned decision rather than a checkbox.

### E6) Extra security features
- **XSS prevention:** strict **Content-Security-Policy** via Helmet (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), React output-encoding, HttpOnly session cookie. *(File: `app.ts`)*
- **NoSQL-injection prevention:** every input validated by **Zod** typed schemas; query params are plain strings/numbers, never objects — so operator-injection (`?category[$gt]=`) fails validation. *(Files: `validators/*.schema.ts`, `validate.ts`)*
- **Secure file uploads:** avatar & listing images are (1) **content-sniffed by magic bytes** (`file-type`, not extension), (2) **size-capped**, (3) **re-encoded through `sharp`** which strips EXIF/GPS metadata and caps dimensions (decompression-bomb defense), (4) stored with **server-generated random filenames** **outside the web root**, (5) **path-traversal-guarded**. *(Files: `middlewares/avatar-upload.ts`, `middlewares/listing-image-upload.ts`)*
- **Cross-Origin-Resource-Policy:** set to `cross-origin` so the frontend origin can load images (access still governed by CORS + route authz).
- **Rate limiting everywhere:** per-endpoint limiters (auth, profile, listing, cart, escrow, messaging, verification, admin). Allow-list matches **only `req.ip`** (never the spoofable `X-Forwarded-For`) with `trust proxy: 1`.
- **Security headers:** Helmet (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CORP, etc.).
- **Business-logic hardening:** atomic escrow state machine (race-safe transitions), stock reservation with expiry sweep, webhook idempotency ledger.
- **Email verification (OTP/link):** link-based verification email (via Nodemailer → Gmail SMTP in prod / MailHog in dev).

---

## 6. Penetration testing (huge asset — you already have this)
`docs/pentest-report.md` is a full internal white-box pentest following **OWASP WSTG v4.2**, with **20 findings fixed** across development and two self-attack phases plus a **Phase-4 re-review**, each documented with:
- Name, **OWASP category**, **CWE**, **CVSS v3.1 vector + score**, status.
- Technical explanation, **exploitation path**, remediation, and **retest** evidence.

**Strongest findings to feature (great "before → fix → after" scenarios for the report/video):**
- **SA-05 — MFA re-enrolment takeover (HIGH, CVSS 8.1):** `/mfa/enrol` was only `requireSession`, letting a stolen pre-MFA session overwrite the victim's TOTP secret and seize their second factor → account takeover. **Fixed:** re-enrolment now requires an MFA-verified session.
- **SA-06 — Rate-limit allow-list spoofable via `X-Forwarded-For` (MEDIUM, 5.3):** the limiter trusted an attacker-controlled header. **Fixed:** match `req.ip` only + `trust proxy: 1`.
- **SA-07 — Abandoned checkout permanently reserves stock (MEDIUM, 6.5):** a denial-of-inventory business-logic flaw. **Fixed:** reservation-expiry sweep.
- **SA-08 — Webhook idempotency ledger not wired (LOW):** replayed events could double-process. **Fixed:** unique event-id ledger.
- Plus earlier findings: reset-token invalidation, login timing leak, registration race, draft-listing IDOR, profile-route rate limiting, admin self-targeting, etc.

Also documented: WSTG coverage matrix, `npm audit` (0 vulns), and transparently **accepted residual risks**.

**Phase 5 (2026-07-31) — a fresh manual/Burp-driven re-review, four new findings, all fixed and retested:**

- **Finding 1 — Avatar Upload Missing Image Re-encoding (MEDIUM, CVSS 4.3, CWE-200):** `avatar-upload.ts` wrote the raw uploaded buffer straight to disk with no processing, unlike listing images which are re-encoded through `sharp()`. Any EXIF/GPS metadata in an uploaded photo (common on phone camera photos) survived untouched and was served back to anyone viewing that user's profile picture — a real location-privacy leak, verified end-to-end (uploaded a GPS-tagged test JPEG, confirmed the exact coordinates were still readable in the served file's EXIF data). **Fixed:** avatars now go through the identical `sharp().rotate().resize().toBuffer()` pipeline listing images already used.
- **Finding 2 — Users Can Report Their Own Messages (MEDIUM, CVSS 4.3, CWE-840):** `messaging.service.ts`'s `reportMessage` carried a comment stating a message's own sender should never be able to report it, but the code never checked `senderId` against the caller — verified by sending a message to yourself and successfully reporting it (`200`, `reported:true`). **Fixed:** added the missing ownership check, now rejected with `400`.
- **Finding 3 — Khalti Payment Confirmation Completely Broken (MEDIUM, CVSS 6.5, CWE-670):** the escrow transition table only allowed a `"webhook"`-triggered move from `created` → `payment_held`, but `confirmKhaltiPayment` (invoked by the buyer's own browser after Khalti redirect, since Khalti has no webhook here) triggered with `"buyer"` — meaning **every real Khalti payment confirmation unconditionally failed**, regardless of whether the buyer had actually paid. Found via a proof-of-concept that called the real function directly with a simulated Khalti "Completed" response. **Fixed:** added `"buyer"` to the allowed triggers for that transition.
- **Finding 4 — Missing Rate Limiting on Magic-Link Endpoints (MEDIUM, CVSS 5.3, CWE-799):** `/magic-link/request` and `/magic-link/verify` were the only two auth endpoints with no rate limiter at all (a comment in the code self-acknowledged this as deferred technical debt). Since `CAPTCHA_ENABLED` is off in this environment, the request endpoint had **zero practical abuse protection**, allowing unlimited email-sending per target. Verified: 6 rapid requests all returned `200` before the fix. **Fixed:** added `magicLinkRequestLimiter` (5/hour) and `magicLinkVerifyLimiter` (10/15min), matching every other auth-flow limiter's pattern; retest confirmed the 6th rapid request now returns `429`.

All four were found through a mix of manual Burp Suite testing (Repeater/Intruder) and targeted source-code review, each with full before/after evidence (screenshots and/or terminal output), and all four are covered by passing regression tests (348/348 backend suite green after all fixes).

---

## 7. Commerce features (functional scope, for the "Software Details" section)
Auth/MFA/magic-link/email-verification · profiles + data export + account deletion · addresses · listings + **two-level categories** + secure images + search/filters · cart · **checkout with Cash-on-Delivery + Khalti + Stripe** · **escrow** order lifecycle (created → payment_held → shipped → delivered → released; disputed → refunded/released; cancelled) · **shipping & tracking** · **returns/RMA** · **reviews & ratings** (verified-purchase) · **wishlist** · **buyer–seller messaging** (participant-authorized, reportable) · **in-app notifications** · **seller verification (KYC)** + tiers · **seller analytics & payouts** · **admin dashboard** (users, seller approvals, dispute resolution, verification review, payouts, audit logs).

---

## 8. Honest gaps / notes to keep the report truthful
- **HTTPS is implemented** (self-signed cert, opt-in via `HTTPS_ENABLED=true`) — you *can* now claim and demo it truthfully. To run in HTTPS mode: `sh backend/scripts/gen-certs.sh` → set `HTTPS_ENABLED=true` in `backend/.env` → `npm run dev` (API on https://localhost:5000) and `npm run dev:https` in the frontend (https://localhost:3000). First visit `https://localhost:5000` once to accept the self-signed cert. Screenshot the padlock + the refused HTTP + the cert.
- **PII encryption is a deliberate decision, not a gap** — see the "Deliberate encryption decision" note under E5; report it as reasoned, and don't claim you AES-encrypt all PII (you don't, on purpose).
- Khalti refund-on-dispute isn't pushed back through Khalti's API (state changes only); COD is not true escrow.
- `socket.io` is a dependency but real-time isn't a headline feature.

---

## 9. Screenshot guide — exactly what to capture for each figure
*(I can't take screenshots for you — see the note in chat — but here is exactly where each figure lives.)*

| Figure idea | Where to screenshot |
|---|---|
| System design diagram | Draw from Section 2 (or diagrams.net) |
| Frontend/backend dependencies | `frontend/package.json`, `backend/package.json` (VS Code) |
| GitHub repo | github.com/RojanShrestha77/baazarhub page |
| CORS implementation | `backend/src/app.ts` (the `cors({ origin… })` block) |
| Generic error handling (no info leak) | `backend/src/app.ts` (final error handler) + `lib/redact.ts` |
| Password policy (server) | `backend/src/validators/auth.schema.ts` + `services/password.service.ts` |
| Password policy (client) + strength bar | frontend register page |
| Password reuse prevention / expiry | `password.service.ts` (`isPasswordReused`, `isPasswordExpired`) |
| Account lockout / backoff | `login-attempt.service.ts` + `middlewares/rate-limiters.ts` |
| Stored password + history in DB | MongoDB Compass → `users` collection (show `passwordHash`, `passwordHistory`, `passwordChangedAt`) |
| Audit log function | `services/audit.service.ts` (`logEvent`) |
| Audit log in DB | Compass → `auditlogs` collection |
| Admin log viewer | running app → `/admin` (Logs tab) |
| RBAC middleware | `middlewares/authz.ts` (`requireRole`, `requireOwnership`) + `lib/authzRouter.ts` |
| Prevent role self-update (mass assignment) | `user.model.ts` comments + `services/admin.service.ts` |
| Session config / cookies | `lib/cookies.ts`, `configs/security.ts` |
| Cookie in browser | DevTools → Application → Cookies (`__Host-bazaarhub-session`) |
| AES encryption function | `services/totp.service.ts` (encrypt/decrypt TOTP secret) |
| Encrypted data in DB | Compass → `users` → `totpSecret` (ciphertext/iv/authTag) |
| Secret keys in env | `.env.example` (never the real `.env` in the report) |
| HTTPS / security headers | DevTools → Network → response headers (CSP, HSTS) or `app.ts` helmet block |
| Input sanitization / validation | `middlewares/validate.ts` + a `validators/*.schema.ts` |
| CSRF token implementation | `lib/csrf.ts` |
| CSRF token sent from client | `frontend/src/lib/api.ts` (`x-csrf-token` header) |
| MIME/file-type filtering | `middlewares/listing-image-upload.ts` (magic-byte sniff + sharp re-encode) |
| Email verification / OTP | `services/email-verification.service.ts` + running app email (MailHog `:8025` or Gmail) |
| Pentest findings (CVSS) | `docs/pentest-report.md` |
