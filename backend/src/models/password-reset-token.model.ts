import mongoose, { Schema, Document } from "mongoose";

// Decision #1 recovery flow. Token is high-entropy machine-generated, so
// it's hashed with SHA-256 before storage (same reasoning as session
// tokens, not argon2id — no offline-guessing advantage to defend against
// for a 256-bit random value).
export interface IPasswordResetToken extends Document {
  _id: mongoose.Types.ObjectId;
  tokenHash: string;
  userId: mongoose.Types.ObjectId;
  used: boolean;
  usedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>({
  tokenHash: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  used: { type: Boolean, default: false },
  usedAt: { type: Date },
  // Short expiry re-checked by the confirm route itself; the TTL index is GC.
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

passwordResetTokenSchema.index({ tokenHash: 1 });
passwordResetTokenSchema.index({ userId: 1 });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetTokenModel = mongoose.model<IPasswordResetToken>(
  "PasswordResetToken",
  passwordResetTokenSchema,
);
