import { z } from "zod";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../configs/security";


const password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const email = z.string().trim().toLowerCase().email().max(254);
const captchaField = z.string().optional();

export const registerSchema = z.object({ email, password, captchaToken: captchaField, applyAsSeller: z.boolean().optional() });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
  captchaToken: captchaField,
});

// .strict() rejects unknown fields outright (defense-in-depth if a handler
// ever starts reading the body).
export const logoutSchema = z.object({}).strict();
export const mfaEnrolSchema = z.object({}).strict();

export const mfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});

export const recoveryCodeVerifySchema = z.object({ code: z.string().min(1).max(64) });

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const passwordResetConfirmSchema = z.object({ token: z.string().min(1), newPassword: password });

export const magicLinkRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  captchaToken: captchaField,
});

export const magicLinkVerifySchema = z.object({ token: z.string().min(1) });

export const emailVerifySchema = z.object({ token: z.string().min(1) });

// Inferred DTO types for typed handler access to req.validatedBody.
export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type MfaVerifyDto = z.infer<typeof mfaVerifySchema>;
export type RecoveryCodeVerifyDto = z.infer<typeof recoveryCodeVerifySchema>;
export type PasswordChangeDto = z.infer<typeof passwordChangeSchema>;
export type PasswordResetRequestDto = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmDto = z.infer<typeof passwordResetConfirmSchema>;
export type MagicLinkRequestDto = z.infer<typeof magicLinkRequestSchema>;
export type MagicLinkVerifyDto = z.infer<typeof magicLinkVerifySchema>;
export type EmailVerifyDto = z.infer<typeof emailVerifySchema>;
