import crypto from "node:crypto";
import { authenticator } from "otplib";
import { TOTP_STEP_SECONDS, TOTP_WINDOW_STEPS, TOTP_ISSUER } from "../configs/security";
import { TOTP_KEY_VERSION, totpEncryptionKey } from "../configs";
import { TotpSecret } from "../types/user.type";

// Set ONCE at module load. Using the library's own checkDelta() for the
// window search rather than mutating the shared singleton's epoch per call
// (which was a live concurrency hazard between concurrent requests).
authenticator.options = { step: TOTP_STEP_SECONDS, window: TOTP_WINDOW_STEPS };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpAuthUri(secret: string, email: string): string {
  return authenticator.keyuri(email, TOTP_ISSUER, secret);
}

// Decision #4: AES-256-GCM, key selected by keyVersion so rotation doesn't
// force mass re-enrolment.
function getKey(keyVersion: number): Buffer {
  const b64 = totpEncryptionKey(keyVersion);
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`TOTP_ENCRYPTION_KEY_V${keyVersion} must decode to 32 bytes (AES-256)`);
  }
  return key;
}

export function encryptTotpSecret(plaintextSecret: string): TotpSecret {
  const keyVersion = TOTP_KEY_VERSION;
  const key = getKey(keyVersion);
  const iv = crypto.randomBytes(12); // 96-bit IV, standard for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextSecret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion,
  };
}

export function decryptTotpSecret(totpSecretDoc: TotpSecret): string {
  const key = getKey(totpSecretDoc.keyVersion);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(totpSecretDoc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(totpSecretDoc.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(totpSecretDoc.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function currentStep(): number {
  return Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
}

// Replay prevention: convert the matched delta to an absolute step number
// and reject if it's <= the last step this user already consumed.
export function verifyAndConsumeTotp(
  secret: string,
  token: string,
  lastUsedStep?: number,
): number | null {
  const delta = authenticator.checkDelta(token, secret);
  if (delta === null) return null;

  const matchedStep = currentStep() + delta;
  if (lastUsedStep != null && matchedStep <= lastUsedStep) {
    return null;
  }
  return matchedStep;
}
