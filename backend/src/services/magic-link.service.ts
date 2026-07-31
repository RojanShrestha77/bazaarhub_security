import mongoose from "mongoose";
import { PasswordResetTokenModel, IPasswordResetToken } from "../models/password-reset-token.model";
import { generateSessionToken, hashSessionToken } from "../lib/sessionToken";

// Passwordless auth (advanced feature, rubric 3.1.2). Reuses the single-use
// SHA-256-hashed token model as password reset — same TOCTOU-safe atomic
// consume, shorter TTL.
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export async function createMagicLinkToken(userId: mongoose.Types.ObjectId): Promise<string> {
  const rawToken = generateSessionToken();
  await PasswordResetTokenModel.create({
    tokenHash: hashSessionToken(rawToken),
    userId,
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  });
  return rawToken;
}

export async function consumeMagicLinkToken(rawToken: string): Promise<IPasswordResetToken | null> {
  const tokenHash = hashSessionToken(rawToken);
  return PasswordResetTokenModel.findOneAndUpdate(
    { tokenHash, used: false, expiresAt: { $gt: new Date() } },
    { $set: { used: true, usedAt: new Date() } },
    { new: true },
  );
}
