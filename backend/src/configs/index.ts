import dotenv from "dotenv";

dotenv.config();

// ── Server ──────────────────────────────────────────────────────────────
export const PORT: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
export const NODE_ENV: string = process.env.NODE_ENV || "development";
export const IS_PROD: boolean = NODE_ENV === "production";

// ── Database ────────────────────────────────────────────────────────────
export const MONGODB_URI: string = process.env.MONGODB_URI || "mongodb://localhost:27017/bazaarhub";

// ── CORS ────────────────────────────────────────────────────────────────
export const CORS_ORIGIN: string = process.env.CORS_ORIGIN || "http://localhost:5173";

// ── Secrets ─────────────────────────────────────────────────────────────
// Unlike HamroDeal's fallback JWT secret, session/CSRF security here does
// NOT depend on a guessable default. Fail loudly in production if the
// signing/encryption material is missing rather than silently running on a
// known-weak constant (that is itself an auth-bypass waiting to happen).
function requiredInProd(name: string, value: string | undefined): string {
  if (!value) {
    if (IS_PROD) {
      throw new Error(`Missing required environment variable in production: ${name}`);
    }
    return `dev-only-insecure-${name}`;
  }
  return value;
}

export const SESSION_SECRET: string = requiredInProd("SESSION_SECRET", process.env.SESSION_SECRET);

// AES-256-GCM key material for encrypting TOTP secrets at rest (decision #4).
// Versioned so a key can rotate without forcing MFA re-enrolment: old
// ciphertexts stay decryptable under the key version recorded on them.
export const TOTP_KEY_VERSION: number = process.env.TOTP_KEY_VERSION
  ? parseInt(process.env.TOTP_KEY_VERSION, 10)
  : 1;

export function totpEncryptionKey(version: number): string {
  const key = process.env[`TOTP_ENCRYPTION_KEY_V${version}`];
  return requiredInProd(`TOTP_ENCRYPTION_KEY_V${version}`, key);
}

// ── Mail ────────────────────────────────────────────────────────────────
export const SMTP_HOST: string = process.env.SMTP_HOST || "localhost";
export const SMTP_PORT: number = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 1025;
// Real SMTP (Gmail) credentials. When both are set the mailer sends through
// Gmail; otherwise it falls back to the local SMTP host (MailHog in dev).
export const EMAIL_USER: string = process.env.EMAIL_USER || "";
export const EMAIL_PASS: string = process.env.EMAIL_PASS || "";
// Gmail rewrites the From to the authenticated account, so default the From to
// the Gmail user when present, else the local dev placeholder.
export const MAIL_FROM: string =
  process.env.MAIL_FROM || (process.env.EMAIL_USER ? `BazaarHub <${process.env.EMAIL_USER}>` : "no-reply@bazaarhub.local");

// ── Payments (escrow) ───────────────────────────────────────────────────
export const PAYMENT_SECRET_KEY: string = process.env.PAYMENT_SECRET_KEY || "";
export const PAYMENT_WEBHOOK_SECRET: string = process.env.PAYMENT_WEBHOOK_SECRET || "";

// ── Khalti (Nepali payment gateway) ─────────────────────────────────────
export const KHALTI_SECRET_KEY: string = process.env.KHALTI_SECRET_KEY || "";
export const KHALTI_BASE_URL: string = process.env.KHALTI_BASE_URL || "https://dev.khalti.com/api/v2";

// ── Frontend ────────────────────────────────────────────────────────────
export const FRONTEND_URL: string = process.env.FRONTEND_URL || CORS_ORIGIN;
