import mongoose, { Schema, Document } from "mongoose";

// Email-ownership confirmation token. Same design as the password-reset token:
// a high-entropy CSPRNG value stored as its SHA-256 hash (no offline-guessing
// advantage to defend for a 256-bit random value, so not argon2id). Single-use,
// short-lived; the TTL index is garbage collection, the consume path re-checks
// expiry itself.
export interface IEmailVerificationToken extends Document {
  _id: mongoose.Types.ObjectId;
  tokenHash: string;
  userId: mongoose.Types.ObjectId;
  used: boolean;
  usedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

const emailVerificationTokenSchema = new Schema<IEmailVerificationToken>({
  tokenHash: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  used: { type: Boolean, default: false },
  usedAt: { type: Date },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

emailVerificationTokenSchema.index({ tokenHash: 1 });
emailVerificationTokenSchema.index({ userId: 1 });
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationTokenModel = mongoose.model<IEmailVerificationToken>(
  "EmailVerificationToken",
  emailVerificationTokenSchema,
);
