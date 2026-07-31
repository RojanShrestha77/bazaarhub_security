import mongoose, { Schema, Document } from "mongoose";

// A user's saved listing. One row per (user, listing); the unique index makes
// "add" idempotent and race-safe rather than relying on a read-then-write.
export interface IWishlistItem extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const wishlistItemSchema = new Schema<IWishlistItem>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
  createdAt: { type: Date, default: Date.now },
});

wishlistItemSchema.index({ userId: 1, listingId: 1 }, { unique: true });
wishlistItemSchema.index({ userId: 1, createdAt: -1 });

export const WishlistItemModel = mongoose.model<IWishlistItem>("WishlistItem", wishlistItemSchema);
