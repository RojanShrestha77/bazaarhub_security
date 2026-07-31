import mongoose, { Schema, Document } from "mongoose";

export type ListingStatus = "draft" | "active" | "sold" | "withdrawn";

// Money is stored as an integer count of the currency's minor unit (paisa)
// — never a float. Floating-point can't exactly represent most decimal
// fractions (0.1 + 0.2 !== 0.3) and that error compounds across price math.
// Integer minor units make every price operation exact integer arithmetic.
export interface IListing extends Document {
  _id: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  priceMinorUnits: number;
  currency: string;
  category: mongoose.Types.ObjectId;
  status: ListingStatus;
  quantity: number;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

const listingSchema = new Schema<IListing>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 4000, default: "" },
    priceMinorUnits: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NPR", immutable: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    status: { type: String, enum: ["draft", "active", "sold", "withdrawn"], default: "draft" },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    // Server-generated filenames only (listing image upload) — never client-derived.
    images: { type: [String], default: [] },
  },
  { timestamps: true },
);

listingSchema.index({ sellerId: 1 });
listingSchema.index({ category: 1 });
listingSchema.index({ status: 1 });
listingSchema.index({ title: "text", description: "text" });

export const ListingModel = mongoose.model<IListing>("Listing", listingSchema);
