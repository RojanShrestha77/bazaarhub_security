import mongoose, { Schema, Document } from "mongoose";

// A saved shipping address in a user's address book. Every row is owned by
// exactly one user (userId), set from the session — never from client input —
// so there is no IDOR surface. At most one address per user is the default.
export interface IAddress extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  district: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    label: { type: String, trim: true, maxlength: 40, default: "" },
    recipientName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    line1: { type: String, required: true, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120, default: "" },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    district: { type: String, trim: true, maxlength: 60, default: "" },
    province: { type: String, trim: true, maxlength: 60, default: "" },
    postalCode: { type: String, trim: true, maxlength: 12, default: "" },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

addressSchema.index({ userId: 1, createdAt: -1 });

export const AddressModel = mongoose.model<IAddress>("Address", addressSchema);
