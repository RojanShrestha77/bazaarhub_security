import mongoose, { Schema, Document } from "mongoose";

// Recovery codes (decision #5). 10 generated at enrolment, shown once,
// hashed with argon2id before storage — not because the entropy needs a
// slow hash, but so there's one hashing approach in the codebase with no
// special case to explain later. Regeneration invalidates the whole old
// set (deleteMany then insert fresh).
export interface IRecoveryCode extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  codeHash: string;
  used: boolean;
  usedAt?: Date;
  createdAt: Date;
}

const recoveryCodeSchema = new Schema<IRecoveryCode>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  codeHash: { type: String, required: true },
  used: { type: Boolean, default: false },
  usedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

recoveryCodeSchema.index({ userId: 1, codeHash: 1 }, { unique: true });
recoveryCodeSchema.index({ userId: 1, used: 1 });

export const RecoveryCodeModel = mongoose.model<IRecoveryCode>("RecoveryCode", recoveryCodeSchema);
