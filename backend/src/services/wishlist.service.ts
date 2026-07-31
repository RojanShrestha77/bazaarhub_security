import { Types } from "mongoose";
import { WishlistItemModel } from "../models/wishlist-item.model";
import { ListingModel, IListing } from "../models/listing.model";

type IdLike = Types.ObjectId | string;

export class ListingNotFoundError extends Error {
  constructor() {
    super("Listing not found");
    this.name = "ListingNotFoundError";
  }
}

export async function addToWishlist(userId: IdLike, listingId: IdLike): Promise<boolean> {
  const listing = await ListingModel.findById(listingId).select("_id");
  if (!listing) throw new ListingNotFoundError();

  const res = await WishlistItemModel.updateOne(
    { userId, listingId },
    { $setOnInsert: { userId, listingId, createdAt: new Date() } },
    { upsert: true },
  );
  return res.upsertedCount === 1;
}

// Idempotent remove — removing something not saved is a no-op success.
export async function removeFromWishlist(userId: IdLike, listingId: IdLike): Promise<void> {
  await WishlistItemModel.deleteOne({ userId, listingId });
}

// The user's saved listings, newest-saved first. Listings deleted/withdrawn
// since saving are simply skipped rather than returned as dangling ids.
export async function listWishlist(userId: IdLike): Promise<IListing[]> {
  const items = await WishlistItemModel.find({ userId }).sort({ createdAt: -1 });
  const ids = items.map((i) => i.listingId);
  if (ids.length === 0) return [];
  const listings = await ListingModel.find({ _id: { $in: ids } });
  // Preserve saved-order (find() doesn't guarantee $in order).
  const byId = new Map(listings.map((l) => [String(l._id), l]));
  const ordered: IListing[] = [];
  for (const id of ids) {
    const l = byId.get(String(id));
    if (l) ordered.push(l);
  }
  return ordered;
}
