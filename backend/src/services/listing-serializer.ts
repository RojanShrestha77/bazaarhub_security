import { IListing } from "../models/listing.model";

// listing.category is an ObjectId ref unless the query that produced this
// document called .populate("category") — callers that display the category
// (search, single-listing read) populate it; write paths (create/update)
// don't re-fetch, so this falls back to the raw id rather than crashing.
function categoryName(category: IListing["category"]): string {
  const populated = category as unknown as { name?: string };
  return typeof populated === "object" && populated !== null && typeof populated.name === "string"
    ? populated.name
    : String(category);
}

// Listings have no private fields, but an explicit serializer keeps the
// response shape independent of Mongoose's default toJSON (__v, populate
// internals).
export function serializeListing(listing: IListing) {
  return {
    id: listing._id,
    sellerId: listing.sellerId,
    title: listing.title,
    description: listing.description,
    priceMinorUnits: listing.priceMinorUnits,
    currency: listing.currency,
    category: categoryName(listing.category),
    status: listing.status,
    quantity: listing.quantity,
    images: listing.images,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}
