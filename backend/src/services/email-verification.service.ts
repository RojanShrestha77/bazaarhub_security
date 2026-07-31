import mongoose from "mongoose";
import { EmailVerificationTokenModel, IEmailVerificationToken } from "../models/email-verification-token.model";
import { generateSessionToken, hashSessionToken } from "../lib/sessionToken";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h — longer than reset; email confirmation is less time-critical

export async function createEmailVerificationToken(userId: mongoose.Types.ObjectId): Promise<string> {
  const rawToken = generateSessionToken(); // same CSPRNG generator as reset/session tokens
  await EmailVerificationTokenModel.create({
    tokenHash: hashSessionToken(rawToken),
    userId,
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  });
  return rawToken;
}

// Single atomic findOneAndUpdate keyed on the deterministic SHA-256 hash;
// re-checks expiry itself. Returns the consumed token doc (with userId) or null.
export async function consumeEmailVerificationToken(rawToken: string): Promise<IEmailVerificationToken | null> {
  const tokenHash = hashSessionToken(rawToken);
  return EmailVerificationTokenModel.findOneAndUpdate(
    { tokenHash, used: false, expiresAt: { $gt: new Date() } },
    { $set: { used: true, usedAt: new Date() } },
    { new: true },
  );
}

// Retire any outstanding unused tokens for a user (e.g. after a successful
// verification, or before issuing a fresh one on resend).
export async function invalidateVerificationTokensForUser(userId: mongoose.Types.ObjectId): Promise<void> {
  await EmailVerificationTokenModel.updateMany(
    { userId, used: false },
    { $set: { used: true, usedAt: new Date() } },
  );
}
