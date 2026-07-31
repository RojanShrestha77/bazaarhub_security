# BazaarHub

![Node](https://img.shields.io/badge/node-20.0-339933?logo=node.js)
![Next.js](https://img.shields.io/badge/next.js-15-000000?logo=next.js)
![Express](https://img.shields.io/badge/express-4-000000?logo=express)
![MongoDB](https://img.shields.io/badge/mongodb-7-47A248?logo=mongodb)
![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker)
![License](https://img.shields.io/badge/license-MIT-blue)

A Daraz-style e-commerce marketplace with escrow payments, tiered seller verification, and defense-in-depth security.

**Stack:** Next.js 15 · Node.js / Express · MongoDB · Docker

---

## Architecture

```
browser → frontend (Next.js :3000) → backend API (:5000) → MongoDB (:27017)
                                              ↕
                                          MailHog (dev SMTP)
```

- **frontend/** — Next.js 15 App Router, Tailwind v4, standalone Node server
- **backend/** — Express REST API, Mongoose, Argon2, Zod validation
- **docs/** — Security decisions, threat model, pentest notes

---

## Running with Docker (recommended)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in the required secrets before starting
```

### 2. Start all services

```bash
docker compose up --build
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3000      |
| API      | http://localhost:5000      |
| MongoDB  | mongodb://localhost:27017  |
| MailHog  | http://localhost:8025      |

### 3. Stop

```bash
docker compose down
# To also remove volumes (wipes database):
docker compose down -v
```

---

## Running without Docker (development)

### Backend

```bash
cd backend
npm install
# Create a .env file in backend/ with at minimum: MONGODB_URI, PORT
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## CI/CD

| Workflow      | When                        | What                          |
|---------------|-----------------------------|-------------------------------|
| `ci.yml`      | Push/PR to main, develop    | lint, backend tests, build    |
| `security.yml`| Push/PR to main, weekly     | Gitleaks, npm audit, Semgrep, CodeQL, Trivy |

All 248 backend tests pass. Frontend builds with 37 routes (0 errors).

---

## Security Features

- Password hashing (Argon2id, configurable memory/time/parallelism)
- Multi-factor authentication (TOTP, enforced per role)
- Role-based access control (Buyer / Seller / Admin / Super Admin)
- Server-side sessions (cookie-based, signed, HTTP-only)
- CSRF protection (double-submit cookie pattern)
- Rate limiting (express-rate-limit, tiered by endpoint)
- Account lockout (5 failed attempts → 15 min cooldown)
- Stripe escrow (disbursement on delivery confirmation)
- Audit logging (all auth & sensitive operations)
- CAPTCHA (Cloudflare Turnstile)
- Password expiry (90-day rotation)
- Password reuse prevention (last 5 hashes tracked)
- Magic link auth (password-less login, 15 min TTL)
- IP allow-listing (skip rate limits for trusted networks)

---

## Documentation

- [`docs/security-decisions.md`](docs/security-decisions.md) — design decisions and rationale
- [`docs/threat-model.md`](docs/threat-model.md) — STRIDE threat model
- [`docs/pentest-notes.md`](docs/pentest-notes.md) — penetration test findings
