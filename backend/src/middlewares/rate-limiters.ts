import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

// Decision #6: hybrid lockout. Per-IP rate limiting (this file) is the
// PRIMARY defense and applies independently per endpoint group. Per-account
// exponential backoff is separate (login-attempt.service).
//
// NOTE: express-rate-limit's default store is in-process memory — fine for a
// single container, but multiplies the effective limit by replica count if
// scaled horizontally. Swap for rate-limit-redis when that happens.
const ALLOWED_IPS = (process.env.IP_ALLOW_LIST || "").split(",").filter(Boolean).map((s) => s.trim());

const jsonRateLimitHandler = (_req: Request, res: Response) => {
  res.status(429).json({ error: "Too many requests" });
};

// IP allow-listing: trusted IPs bypass the auth-flow limiters.
// SECURITY: match ONLY against req.ip, never the raw X-Forwarded-For header.
// The raw header is fully attacker-controlled, so trusting it would let anyone
// forge an allow-listed IP and bypass every auth limiter. req.ip is derived
// from the socket and, behind a proxy, only from X-Forwarded-For when Express
// `trust proxy` is explicitly configured to trust that proxy hop.
const skip = (req: Request): boolean => ALLOWED_IPS.includes(req.ip ?? "");

const common = { standardHeaders: true as const, legacyHeaders: false as const, handler: jsonRateLimitHandler };
const withSkip = { ...common, skip };

// ── Auth flows (IP allow-list applies) ──
export const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, ...withSkip });
export const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, ...withSkip });
// /mfa/enrol does 10 sequential argon2id hashes (~1.7s CPU) — tighter.
export const mfaEnrolLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, ...withSkip });
export const mfaVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, ...withSkip });
export const recoveryCodeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, ...common });
export const passwordResetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, ...withSkip });
export const passwordChangeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, ...withSkip });
// Email verification: token consume is cheap; resend sends mail, so keep it modest.
export const emailVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, ...withSkip });
export const emailVerifyResendLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, ...common });

// ── Admin ──
export const adminActionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, ...common });

// ── Profile (separate read/write buckets; export is a full-account read) ──
export const exportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, ...common });
export const profileReadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, ...common });
export const profileWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, ...common });
export const avatarUploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, ...common });

// ── Listings ──
export const listingReadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 180, ...common });
export const listingWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, ...common });
export const listingImageUploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, ...common });
export const searchLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, ...common });

// ── Cart ──
export const cartReadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, ...common });
export const cartWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, ...common });

// ── Messaging (write is tighter — throttles spam / harassment) ──
export const messagingReadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 180, ...common });
export const messagingWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, ...common });

// ── Escrow / payments ──
export const escrowReadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, ...common });
export const escrowWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, ...common });
// Webhook: generous since Stripe retries from a shared IP pool.
export const webhookLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, ...common });

// ── Verification ──
export const verificationSubmitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 100, ...common });
export const verificationAdminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, ...common });
