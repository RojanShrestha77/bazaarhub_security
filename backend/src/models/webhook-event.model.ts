import mongoose, { Schema, Document } from "mongoose";

// Idempotency ledger for payment-provider webhooks. The unique eventId
// index is what makes replayed webhook deliveries safe to process once.
export interface IWebhookEvent extends Document {
  _id: mongoose.Types.ObjectId;
  eventId: string;
  type: string;
  orderId?: mongoose.Types.ObjectId;
  processedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>({
  eventId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  processedAt: { type: Date, default: Date.now },
});

export const WebhookEventModel = mongoose.model<IWebhookEvent>("WebhookEvent", webhookEventSchema);
