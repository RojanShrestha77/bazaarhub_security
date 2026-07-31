import mongoose from "mongoose";
import { SessionModel, ISession } from "../models/session.model";
import { generateSessionToken, hashSessionToken } from "../lib/sessionToken";
import { SESSION_SLIDING_WINDOW_MS, SESSION_ABSOLUTE_CAP_MS } from "../configs/security";

interface CreateSessionArgs {
  userId: mongoose.Types.ObjectId;
  mfaVerified: boolean;
  ip?: string;
  userAgent?: string;
}

// Decision #1 + session-fixation defense: ALWAYS issue a brand-new session
// across an authentication boundary.
export async function createSession({
  userId,
  mfaVerified,
  ip,
  userAgent,
}: CreateSessionArgs): Promise<{ rawToken: string; session: ISession }> {
  const rawToken = generateSessionToken();
  const now = Date.now();

  const session = await SessionModel.create({
    tokenHash: hashSessionToken(rawToken),
    userId,
    expiresAt: new Date(now + SESSION_SLIDING_WINDOW_MS),
    absoluteExpiresAt: new Date(now + SESSION_ABSOLUTE_CAP_MS),
    mfaVerified: Boolean(mfaVerified),
    ip,
    userAgent,
  });

  return { rawToken, session };
}

// Re-checks expiry/revocation itself rather than trusting the TTL index.
// On success, extends the sliding window (capped by absoluteExpiresAt).
export async function findValidSession(rawToken?: string): Promise<ISession | null> {
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const session = await SessionModel.findOne({ tokenHash });
  if (!session) return null;

  const now = Date.now();
  if (session.revokedAt) return null;
  if (session.absoluteExpiresAt.getTime() <= now) return null;
  if (session.expiresAt.getTime() <= now) return null;

  const nextExpiresAt = Math.min(now + SESSION_SLIDING_WINDOW_MS, session.absoluteExpiresAt.getTime());
  session.expiresAt = new Date(nextExpiresAt);
  session.lastSeenAt = new Date(now);
  await session.save();

  return session;
}

export async function revokeSession(sessionId: mongoose.Types.ObjectId): Promise<void> {
  await SessionModel.updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllSessionsForUser(userId: mongoose.Types.ObjectId): Promise<void> {
  await SessionModel.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

// Self-service password change: kill all OTHER sessions, keep the current.
export async function revokeOtherSessionsForUser(
  userId: mongoose.Types.ObjectId,
  currentSessionId: mongoose.Types.ObjectId,
): Promise<void> {
  await SessionModel.updateMany(
    { userId, _id: { $ne: currentSessionId }, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function markMfaVerified(sessionId: mongoose.Types.ObjectId): Promise<void> {
  await SessionModel.updateOne({ _id: sessionId }, { $set: { mfaVerified: true } });
}
