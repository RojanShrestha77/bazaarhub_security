import { Types } from "mongoose";
import { CartModel, ICart } from "../models/cart.model";
import { ListingModel, IListing } from "../models/listing.model";

const MAX_QUANTITY_PER_ITEM = 10;

export class ListingNotFoundError extends Error {
  code = "LISTING_NOT_FOUND";
  constructor() {
    super("Listing not found");
  }
}
export class OwnListingError extends Error {
  code = "OWN_LISTING";
  constructor() {
    super("You cannot add your own listing to your cart");
  }
}
export class ListingNotAvailableError extends Error {
  code = "NOT_AVAILABLE";
  constructor() {
    super("This listing is not currently available");
  }
}
export class InvalidQuantityError extends Error {
  code = "INVALID_QUANTITY";
  constructor(max: number) {
    super(`Quantity must be a positive integer up to ${max}`);
  }
}

type IdLike = Types.ObjectId | string;

async function getOrCreateCart(userId: IdLike): Promise<ICart> {
  let cart = await CartModel.findOne({ userId });
  if (!cart) {
    cart = await CartModel.create({ userId, items: [] });
  }
  return cart;
}

// Shared validation for add and update — re-run in full every call, never
// trusted from a prior check.
async function assertAddable(userId: IdLike, listingId: IdLike, quantity: number): Promise<IListing> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvalidQuantityError(MAX_QUANTITY_PER_ITEM);
  }

  const listing = await ListingModel.findById(listingId);
  if (!listing) {
    throw new ListingNotFoundError();
  }
  if (String(listing.sellerId) === String(userId)) {
    throw new OwnListingError();
  }
  if (listing.status !== "active") {
    throw new ListingNotAvailableError();
  }

  const cap = Math.min(MAX_QUANTITY_PER_ITEM, listing.quantity);
  if (quantity > cap) {
    throw new InvalidQuantityError(cap);
  }

  return listing;
}

export async function addItem(userId: IdLike, listingId: IdLike, quantity: number): Promise<ICart> {
  await assertAddable(userId, listingId, quantity);

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((item) => String(item.listingId) === String(listingId));
  if (existing) {
    existing.quantity = quantity;
  } else {
    cart.items.push({ listingId: listingId as Types.ObjectId, quantity });
  }
  await cart.save();
  return cart;
}

export async function updateItemQuantity(userId: IdLike, listingId: IdLike, quantity: number): Promise<ICart> {
  await assertAddable(userId, listingId, quantity);

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((item) => String(item.listingId) === String(listingId));
  if (!existing) {
    throw new ListingNotFoundError();
  }
  existing.quantity = quantity;
  await cart.save();
  return cart;
}

export async function removeItem(userId: IdLike, listingId: IdLike): Promise<ICart> {
  const cart = await getOrCreateCart(userId);
  cart.items = cart.items.filter((item) => String(item.listingId) !== String(listingId));
  await cart.save();
  return cart;
}

interface ResolvedCartItem {
  listingId: Types.ObjectId;
  title?: string;
  image?: string;
  quantity: number;
  unitPriceMinorUnits?: number;
  lineTotalMinorUnits?: number;
  available: boolean;
  reason?: string;
}

// Re-resolves EVERY item against the live Listing — price, status, quantity
// — on every call. Nothing about a cart line is trusted from add time.
async function resolveCartItems(cart: ICart): Promise<ResolvedCartItem[]> {
  const resolved: ResolvedCartItem[] = [];
  for (const item of cart.items) {
    const listing = await ListingModel.findById(item.listingId);
    if (!listing || listing.status !== "active") {
      resolved.push({
        listingId: item.listingId,
        quantity: item.quantity,
        available: false,
        reason: !listing ? "Listing no longer exists" : `Listing is ${listing.status}`,
      });
      continue;
    }

    const availableQuantity = Math.min(listing.quantity, item.quantity);
    const available = availableQuantity >= item.quantity;

    resolved.push({
      listingId: item.listingId,
      title: listing.title,
      image: listing.images[0],
      quantity: item.quantity,
      unitPriceMinorUnits: listing.priceMinorUnits,
      lineTotalMinorUnits: listing.priceMinorUnits * item.quantity,
      available,
      reason: available ? undefined : `Only ${listing.quantity} left in stock`,
    });
  }
  return resolved;
}

export async function getCart(userId: IdLike): Promise<{ items: ResolvedCartItem[]; totalMinorUnits: number }> {
  const cart = await getOrCreateCart(userId);
  const items = await resolveCartItems(cart);
  const totalMinorUnits = items
    .filter((item) => item.available)
    .reduce((sum, item) => sum + (item.lineTotalMinorUnits ?? 0), 0);
  return { items, totalMinorUnits };
}

// Validation-only preview: re-resolves and prices, persists nothing.
export async function checkoutPreview(userId: IdLike) {
  const { items, totalMinorUnits } = await getCart(userId);
  const unavailable = items.filter((item) => !item.available);
  return { ok: unavailable.length === 0, items, unavailable, totalMinorUnits };
}
