import { Request, Response, NextFunction } from "express";
import { UserModel } from "../models/user.model";
import { logEvent } from "../services/audit.service";
import {
  hashPassword,
  verifyPassword,
  verifyAgainstDummyHash,
  isPasswordReused,
  addToPasswordHistory,
  isPasswordExpired,
} from "../services/password.service";
import {
  sendRegistrationConfirmation,
  sendExistingAccountNotice,
  sendRecoveryCodeUsedNotice,
  sendPasswordResetEmail,
  sendMagicLinkEmail,
  sendEmailVerification,
} from "../services/mail.service";
import {
  createSession,
  revokeSession,
  revokeAllSessionsForUser,
  revokeOtherSessionsForUser,
  markMfaVerified,
} from "../services/session.service";
import { isInBackoff, registerFailedAttempt, resetFailedAttempts } from "../services/login-attempt.service";
import { setSessionCookie, clearSessionCookie } from "../lib/cookies";
import { generateCsrfToken, setCsrfCookie } from "../lib/csrf";
import {
  generateTotpSecret,
  buildOtpAuthUri,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyAndConsumeTotp,
} from "../services/totp.service";
import { generateRecoveryCodes, consumeRecoveryCode } from "../services/recovery-code.service";
import {
  createPasswordResetToken,
  consumePasswordResetToken,
  invalidateAllResetTokensForUser,
} from "../services/password-reset.service";
import { createMagicLinkToken, consumeMagicLinkToken } from "../services/magic-link.service";
import {
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  invalidateVerificationTokensForUser,
} from "../services/email-verification.service";
import {
  RegisterDto,
  LoginDto,
  MfaVerifyDto,
  RecoveryCodeVerifyDto,
  PasswordChangeDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
  MagicLinkRequestDto,
  MagicLinkVerifyDto,
  EmailVerifyDto,
} from "../validators/auth.schema";

const REGISTER_RESPONSE = {
  message: "If this email address is available, your account has been created — you can now log in.",
};
const LOGIN_FAILURE_RESPONSE = { error: "Invalid email or password" };
const RESET_REQUEST_RESPONSE = { message: "If that email address has an account, a reset link has been sent." };

// Handlers are arrow-property methods so they can be passed directly as
// Express callbacks without binding. Logic is a faithful port of the JS
// auth routes — every decision-#N comment preserved in the router.
export class AuthController {
  // ── Registration ──
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, applyAsSeller } = req.validatedBody as RegisterDto;

      // Hash unconditionally before branching on existence (decision #7
      // timing parity — closes the dominant argon2id-cost signal).
      const passwordHash = await hashPassword(password);
      const existing = await UserModel.findOne({ email });

      if (existing) {
        sendExistingAccountNotice(existing.email);
        logEvent({ action: "register_attempt", outcome: "failure", ip: req.ip, userAgent: req.get("user-agent"), metadata: { reason: "email_exists" } }).catch(() => {});
      } else {
        try {
          // Explicit allow-list, never a req.body spread — role/sellerTier
          // are never client-settable. applyAsSeller only ever sets the
          // application to "pending"; the role itself stays "buyer" until an
          // admin approves.
          const created = await UserModel.create({ email, passwordHash, sellerApplicationStatus: applyAsSeller ? "pending" : "none" });
          sendRegistrationConfirmation(email);
          // Issue an email-ownership verification token. Fire-and-forget send,
          // same enumeration-safety reasoning as every other auth email.
          const verifyToken = await createEmailVerificationToken(created._id);
          sendEmailVerification(email, verifyToken);
          logEvent({ action: "register", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
        } catch (err) {
          // Concurrent registration loser hits the unique index (E11000);
          // treat as "already existed", same generic response, not a 500.
          if ((err as { code?: number })?.code !== 11000) throw err;
        }
      }

      return res.status(201).json(REGISTER_RESPONSE);
    } catch (err) {
      next(err);
    }
  };

  // ── Login ──
  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.validatedBody as LoginDto;
      const user = await UserModel.findOne({ email });

      const passwordValid = user
        ? await verifyPassword(user.passwordHash, password)
        : await verifyAgainstDummyHash(password).then(() => false);

      const backoffActive = user ? isInBackoff(user) : false;
      // A deleted (tombstoned) account can never authenticate. The email is
      // already anonymized so this rarely triggers, but it's cheap insurance
      // and keeps timing parity (verifyPassword still ran above).
      const success = passwordValid && !backoffActive && !user?.deletedAt;

      if (!success) {
        // NOT awaited — a DB save only happening for existing users would
        // leak timing. Only extend backoff on an ACTUALLY wrong password,
        // never on a correct one blocked by an active window (else a user
        // retrying their correct password re-extends their own lockout).
        if (user && !passwordValid) {
          registerFailedAttempt(user).catch((err: Error) => {
            console.error("registerFailedAttempt failed:", err.message);
          });
        }
        logEvent({ actor: user?._id, action: "login", outcome: "failure", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
        return res.status(401).json(LOGIN_FAILURE_RESPONSE);
      }

      await resetFailedAttempts(user!);

      if (isPasswordExpired(user!)) {
        logEvent({ actor: user!._id, action: "password_expired", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      }

      // Decision #1 / session-fixation defense: always a brand-new session.
      // mfaVerified starts true only if no MFA enrolled.
      const { rawToken } = await createSession({
        userId: user!._id,
        mfaVerified: !user!.mfaEnabled,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      setSessionCookie(res, rawToken);
      setCsrfCookie(res, generateCsrfToken());

      logEvent({ actor: user!._id, action: "login", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(200).json({ mfaRequired: user!.mfaEnabled });
    } catch (err) {
      next(err);
    }
  };

  // ── Logout (current session only) ──
  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await revokeSession(req.session!._id);
      clearSessionCookie(res);
      logEvent({ actor: req.user!._id, action: "logout", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  };

  // ── Logout everywhere ──
  logoutAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await revokeAllSessionsForUser(req.user!._id);
      clearSessionCookie(res);
      logEvent({ actor: req.user!._id, action: "logout_all", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  };

  // ── Session refresh ──
  sessionRefresh = (req: Request, res: Response) => {
    logEvent({ actor: req.user!._id, action: "session_refresh", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
    res.status(200).json({ mfaVerified: req.session!.mfaVerified, expiresAt: req.session!.expiresAt });
  };

  // ── MFA enrolment ──
  mfaEnrol = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;

      // Re-enrolment hardening: overwriting totpSecret + regenerating recovery
      // codes is a credential change. A first-time enroller has mfaVerified=true
      // (no MFA enrolled yet), so this never blocks them; but once MFA is
      // enabled, a stolen pre-MFA session (mfaVerified=false) must NOT be able
      // to silently replace the victim's authenticator. Force a fresh MFA
      // verification first.
      if (user.mfaEnabled && !req.session!.mfaVerified) {
        logEvent({ actor: user._id, action: "mfa_enrol", outcome: "failure", ip: req.ip, userAgent: req.get("user-agent"), metadata: { reason: "reenrol_requires_mfa" } }).catch(() => {});
        return res.status(403).json({ error: "MFA verification required to re-enrol" });
      }

      const secret = generateTotpSecret();

      user.totpSecret = encryptTotpSecret(secret);
      user.totpLastUsedStep = undefined;
      await user.save();

      const recoveryCodes = await generateRecoveryCodes(user._id);
      const otpauthUri = buildOtpAuthUri(secret, user.email);

      logEvent({ actor: user._id, action: "mfa_enrol", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(200).json({ otpauthUri, secret, recoveryCodes });
    } catch (err) {
      next(err);
    }
  };

  // ── MFA verify ──
  mfaVerify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      if (!user.totpSecret) {
        return res.status(400).json({ error: "MFA is not enrolled for this account" });
      }

      const secret = decryptTotpSecret(user.totpSecret);
      const { code } = req.validatedBody as MfaVerifyDto;
      const step = verifyAndConsumeTotp(secret, code, user.totpLastUsedStep);

      if (step === null) {
        logEvent({ actor: user._id, action: "mfa_verify", outcome: "failure", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
        return res.status(401).json({ error: "Invalid or expired code" });
      }

      user.totpLastUsedStep = step;
      if (!user.mfaEnabled) user.mfaEnabled = true; // first verify confirms enrolment
      await user.save();

      await markMfaVerified(req.session!._id);

      logEvent({ actor: user._id, action: "mfa_verify", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(200).json({ mfaVerified: true });
    } catch (err) {
      next(err);
    }
  };

  // ── Recovery code verify ──
  recoveryCodeVerify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.validatedBody as RecoveryCodeVerifyDto;
      const consumed = await consumeRecoveryCode(req.user!._id, code);
      if (!consumed) {
        return res.status(400).json({ error: "Invalid or already-used recovery code" });
      }

      await markMfaVerified(req.session!._id);
      sendRecoveryCodeUsedNotice(req.user!.email);

      logEvent({ actor: req.user!._id, action: "recovery_code_use", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(200).json({ mfaVerified: true });
    } catch (err) {
      next(err);
    }
  };

  // ── Password change (self-service, MFA-verified) ──
  passwordChange = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.validatedBody as PasswordChangeDto;
      const user = req.user!;

      const currentValid = await verifyPassword(user.passwordHash, currentPassword);
      if (!currentValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      if (await isPasswordReused(user, newPassword)) {
        return res.status(400).json({ error: "Password has been used recently. Choose a different one." });
      }

      const newHash = await hashPassword(newPassword);
      addToPasswordHistory(user, user.passwordHash);
      user.passwordHash = newHash;
      user.passwordChangedAt = new Date();
      await user.save();

      await revokeOtherSessionsForUser(user._id, req.session!._id);
      await invalidateAllResetTokensForUser(user._id);

      logEvent({ actor: user._id, action: "password_change", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(200).json({ message: "Password changed" });
    } catch (err) {
      next(err);
    }
  };

  // ── Password reset request ──
  passwordResetRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.validatedBody as PasswordResetRequestDto;
      const user = await UserModel.findOne({ email });

      if (user) {
        const rawToken = await createPasswordResetToken(user._id);
        sendPasswordResetEmail(user.email, rawToken);
        logEvent({ actor: user._id, action: "password_reset_request", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      } else {
        logEvent({ action: "password_reset_request", outcome: "failure", ip: req.ip, userAgent: req.get("user-agent"), metadata: { reason: "email_not_found" } }).catch(() => {});
      }

      return res.status(200).json(RESET_REQUEST_RESPONSE);
    } catch (err) {
      next(err);
    }
  };

  // ── Password reset confirm ──
  passwordResetConfirm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.validatedBody as PasswordResetConfirmDto;

      const consumed = await consumePasswordResetToken(token);
      if (!consumed) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      const user = await UserModel.findById(consumed.userId);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      if (await isPasswordReused(user, newPassword)) {
        return res.status(400).json({ error: "Password has been used recently. Choose a different one." });
      }

      const newHash = await hashPassword(newPassword);
      addToPasswordHistory(user, user.passwordHash);
      user.passwordHash = newHash;
      user.passwordChangedAt = new Date();
      await user.save();

      await revokeAllSessionsForUser(user._id);
      await invalidateAllResetTokensForUser(user._id);

      logEvent({ actor: user._id, action: "password_reset_confirm", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(200).json({ message: "Password reset" });
    } catch (err) {
      next(err);
    }
  };

  // ── Magic link (passwordless) request ──
  magicLinkRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.validatedBody as MagicLinkRequestDto;
      const user = await UserModel.findOne({ email });

      if (user) {
        const rawToken = await createMagicLinkToken(user._id);
        sendMagicLinkEmail(user.email, rawToken);
        logEvent({ actor: user._id, action: "magic_link_request", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      } else {
        logEvent({ action: "magic_link_request", outcome: "failure", ip: req.ip, userAgent: req.get("user-agent"), metadata: { reason: "email_not_found" } }).catch(() => {});
      }

      return res.status(200).json({ message: "If that email address has an account, a sign-in link has been sent." });
    } catch (err) {
      next(err);
    }
  };

  // ── Magic link verify ──
  magicLinkVerify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.validatedBody as MagicLinkVerifyDto;
      const consumed = await consumeMagicLinkToken(token);
      if (!consumed) {
        return res.status(400).json({ error: "Invalid or expired link" });
      }

      const user = await UserModel.findById(consumed.userId);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired link" });
      }

      const { rawToken: sessionToken } = await createSession({
        userId: user._id,
        mfaVerified: !user.mfaEnabled,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      setSessionCookie(res, sessionToken);
      setCsrfCookie(res, generateCsrfToken());

      await invalidateAllResetTokensForUser(user._id);

      logEvent({ actor: user._id, action: "magic_link_verify", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(200).json({ mfaRequired: user.mfaEnabled });
    } catch (err) {
      next(err);
    }
  };

  // ── Email verification (token consume) ──
  // PUBLIC: the token itself is the credential. Generic response either way so
  // a bad/expired token can't be distinguished from a foreign one.
  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.validatedBody as EmailVerifyDto;
      const consumed = await consumeEmailVerificationToken(token);
      if (!consumed) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }

      const user = await UserModel.findById(consumed.userId);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }

      if (!user.emailVerified) {
        user.emailVerified = true;
        user.emailVerifiedAt = new Date();
        await user.save();
      }
      // Retire any other outstanding tokens for this user.
      await invalidateVerificationTokensForUser(user._id);

      logEvent({ actor: user._id, action: "email_verify", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(200).json({ emailVerified: true });
    } catch (err) {
      next(err);
    }
  };

  // ── Resend verification (authenticated) ──
  // Issues a fresh token to the logged-in user's own address. No-op response if
  // already verified — never reveals another account's state (it only ever acts
  // on req.user).
  resendEmailVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      if (!user.emailVerified) {
        await invalidateVerificationTokensForUser(user._id);
        const token = await createEmailVerificationToken(user._id);
        sendEmailVerification(user.email, token);
        logEvent({ actor: user._id, action: "email_verify_resend", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      }
      return res.status(200).json({ message: "If your email is unverified, a new verification link has been sent." });
    } catch (err) {
      next(err);
    }
  };
}
