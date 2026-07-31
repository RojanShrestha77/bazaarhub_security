import mongoose, { Schema, Document } from "mongoose";

// Verified-purchase product review. A review can only be created by a buyer who
// has an order for the listing in a delivered/released state (enforced in the
// service), so every review here is backed by a real, completed purchase.
export interface IReview extends Document {
  _id: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  reviewerId: mongoose.Types.ObjectId;
  rating: number; // 1..5
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    // Denormalized from the listing at creation time so seller-level rating
    // aggregation doesn't need to join back through listings.
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true },
);

// One review per buyer per listing — the unique index is the race-safe arbiter
// (a concurrent double-submit loses on E11000), not just an application check.
reviewSchema.index({ listingId: 1, reviewerId: 1 }, { unique: true });
reviewSchema.index({ listingId: 1, createdAt: -1 });
reviewSchema.index({ sellerId: 1 });

export const ReviewModel = mongoose.model<IReview>("Review", reviewSchema);
