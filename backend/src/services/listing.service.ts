import { Types } from "mongoose";
import { ListingModel, IListing, ListingStatus } from "../models/listing.model";
import { CategoryModel } from "../models/category.model";
import { IUser } from "../models/user.model";
import { SellerTier } from "../types/user.type";

// Tier limits enforced HERE, not just at the route, so a future second call
// site can't skip it. A client-side check is not a control.
const LISTING_LIMIT_BY_TIER: Record<SellerTier, number> = {
  unverified: 3,
  verified: 20,
  trusted: Infinity,
};

// Explicit transition table — anything not listed is rejected. Sold and
// withdrawn are terminal (a re-list is a new listing, not a status flip).
const ALLOWED_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ["active", "withdrawn"],
  active: ["sold", "withdrawn"],
  sold: [],
  withdrawn: [],
};

export class TierLimitError extends Error {
  code = "TIER_LIMIT";
  constructor(limit: number) {
    super(`Listing limit reached for your seller tier (max ${limit})`);
  }
}

export class InvalidTransitionError extends Error {
  code = "INVALID_TRANSITION";
  constructor(from: string, to: string) {
    super(`Cannot transition a listing from "${from}" to "${to}"`);
  }
}

export class InvalidCategoryError extends Error {
  code = "INVALID_CATEGORY";
  constructor() {
    super("Unknown category");
  }
}

interface ListingFields {
  title: string;
  description?: string;
  priceMinorUnits: number;
  category: Types.ObjectId | string;
  quantity?: number;
}

interface ListingPatch {
  title?: string;
  description?: string;
  priceMinorUnits?: number;
  category?: Types.ObjectId | string;
  quantity?: number;
  status?: ListingStatus;
}

interface SearchFilters {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  page: number;
  limit: number;
}

async function assertValidCategory(categoryId: Types.ObjectId | string): Promise<void> {
  const exists = await CategoryModel.exists({ _id: categoryId });
  if (!exists) {
    throw new InvalidCategoryError();
  }
}

export async function createListing(seller: IUser, fields: ListingFields): Promise<IListing> {
  const limit = LISTING_LIMIT_BY_TIER[seller.sellerTier] ?? LISTING_LIMIT_BY_TIER.unverified;
  // Withdrawn listings don't count against the cap.
  const activeCount = await ListingModel.countDocuments({ sellerId: seller._id, status: { $ne: "withdrawn" } });
  if (activeCount >= limit) {
    throw new TierLimitError(limit);
  }

  await assertValidCategory(fields.category);

  // Explicit field list — status/sellerId are never client-settable.
  return ListingModel.create({
    sellerId: seller._id,
    title: fields.title,
    description: fields.description,
    priceMinorUnits: fields.priceMinorUnits,
    category: fields.category,
    quantity: fields.quantity,
  });
}

export async function updateListing(listing: IListing, fields: ListingPatch): Promise<IListing> {
  if (fields.category !== undefined) {
    await assertValidCategory(fields.category);
  }

  if (fields.status !== undefined && fields.status !== listing.status) {
    const allowed = ALLOWED_TRANSITIONS[listing.status] ?? [];
    if (!allowed.includes(fields.status)) {
      throw new InvalidTransitionError(listing.status, fields.status);
    }
    listing.status = fields.status;
  }

  if (fields.title !== undefined) listing.title = fields.title;
  if (fields.description !== undefined) listing.description = fields.description;
  if (fields.priceMinorUnits !== undefined) listing.priceMinorUnits = fields.priceMinorUnits;
  if (fields.category !== undefined) listing.category = fields.category as Types.ObjectId;
  if (fields.quantity !== undefined) listing.quantity = fields.quantity;

  await listing.save();
  return listing;
}

const MAX_PAGE_SIZE = 50;

// filters is always req.validatedQuery — every field a plain string/number,
// never an object. The filter is built field-by-field, never spread. Free-
// text uses Mongo's $text (tokenized, never compiled as a regex) so there
// is no ReDoS surface on the search field.
export async function searchListings(filters: SearchFilters) {
  const filter: Record<string, unknown> = { status: "active" };

  if (filters.q) {
    filter.$text = { $search: filters.q };
  }

  if (filters.category) {
    const categoryFilter = /^[0-9a-fA-F]{24}$/.test(filters.category)
      ? { _id: filters.category }
      : { slug: filters.category };
    const category = await CategoryModel.findOne(categoryFilter);
    if (!category) {
      return { listings: [], total: 0, page: filters.page, limit: filters.limit };
    }
    if (category.parentId === null) {
      // Parent category: match listings in it OR any of its subcategories.
      const children = await CategoryModel.find({ parentId: category._id }).select("_id");
      filter.category = { $in: [category._id, ...children.map((c) => c._id)] };
    } else {
      // Leaf (subcategory): exact match.
      filter.category = category._id;
    }
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const priceFilter: Record<string, number> = {};
    if (filters.minPrice !== undefined) priceFilter.$gte = filters.minPrice;
    if (filters.maxPrice !== undefined) priceFilter.$lte = filters.maxPrice;
    filter.priceMinorUnits = priceFilter;
  }

  const limit = Math.min(filters.limit, MAX_PAGE_SIZE);
  const page = Math.max(filters.page, 1);
  const skip = (page - 1) * limit;

  const sort = filters.q ? { score: { $meta: "textScore" } } : { createdAt: -1 };
  const projection = filters.q ? { score: { $meta: "textScore" } } : undefined;

  const [listings, total] = await Promise.all([
    ListingModel.find(filter, projection).sort(sort as never).skip(skip).limit(limit).populate("category", "name slug"),
    ListingModel.countDocuments(filter),
  ]);

  return { listings, total, page, limit };
}

// A seller's own listings across ALL statuses (draft/active/sold/withdrawn),
// scoped strictly to sellerId — never the public status:"active" filter. This
// is the dashboard/management view, distinct from public search.
export async function listSellerListings(sellerId: Types.ObjectId | string): Promise<IListing[]> {
  return ListingModel.find({ sellerId }).sort({ createdAt: -1 });
}

// Soft delete — withdraws rather than hard-deleting, keeping the record.
export async function withdrawListing(listing: IListing): Promise<IListing> {
  if (listing.status === "withdrawn") {
    return listing;
  }
  const allowed = ALLOWED_TRANSITIONS[listing.status] ?? [];
  if (!allowed.includes("withdrawn")) {
    throw new InvalidTransitionError(listing.status, "withdrawn");
  }
  listing.status = "withdrawn";
  await listing.save();
  return listing;
}
