import mongoose, { Schema, Document } from "mongoose";

// Server-side sessions in Mongo (decision #1). The cookie carries an opaque
// random token; only its hash is stored here, so a DB leak alone doesn't
// hand out usable session tokens.
export interface ISession extends Document {
  _id: mongoose.Types.ObjectId;
  tokenHash: string;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  mfaVerified: boolean;
  revokedAt?: Date;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  lastSeenAt: Date;
}

const sessionSchema = new Schema<ISession>({
  tokenHash: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

  // Sliding window, extended by middleware on each active request. The TTL
  // index below is garbage collection, NOT the revocation mechanism —
  // session lookup re-checks expiresAt/absoluteExpiresAt itself.
  expiresAt: { type: Date, required: true },

  // Fixed at creation, never extended — backstop against undetected
  // long-lived compromise even if the sliding window keeps getting
  // refreshed by an attacker's traffic.
  absoluteExpiresAt: { type: Date, required: true },

  // Pre-MFA vs post-MFA state lives here, server-side — never as a client-
  // supplied or token-embedded claim (a JWT claim for this is an MFA
  // bypass waiting to happen).
  mfaVerified: { type: Boolean, default: false },

  // Explicit revocation flag for logout / logout-all / password-change so
  // revocation is a synchronous write middleware checks immediately.
  revokedAt: { type: Date },

  ip: { type: String },
  userAgent: { type: String },

  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
});

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
// TTL: expire at the time stored in expiresAt itself (GC, not enforcement).
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = mongoose.model<ISession>("Session", sessionSchema);
