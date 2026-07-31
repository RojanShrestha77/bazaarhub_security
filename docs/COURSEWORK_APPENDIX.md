# BazaarHub — Coursework Appendix (complete reference)

Companion to `COURSEWORK_DETAILS.md`. Contains: (1) full API endpoint table,
(2) complete data models, (3) commit → security-decision map, (4) code snippets
for the E1–E6 figures. All extracted directly from the codebase.

---

## 1. Full API endpoint table
All routes are mounted under `/api` (except `/` and `/api/health`). "Gate" = the
authorization primitives enforced by the authz router.

| Method | Path | Gate | Purpose |
|---|---|---|---|
| POST | /api/auth/register | PUBLIC + captcha + rate-limit | Create account (unverified) |
| POST | /api/auth/login | PUBLIC + captcha + rate-limit | Log in (issues session) |
| POST | /api/auth/logout | session + CSRF | Log out current session |
| POST | /api/auth/logout-all | session + CSRF | Revoke all sessions |
| POST | /api/auth/session/refresh | session + CSRF | Slide session expiry |
| POST | /api/auth/mfa/enrol | session + CSRF + rate-limit | Enrol TOTP (blocked if already enrolled unless MFA-verified) |
| POST | /api/auth/mfa/verify | session + CSRF + rate-limit | Verify TOTP code |
| POST | /api/auth/mfa/recovery-code/verify | session + CSRF + rate-limit | Use a recovery code |
| POST | /api/auth/password/change | MFA-verified + CSRF | Change password (self-service) |
| POST | /api/auth/password/reset/request | PUBLIC + rate-limit | Request reset email |
| POST | /api/auth/password/reset/confirm | PUBLIC + rate-limit | Confirm reset via token |
| POST | /api/auth/email/verify | PUBLIC + rate-limit | Verify email via token |
| POST | /api/auth/email/verify/resend | session + CSRF + rate-limit | Resend verification email |
| POST | /api/auth/magic-link/request | PUBLIC + captcha + rate-limit | Request passwordless link |
| POST | /api/auth/magic-link/verify | PUBLIC + rate-limit | Sign in via magic link |
| GET | /api/profiles/me | session | Own profile |
| PATCH | /api/profiles/me | session + CSRF | Update own profile (field allow-list) |
| POST | /api/profiles/me/avatar | session + CSRF + upload | Upload avatar (secure) |
| GET | /api/profiles/me/avatar | session | Own avatar |
| GET | /api/profiles/me/export | session + rate-limit | Data export (privacy) |
| POST | /api/profiles/me/import | session + CSRF | Import profile fields |
| DELETE | /api/profiles/me | session + CSRF + password re-confirm | Delete/erase account |
| GET | /api/profiles/:id | session | Public profile (+ seller rating) |
| GET | /api/profiles/:id/avatar | session | Public avatar |
| GET | /api/addresses | session | List saved addresses |
| POST | /api/addresses | session + CSRF | Add address |
| PATCH | /api/addresses/:id | session + CSRF | Update address (scoped to owner) |
| DELETE | /api/addresses/:id | session + CSRF | Delete address |
| GET | /api/categories | PUBLIC | List categories (parent + sub) |
| POST | /api/listings | session + role:seller + email-verified + CSRF | Create listing |
| GET | /api/listings/search | PUBLIC | Search/filter (parent expands to subs) |
| GET | /api/listings/mine | session + role:seller | Seller's own listings |
| GET | /api/listings/:id | PUBLIC | Listing detail (drafts owner-only) |
| PATCH | /api/listings/:id | session + ownership + CSRF | Update listing |
| DELETE | /api/listings/:id | session + ownership + CSRF | Withdraw listing |
| POST | /api/listings/:id/images | session + ownership + CSRF + upload | Upload images (secure) |
| GET | /api/listings/:id/images/:filename | PUBLIC | Serve image (drafts owner-only) |
| GET | /api/listings/:id/reviews | PUBLIC | Reviews + rating summary |
| POST | /api/listings/:id/reviews | session + CSRF (verified purchase) | Post review |
| GET | /api/cart | session | View cart |
| POST | /api/cart/items | session + CSRF | Add/update cart item |
| DELETE | /api/cart/items/:listingId | session + CSRF | Remove cart item |
| POST | /api/escrow/checkout | session + email-verified + CSRF | Checkout (COD / Khalti / Stripe) |
| POST | /api/escrow/khalti/verify | session + CSRF | Verify Khalti payment (pidx) |
| GET | /api/escrow/orders | session | List my orders |
| GET | /api/escrow/orders/:id | session | Order detail (buyer/seller/admin only) |
| GET | /api/escrow/orders/:id/events | session | Order audit timeline |
| POST | /api/escrow/orders/:id/ship | session + role:seller + CSRF | Mark shipped (+ tracking) |
| PATCH | /api/escrow/orders/:id/tracking | session + role:seller + CSRF | Update tracking |
| POST | /api/escrow/orders/:id/confirm-delivery | session + CSRF | Buyer confirms delivery |
| POST | /api/escrow/orders/:id/dispute | session + CSRF | Open dispute |
| POST | /api/escrow/orders/:id/cancel | session + CSRF | Cancel (pre-ship) |
| POST | /api/escrow/orders/:id/resolve-dispute | session + role:admin + MFA + CSRF | Admin resolves dispute |
| POST | /api/escrow/orders/:id/release | session + role:admin + MFA + CSRF | Admin releases funds |
| POST | /api/escrow/webhook | PUBLIC (signature-verified) | Stripe webhook (idempotent) |
| GET | /api/returns | session | List returns (role-scoped) |
| POST | /api/returns | session + CSRF | Request return (delivered order) |
| POST | /api/returns/:id/approve | session + CSRF (seller/admin) | Approve return → refund |
| POST | /api/returns/:id/reject | session + CSRF (seller/admin) | Reject return |
| GET | /api/notifications | session | List notifications + unread count |
| POST | /api/notifications/read-all | session + CSRF | Mark all read |
| POST | /api/notifications/:id/read | session + CSRF | Mark one read |
| GET | /api/conversations | session | List my conversations |
| POST | /api/conversations | session + email-verified + CSRF | Start a thread |
| GET | /api/conversations/:id/messages | session (participant) | Thread messages |
| POST | /api/conversations/:id/messages | session + email-verified + CSRF (participant) | Reply |
| POST | /api/conversations/:id/messages/:messageId/report | session + CSRF (participant) | Report a message |
| POST | /api/seller/apply | session + email-verified + CSRF | Apply to become a seller |
| GET | /api/seller/analytics | session + role:seller | Seller sales analytics |
| GET | /api/seller/payouts | session + role:seller | Payout summary + history |
| POST | /api/verification/submit | session + role:seller + CSRF + rate-limit | Submit KYC details |
| GET | /api/verification/status | session | Own verification status |
| GET | /api/verification/requests | session + role:admin + MFA | List verification requests |
| POST | /api/verification/requests/:id/approve | session + role:admin + MFA + CSRF | Approve → tier up |
| POST | /api/verification/requests/:id/reject | session + role:admin + MFA + CSRF | Reject (with reason) |
| GET | /api/admin/users | role:admin + MFA | List all users |
| GET | /api/admin/seller-applications | role:admin + MFA | List applications |
| POST | /api/admin/seller-applications/:id/approve | role:admin + MFA + CSRF | Grant seller role |
| POST | /api/admin/seller-applications/:id/reject | role:admin + MFA + CSRF | Reject application |
| PATCH | /api/admin/users/:id/role | role:admin + MFA + CSRF | Change a user's role |
| PATCH | /api/admin/users/:id/tier | role:admin + MFA + CSRF | Change a seller's tier |
| GET | /api/admin/sellers/:id/payouts | role:admin + MFA | Seller payout summary |
| POST | /api/admin/sellers/:id/payouts | role:admin + MFA + CSRF | Record a payout |
| GET | /api/admin/logs | role:admin + MFA | View audit logs |
| GET | /api/admin/logs/stats | role:admin + MFA | Audit log stats |
| GET | /api/health | PUBLIC | Health check |

Every route carries an explicit gate — the authz router refuses to register an ungated route.

---

## 2. Complete data models (MongoDB collections)

- **User** — email, passwordHash (argon2id), passwordChangedAt, emailVerified, emailVerifiedAt, role (buyer/seller/admin), sellerTier (unverified/verified/trusted), sellerApplicationStatus, mfaEnabled, **totpSecret {ciphertext, iv, authTag, keyVersion}** (AES-256-GCM), mfaEnrolledAt, totpLastUsedStep, loginFailure {count, lastAttemptAt, nextAttemptAllowedAt}, passwordHistory[], deletedAt. *(Sensitive: passwordHash hashed, totpSecret encrypted, passwordHistory hashed.)*
- **Session** — tokenHash (SHA-256), userId, expiresAt (sliding), absoluteExpiresAt (cap), mfaVerified, revokedAt, ip, userAgent, createdAt, lastSeenAt.
- **Profile** — userId, displayName, bio, location, avatarPath. *(Separate from User so identity/role can't be mass-assigned via profile edits.)*
- **Address** — userId, label, recipientName, phone, line1/line2, city, district, province, postalCode, isDefault.
- **AuditLog** — actor, subject, action, outcome, ip, userAgent, metadata, before, after, createdAt.
- **PasswordResetToken / EmailVerificationToken** — tokenHash (SHA-256), userId, used, usedAt, expiresAt (TTL), createdAt.
- **RecoveryCode** — userId, codeHash (argon2), used, usedAt, createdAt.
- **Category** — name, slug (unique), parentId (null = top-level).
- **Listing** — sellerId, title, description, priceMinorUnits (integer paisa), currency, category, status (draft/active/sold/withdrawn), quantity, images[] (random filenames).
- **Order** — buyerId, sellerId, listingId, listingSnapshot {title, priceMinorUnits, currency}, quantity, totalMinorUnits, status (created/payment_held/shipped/delivered/released/disputed/refunded/cancelled), **paymentMethod (stripe/khalti/cod)**, stripePaymentIntentId, khaltiPidx, holdDurationMs (tier-based), shippedAt, carrier, trackingNumber, deliveredAt, disputedAt, releasedAt, refundedAt, cancelledAt, disputeResolvedBy, disputeResolution.
- **EscrowEvent** — orderId, fromStatus, toStatus, triggeredBy, triggerType (buyer/seller/admin/system/webhook), reason, metadata, createdAt. *(Immutable audit trail of every transition.)*
- **WebhookEvent** — eventId (unique), type, orderId, processedAt. *(Idempotency ledger.)*
- **ReturnRequest** — orderId, buyerId, sellerId, reason, status (requested/approved/rejected), resolvedBy, resolvedAt.
- **Review** — listingId, sellerId, reviewerId, rating (1–5), comment. *(Unique {listingId, reviewerId}.)*
- **WishlistItem** — userId, listingId, createdAt. *(Unique {userId, listingId}.)*
- **Conversation** — buyerId, sellerId, listingId, lastMessageAt. *(Unique {buyer, seller, listing}.)*
- **Message** — conversationId, senderId, body, reportedAt, createdAt.
- **Notification** — userId, type, title, body, link, readAt, createdAt.
- **Payout** — sellerId, amountMinorUnits, note, createdBy (admin), createdAt.
- **VerificationRequest** — sellerId, details {fullName, idType, idNumber, businessName, phone, address}, status (pending/approved/rejected), reviewedBy, reviewedAt, rejectionReason.
- **Cart** — userId, items[{listingId, quantity}]. *(Prices re-resolved live at read; nothing trusted from add-time.)*

---

## 3. Commit → security-decision map (mapping required by the rubric)

| Commit | Security decision / control |
|---|---|
| `9e52ffe` fix(auth): MFA re-enrolment takeover (SA-05), XFF spoof (SA-06) | Fixed MFA-takeover auth bypass; rate-limit now trusts req.ip only |
| `ad1e3b6` fix(escrow): reservation expiry, webhook idempotency (SA-07/08) | Denial-of-inventory fix; idempotent webhook processing |
| `3806b12` docs: product roadmap + Phase-4 pentest findings | Documented SA-05..08 with CVSS |
| `752ba6b` feat(verification): seller KYC | KYC identity verification → tier trust |
| `91f2b13` feat(email-verify): clickable link + page | Email-ownership verification gate |
| `eb22403` feat(mail): Gmail SMTP with MailHog fallback | Real mail transport; secrets in env |
| `f866955` feat(categories): two-level taxonomy | Search input still Zod-validated (no injection) |
| `2894f1e` feat(returns): RMA with seller/admin approval | Least-privilege resolution + 404-parity |
| `0d3645a` feat(notifications) | Fire-and-forget, per-user scoped (no IDOR) |
| `5b84ee1` feat(profile): account deletion/erasure | GDPR erasure: anonymise + revoke sessions/tokens |
| `64bd78d` feat(messaging): participant-authorized | 404-parity authorization, reportable |
| `2393cfe` feat(reviews): verified-purchase | Server-resolved purchase proof |
| `1868bbd` feat(addresses) | userId from session, scoped writes (no IDOR) |
| `eeebc1c` feat(seller): application module | Role granted only via admin path (no self-escalation) |
| `fd0c9b3` feat(payments): COD + Khalti | Payment methods; secrets in gitignored .env |
| earlier `3b4ca7e`, `5d96ce9` | Fixes to reset endpoint/field + route hardening |

*(Full narrative of each pre-commit design decision is in `docs/security-decisions.md`, and the fix→retest evidence is in `docs/pentest-report.md`.)*

---

## 4. Code snippets for the E1–E6 figures (paste-ready)

**E1 — Argon2id config & hashing** (`configs/security.ts`, `services/password.service.ts`)
```ts
export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB — memory-hard, GPU-resistant
  timeCost: 3,
  parallelism: 1,
};
export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}
```

**E1 — Rate limiting + IP allow-list (SA-06 fix)** (`middlewares/rate-limiters.ts`)
```ts
// Match ONLY req.ip — never the attacker-controlled X-Forwarded-For header.
const skip = (req: Request): boolean => ALLOWED_IPS.includes(req.ip ?? "");
export const loginLimiter    = rateLimit({ windowMs: 15*60*1000, max: 20, ...withSkip });
export const registerLimiter = rateLimit({ windowMs: 60*60*1000, max: 10, ...withSkip });
```

**E2 — Audit logging** (`services/audit.service.ts`)
```ts
export async function logEvent({ actor, subject, action, outcome = "success",
  ip, userAgent, metadata, before, after }: LogEventArgs): Promise<IAuditLog> {
  // writes an immutable AuditLog document (redacted, fire-and-forget)
}
```

**E3 — RBAC gates** (`middlewares/authz.ts`)
```ts
export function requireRole(...roles: UserRole[]): AuthzGate {
  return gate(`requireRole(${roles.join(",")})`, (req, res, next) => {
    if (!req.session) return res.status(401).json({ error: "Authentication required" });
    if (!req.user || !roles.includes(req.user.role)) {
      logAuthzFail(req, `required_role_${roles.join("_")}`);
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  });
}
// Ownership: mismatch and "doesn't exist" both return 404 (no enumeration).
export function requireOwnership(resolveOwnerId): AuthzGate {
  return gate("requireOwnership", async (req, res, next) => {
    const ownerId = await resolveOwnerId(req);
    if (!ownerId || String(ownerId) !== String(req.user._id))
      return res.status(404).json({ error: "Not found" });
    next();
  });
}
```

**E4 — Secure session cookie** (`lib/cookies.ts`)
```ts
res.cookie(SESSION_COOKIE_NAME, rawToken, {   // "__Host-bazaarhub-session"
  httpOnly: true, secure: true, sameSite: "lax", path: "/",
  maxAge: SESSION_ABSOLUTE_CAP_MS,
});
```

**E4 — CSRF double-submit** (`lib/csrf.ts`)
```ts
export function requireCsrfToken(req, res, next) {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken) return res.status(403).json({ message: "Missing CSRF token" });
  const a = Buffer.from(cookieToken), b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return res.status(403).json({ message: "Invalid CSRF token" });
  next();
}
```

**E5 — AES-256-GCM encryption (TOTP secret at rest)** (`services/totp.service.ts`)
```ts
export function encryptTotpSecret(plaintextSecret: string): TotpSecret {
  const key = getKey(TOTP_KEY_VERSION);
  const iv = crypto.randomBytes(12);            // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"),
           authTag: authTag.toString("base64"), keyVersion: TOTP_KEY_VERSION };
}
```

**E6 — Secure file upload (magic-byte sniff + re-encode)** (`middlewares/listing-image-upload.ts`)
```ts
const mime = await fileTypeFromBuffer(file.buffer);      // sniff real bytes, not extension
if (!mime || !(mime in EXT_BY_MIME))
  return res.status(400).json({ error: "Unsupported or unrecognized image type" });
const reencoded = await sharp(file.buffer)               // strips EXIF/GPS metadata
  .rotate()
  .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
  .toFormat(...).toBuffer();
const filename = `${listingId}-${crypto.randomUUID()}.${ext}`;   // server-generated
```

**E6 — CORS (credentialed, never wildcard)** (`app.ts`)
```ts
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === CORS_ORIGIN || isLocalhost(origin)) return callback(null, true);
    return callback(null, false);   // no CORS headers for disallowed origins
  },
  credentials: true,
}));
```

**E6 — CSP / security headers** (`app.ts`)
```ts
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"], connectSrc: ["'self'"], frameAncestors: ["'none'"],
    baseUri: ["'self'"], objectSrc: ["'none'"] } },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
```
