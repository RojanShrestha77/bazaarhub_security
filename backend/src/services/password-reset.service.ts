import mongoose from "mongoose";
import { PasswordResetTokenModel, IPasswordResetToken } from "../models/password-reset-token.model";
import { generateSessionToken, hashSessionToken } from "../lib/sessionToken";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min — short, single-use

export async function createPasswordResetToken(userId: mongoose.Types.ObjectId): Promise<string> {
  const rawToken = generateSessionToken(); // same CSPRNG generator, reused
  await PasswordResetTokenModel.create({
    tokenHash: hashSessionToken(rawToken),
    userId,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });
  return rawToken;
}

// Single atomic findOneAndUpdate keyed on the deterministic SHA-256 hash.
// Re-checks expiresAt itself; the TTL index on the model is GC only.
export async function consumePasswordResetToken(rawToken: string): Promise<IPasswordResetToken | null> {
  const tokenHash = hashSessionToken(rawToken);
  return PasswordResetTokenModel.findOneAndUpdate(
    { tokenHash, used: false, expiresAt: { $gt: new Date() } },
    { $set: { used: true, usedAt: new Date() } },
    { new: true },
  );
}

// A password change through ANY path must invalidate every OTHER
// outstanding, unused reset token for that user.
export async function invalidateAllResetTokensForUser(userId: mongoose.Types.ObjectId): Promise<void> {
  await PasswordResetTokenModel.updateMany(
    { userId, used: false },
    { $set: { used: true, usedAt: new Date() } },
  );
}
