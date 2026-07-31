import { Types } from "mongoose";
import { ReviewModel, IReview } from "../models/review.model";
import { ListingModel } from "../models/listing.model";
import { OrderModel } from "../models/order.model";
import { notifyUser } from "./notification.service";

type IdLike = Types.ObjectId | string;

// A buyer earns the right to review only once they have actually received the
// item — an order for this listing that reached delivered or released.
const QUALIFYING_ORDER_STATUSES = ["delivered", "released"];

export class ListingNotFoundError extends Error {
  constructor() {
    super("Listing not found");
    this.name = "ListingNotFoundError";
  }
}
export class NoQualifyingPurchaseError extends Error {
  constructor() {
    super("A completed purchase of this item is required to review it");
    this.name = "NoQualifyingPurchaseError";
  }
}
export class AlreadyReviewedError extends Error {
  constructor() {
    super("You have already reviewed this item");
    this.name = "AlreadyReviewedError";
  }
}

export interface CreateReviewInput {
  rating: number;
  comment?: string;
}

export async function createReview(
  listingId: IdLike,
  reviewerId: IdLike,
  input: CreateReviewInput,
): Promise<IReview> {
  const listing = await ListingModel.findById(listingId);
  if (!listing) throw new ListingNotFoundError();

  // Verified-purchase gate: the reviewer must own a delivered/released order
  // for this listing. Resolved server-side — never trusts a client claim.
  const qualifying = await OrderModel.exists({
    listingId: listing._id,
    buyerId: reviewerId,
    status: { $in: QUALIFYING_ORDER_STATUSES },
  });
  if (!qualifying) throw new NoQualifyingPurchaseError();

  try {
    const review = await ReviewModel.create({
      listingId: listing._id,
      sellerId: listing.sellerId,
      reviewerId,
      rating: input.rating,
      comment: input.comment ?? "",
    });
    notifyUser(listing.sellerId, { type: "review", title: "New review", body: `Your listing "${listing.title}" received a ${input.rating}-star review.`, link: `/listings/${listing._id}` });
    return review;
  } catch (err) {
    // Unique index {listingId, reviewerId} — a second review is a duplicate.
    if ((err as { code?: number })?.code === 11000) throw new AlreadyReviewedError();
    throw err;
  }
}

export async function listReviewsForListing(listingId: IdLike): Promise<IReview[]> {
  return ReviewModel.find({ listingId }).sort({ createdAt: -1 });
}

interface RatingSummary {
  average: number; // rounded to 1 decimal, 0 when no reviews
  count: number;
}

async function aggregateRating(match: Record<string, unknown>): Promise<RatingSummary> {
  const [row] = await ReviewModel.aggregate<{ average: number; count: number }>([
    { $match: match },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  if (!row) return { average: 0, count: 0 };
  return { average: Math.round(row.average * 10) / 10, count: row.count };
}

export async function getListingRating(listingId: IdLike): Promise<RatingSummary> {
  return aggregateRating({ listingId: new Types.ObjectId(String(listingId)) });
}

export async function getSellerRating(sellerId: IdLike): Promise<RatingSummary> {
  return aggregateRating({ sellerId: new Types.ObjectId(String(sellerId)) });
}
