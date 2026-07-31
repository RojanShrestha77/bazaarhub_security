import { Request, Response, NextFunction } from "express";
import { CAPTCHA_SECRET, CAPTCHA_ENABLED } from "../configs/captcha";

// Brute-force defense tier: CAPTCHA gate (Cloudflare Turnstile). Disabled by
// default in dev/test via CAPTCHA_ENABLED so it doesn't block automated
// tests; enable in production after a failure threshold.
export function requireCaptcha(req: Request, res: Response, next: NextFunction) {
  if (!CAPTCHA_ENABLED) return next();

  const token = req.body?.["cf-turnstile-response"] || req.body?.captchaToken;
  if (!token) {
    return res.status(400).json({ error: "CAPTCHA token required" });
  }

  fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: CAPTCHA_SECRET, response: token, remoteip: req.ip }),
  })
    .then((r) => r.json())
    .then((data: { success?: boolean }) => {
      if (!data.success) {
        return res.status(400).json({ error: "CAPTCHA verification failed" });
      }
      next();
    })
    .catch(() => res.status(500).json({ error: "CAPTCHA verification error" }));
}
