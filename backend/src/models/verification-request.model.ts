import mongoose, { Schema, Document } from "mongoose";

export const VERIFICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ID_TYPES = ["citizenship", "passport", "driving_license"] as const;
export type IdType = (typeof ID_TYPES)[number];

// Seller-submitted KYC details (no file upload). An admin reviews these and
// approves/rejects to move the seller's tier.
export interface IVerificationDetails {
  fullName: string;
  idType: IdType;
  idNumber: string;
  businessName: string;
  phone: string;
  address: string;
}

export interface IVerificationRequest extends Document {
  _id: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  details: IVerificationDetails;
  status: VerificationStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const detailsSchema = new Schema<IVerificationDetails>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    idType: { type: String, enum: ID_TYPES as unknown as string[], required: true },
    idNumber: { type: String, required: true, trim: true, maxlength: 60 },
    businessName: { type: String, trim: true, maxlength: 120, default: "" },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    address: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { _id: false },
);

const verificationRequestSchema = new Schema<IVerificationRequest>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    details: { type: detailsSchema, required: true },
    status: { type: String, enum: VERIFICATION_STATUSES as unknown as string[], default: "pending" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
  },
  { timestamps: true },
);

verificationRequestSchema.index({ sellerId: 1, createdAt: -1 });
verificationRequestSchema.index({ status: 1, createdAt: -1 });

export const VerificationRequestModel = mongoose.model<IVerificationRequest>(
  "VerificationRequest",
  verificationRequestSchema,
);
