import { createAuthzRouter } from "../lib/authzRouter";
import { PUBLIC, requireSession, requireMfaVerified } from "../middlewares/authz";
import {
  loginLimiter,
  registerLimiter,
  mfaEnrolLimiter,
  mfaVerifyLimiter,
  recoveryCodeLimiter,
  passwordResetLimiter,
  passwordChangeLimiter,
  emailVerifyLimiter,
  emailVerifyResendLimiter,
  magicLinkRequestLimiter,
  magicLinkVerifyLimiter,
} from "../middlewares/rate-limiters";
import { validateBody } from "../middlewares/validate";
import { requireCaptcha } from "../middlewares/captcha";
import { requireCsrfToken } from "../lib/csrf";
import {
  registerSchema,
  loginSchema,
  logoutSchema,
  mfaEnrolSchema,
  mfaVerifySchema,
  recoveryCodeVerifySchema,
  passwordChangeSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  emailVerifySchema,
} from "../validators/auth.schema";
import { AuthController } from "../controllers/auth.controller";

const router = createAuthzRouter();
const auth = new AuthController();

// Decision #7 (identical response on existence) lives in the controller.
router.post("/register", PUBLIC, registerLimiter, requireCaptcha, validateBody(registerSchema), auth.register);
router.post("/login", PUBLIC, loginLimiter, requireCaptcha, validateBody(loginSchema), auth.login);

// Session lifecycle — CSRF-guarded, session required.
router.post("/logout", [requireSession], requireCsrfToken, validateBody(logoutSchema), auth.logout);
router.post("/logout-all", [requireSession], requireCsrfToken, auth.logoutAll);
router.post("/session/refresh", [requireSession], requireCsrfToken, auth.sessionRefresh);

// MFA.
router.post("/mfa/enrol", [requireSession], requireCsrfToken, mfaEnrolLimiter, validateBody(mfaEnrolSchema), auth.mfaEnrol);
router.post("/mfa/verify", [requireSession], requireCsrfToken, mfaVerifyLimiter, validateBody(mfaVerifySchema), auth.mfaVerify);
router.post(
  "/mfa/recovery-code/verify",
  [requireSession],
  requireCsrfToken,
  recoveryCodeLimiter,
  validateBody(recoveryCodeVerifySchema),
  auth.recoveryCodeVerify,
);

// Password change requires an MFA-verified session (not just requireSession)
// so a stolen pre-MFA session can't change the password.
router.post(
  "/password/change",
  [requireMfaVerified],
  requireCsrfToken,
  passwordChangeLimiter,
  validateBody(passwordChangeSchema),
  auth.passwordChange,
);

// Reset flow — token itself is the credential, so PUBLIC.
router.post("/password/reset/request", PUBLIC, passwordResetLimiter, validateBody(passwordResetRequestSchema), auth.passwordResetRequest);
router.post("/password/reset/confirm", PUBLIC, passwordResetLimiter, validateBody(passwordResetConfirmSchema), auth.passwordResetConfirm);

// Email verification. Consume is PUBLIC (token is the credential); resend
// requires a session (acts only on the caller's own account).
router.post("/email/verify", PUBLIC, emailVerifyLimiter, validateBody(emailVerifySchema), auth.verifyEmail);
router.post("/email/verify/resend", [requireSession], requireCsrfToken, emailVerifyResendLimiter, auth.resendEmailVerification);

// Magic link (passwordless) — rate-limited same as every other mail-sending
// auth endpoint (was previously the only two auth routes with no limiter).
router.post("/magic-link/request", PUBLIC, magicLinkRequestLimiter, requireCaptcha, validateBody(magicLinkRequestSchema), auth.magicLinkRequest);
router.post("/magic-link/verify", PUBLIC, magicLinkVerifyLimiter, validateBody(magicLinkVerifySchema), auth.magicLinkVerify);

export default router;
