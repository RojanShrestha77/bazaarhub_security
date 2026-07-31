import mongoose, { Schema, Document } from "mongoose";

// A buyer↔seller thread about one listing. Exactly two participants, fixed at
// creation: the buyer who initiated and the seller who owns the listing. One
// thread per (buyer, seller, listing) — the unique index makes "start or
// continue" race-safe.
export interface IConversation extends Document {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

conversationSchema.index({ buyerId: 1, sellerId: 1, listingId: 1 }, { unique: true });
conversationSchema.index({ buyerId: 1, lastMessageAt: -1 });
conversationSchema.index({ sellerId: 1, lastMessageAt: -1 });

export const ConversationModel = mongoose.model<IConversation>("Conversation", conversationSchema);
