import crypto from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../configs/security";

// Double-submit cookie CSRF defense, scoped to AUTHENTICATED state-changing
// routes. The cookie proves "this browser was issued a token by us"; the
// header proves "JS on our own origin read that cookie and echoed it back"
// — a cross-site attacker can't read the cookie (same-origin policy) to
// forge a matching header. Defense-in-depth on top of SameSite=Lax.
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // frontend JS MUST be able to read this one
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export function requireCsrfToken(req: Request, res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ success: false, message: "Missing CSRF token" });
  }

  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ success: false, message: "Invalid CSRF token" });
  }

  next();
}
