import mongoose, { Schema, Document } from "mongoose";

// Deliberately separate from User, not fields bolted onto it. Every field
// here is user-settable by design — role/sellerTier/mfaEnabled live only on
// User, which this model has no reference into beyond userId. Mass
// assignment onto identity/privilege state is structurally impossible: those
// fields simply don't exist here to assign to.
export interface IProfile extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  displayName: string;
  bio: string;
  location: string;
  avatarPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<IProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    displayName: { type: String, trim: true, maxlength: 60, default: "" },
    bio: { type: String, trim: true, maxlength: 500, default: "" },
    location: { type: String, trim: true, maxlength: 120, default: "" },
    // Server-generated filename only (avatar upload) — never client-derived.
    avatarPath: { type: String, default: null },
  },
  { timestamps: true },
);

export const ProfileModel = mongoose.model<IProfile>("Profile", profileSchema);
