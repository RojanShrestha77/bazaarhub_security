import { Request, Response, NextFunction } from "express";
import { findValidSession } from "../services/session.service";
import { UserModel } from "../models/user.model";
import { clearSessionCookie } from "../lib/cookies";
import { SESSION_COOKIE_NAME } from "../configs/security";

export { SESSION_COOKIE_NAME };

// Core lookup, factored out so authz gates can each call it independently
// without every gate in a composed chain re-hitting the DB. Idempotent per
// request via req.__sessionLoaded.
export async function loadSession(req: Request, res: Response): Promise<void> {
  if (req.__sessionLoaded) return;
  req.__sessionLoaded = true;

  const token = req.cookies?.[SESSION_COOKIE_NAME];

  req.session = null;
  req.user = null;

  if (!token) return;

  // findValidSession re-checks expiresAt AND absoluteExpiresAt itself,
  // checks revokedAt, and extends the sliding window. It never distinguishes
  // "expired" vs "revoked" vs "not found" — all three come back null, so
  // this middleware can't leak that distinction either.
  const session = await findValidSession(token);
  if (!session) {
    clearSessionCookie(res);
    return;
  }

  const user = await UserModel.findById(session.userId);
  if (!user) {
    clearSessionCookie(res);
    return;
  }

  req.session = session;
  req.user = user;
}

// Optional-session attachment: does not reject unauthenticated requests.
export async function attachSession(req: Request, res: Response, next: NextFunction) {
  try {
    await loadSession(req, res);
  } catch (err) {
    return next(err);
  }
  next();
}

async function logAuthzFail(req: Request, detail: string): Promise<void> {
  try {
    const { logAuthzFailure } = await import("../services/audit.service");
    logAuthzFailure({
      actor: req.user?._id,
      action: detail,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { url: req.originalUrl, method: req.method },
    });
  } catch {
    /* audit logging must never break the request */
  }
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
  if (!req.session) {
    logAuthzFail(req, "require_session");
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// Gate for sensitive actions that require a confirmed email address (checkout,
// seller application, listing creation). Runs AFTER an authz gate has loaded
// the session, so req.user is populated. Not itself an authz gate — it layers
// on top of one, the same way requireCsrfToken does.
export function requireEmailVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!req.user.emailVerified) {
    logAuthzFail(req, "require_email_verified");
    return res.status(403).json({ error: "Email verification required" });
  }
  next();
}

export function requireMfaVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.session) {
    logAuthzFail(req, "require_mfa_no_session");
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!req.session.mfaVerified) {
    logAuthzFail(req, "require_mfa_not_verified");
    return res.status(403).json({ error: "MFA verification required" });
  }
  next();
}
