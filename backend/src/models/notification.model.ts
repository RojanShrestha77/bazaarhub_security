import mongoose, { Schema, Document } from "mongoose";

// In-app notification for a single user. Created as a side effect of domain
// events (order transitions, new messages, new reviews). Fire-and-forget at
// the call site — a notification failure must never break the triggering
// action, exactly like the transactional emails.
export type NotificationType =
  | "order_update"
  | "message"
  | "review"
  | "seller_application"
  | "verification";

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  readAt?: Date;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, default: "" },
  // Relative in-app path the notification deep-links to (e.g. /orders/<id>).
  link: { type: String },
  readAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

export const NotificationModel = mongoose.model<INotification>("Notification", notificationSchema);
