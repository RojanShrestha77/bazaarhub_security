import mongoose, { Schema, Document } from "mongoose";

// Two-level taxonomy. A parent (top-level) category has parentId === null; a
// subcategory points at its parent. Not user-creatable — no create/update/
// delete route exists. Seeded via scripts/seedCategories.ts. Listings reference
// a leaf (subcategory) via Listing.category; filtering by a parent expands to
// its children in listing.service.searchListings.
export interface ICategory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  parentId: mongoose.Types.ObjectId | null;
}

const categorySchema = new Schema<ICategory>({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
});

categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ parentId: 1 });

export const CategoryModel = mongoose.model<ICategory>("Category", categorySchema);
