import mongoose, { Schema, Document } from "mongoose";

export const ORDER_STATUSES = [
  "created",
  "payment_held",
  "shipped",
  "delivered",
  "released",
  "disputed",
  "refunded",
  // Terminal state for a checkout whose payment never completed. The sweep
  // (expireStaleReservations) moves stale `created` orders here and returns
  // their reserved stock to the listing.
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface IListingSnapshot {
  title: string;
  priceMinorUnits: number;
  currency: string;
}

export interface IOrder extends Document {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  listingSnapshot: IListingSnapshot;
  quantity: number;
  totalMinorUnits: number;
  status: OrderStatus;
  paymentMethod: "stripe" | "khalti" | "cod";
  stripePaymentIntentId?: string;
  khaltiPidx?: string;
  holdDurationMs: number;
  shippedAt?: Date;
  carrier?: string;
  trackingNumber?: string;
  deliveredAt?: Date;
  disputedAt?: Date;
  releasedAt?: Date;
  refundedAt?: Date;
  cancelledAt?: Date;
  disputeResolvedBy?: mongoose.Types.ObjectId;
  disputeResolution?: "released" | "refunded";
  createdAt: Date;
  updatedAt: Date;
}

const listingSnapshotSchema = new Schema<IListingSnapshot>(
  {
    title: { type: String, required: true },
    priceMinorUnits: { type: Number, required: true },
    currency: { type: String, default: "NPR" },
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    listingSnapshot: { type: listingSnapshotSchema, required: true },
    quantity: { type: Number, required: true, min: 1 },
    totalMinorUnits: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES as unknown as string[], default: "created" },
    paymentMethod: { type: String, enum: ["stripe", "khalti", "cod"], default: "stripe" },
    stripePaymentIntentId: { type: String },
    khaltiPidx: { type: String },
    holdDurationMs: { type: Number, required: true },
    // Shipping / delivery tracking — set when the seller marks the order
    // shipped. carrier + trackingNumber are seller-provided and optional.
    shippedAt: { type: Date },
    carrier: { type: String, trim: true, maxlength: 60 },
    trackingNumber: { type: String, trim: true, maxlength: 100 },
    deliveredAt: { type: Date },
    disputedAt: { type: Date },
    releasedAt: { type: Date },
    refundedAt: { type: Date },
    cancelledAt: { type: Date },
    disputeResolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    disputeResolution: { type: String, enum: ["released", "refunded"] },
  },
  { timestamps: true },
);

orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });

export const OrderModel = mongoose.model<IOrder>("Order", orderSchema);
