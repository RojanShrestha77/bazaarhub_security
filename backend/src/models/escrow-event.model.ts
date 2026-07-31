import mongoose, { Schema, Document } from "mongoose";

export type EscrowTriggerType = "buyer" | "seller" | "admin" | "system" | "webhook";

// Immutable audit trail of every escrow state transition (order lifecycle).
export interface IEscrowEvent extends Document {
  _id: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  fromStatus?: string;
  toStatus: string;
  triggeredBy: mongoose.Types.ObjectId | null;
  triggerType: EscrowTriggerType;
  reason?: string;
  metadata?: unknown;
  createdAt: Date;
}

const escrowEventSchema = new Schema<IEscrowEvent>({
  orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  fromStatus: { type: String },
  toStatus: { type: String, required: true },
  triggeredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  triggerType: { type: String, enum: ["buyer", "seller", "admin", "system", "webhook"], required: true },
  reason: { type: String },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

escrowEventSchema.index({ orderId: 1, createdAt: 1 });

export const EscrowEventModel = mongoose.model<IEscrowEvent>("EscrowEvent", escrowEventSchema);
