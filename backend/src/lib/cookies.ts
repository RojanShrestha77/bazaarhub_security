import { Response } from "express";
import { SESSION_COOKIE_NAME, SESSION_ABSOLUTE_CAP_MS } from "../configs/security";

// Decision #2: httpOnly (JS can't read it — narrows XSS from "exfiltrate a
// portable credential" to "ride along live"), Secure, SameSite=Lax (Strict
// would log users out clicking transactional email links), __Host- prefix
// (forces Secure + Path=/ + no Domain — always set, never conditional on
// NODE_ENV so it can't silently degrade in prod).
export function setSessionCookie(res: Response, rawToken: string): void {
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_ABSOLUTE_CAP_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}
