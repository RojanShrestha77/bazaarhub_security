import mongoose, { Schema, Document } from "mongoose";

export const RETURN_STATUSES = ["requested", "approved", "rejected"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

// A buyer's request to return a delivered order for a refund. At most one
// ACTIVE (requested) return per order — enforced by the service plus a partial
// unique index — so a buyer can't spam requests. Resolution (approve/reject) is
// done by the seller or an admin.
export interface IReturnRequest extends Document {
  _id: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  reason: string;
  status: ReturnStatus;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const returnRequestSchema = new Schema<IReturnRequest>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: RETURN_STATUSES as unknown as string[], default: "requested" },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

// At most one open return per order. Partial index only applies to "requested"
// rows, so historical approved/rejected returns don't block a future request.
returnRequestSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { status: "requested" } });
returnRequestSchema.index({ buyerId: 1, createdAt: -1 });
returnRequestSchema.index({ sellerId: 1, createdAt: -1 });

export const ReturnRequestModel = mongoose.model<IReturnRequest>("ReturnRequest", returnRequestSchema);
