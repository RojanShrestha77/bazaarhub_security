import mongoose, { Schema, Document } from "mongoose";

// A recorded payout of released escrow earnings to a seller. Created by an
// admin (the platform disburses funds out-of-band; this is the ledger of what
// has been paid). Seller available balance = net released earnings − Σ payouts.
export interface IPayout extends Document {
  _id: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  amountMinorUnits: number;
  note: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const payoutSchema = new Schema<IPayout>({
  sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  amountMinorUnits: { type: Number, required: true, min: 1 },
  note: { type: String, trim: true, maxlength: 200, default: "" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

payoutSchema.index({ sellerId: 1, createdAt: -1 });

export const PayoutModel = mongoose.model<IPayout>("Payout", payoutSchema);
