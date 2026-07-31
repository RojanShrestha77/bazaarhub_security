import { UserModel, IUser } from "../../src/models/user.model";
import { SessionModel } from "../../src/models/session.model";
import { RecoveryCodeModel } from "../../src/models/recovery-code.model";
import { CategoryModel } from "../../src/models/category.model";
import { ListingModel, IListing } from "../../src/models/listing.model";
import { OrderModel } from "../../src/models/order.model";
import { VerificationRequestModel } from "../../src/models/verification-request.model";
import { generateSessionToken, hashSessionToken } from "../../src/lib/sessionToken";
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../src/configs/security";
import { hashPassword } from "../../src/services/password.service";
import { generateCsrfToken } from "../../src/lib/csrf";
import { Types } from "mongoose";
import { createListing as createListingService } from "../../src/services/listing.service";
import { HOLD_DURATION_MS } from "../../src/services/escrow.service";

// Always hash test fixtures through the same path production code uses
// (hashPassword -> ARGON2_OPTIONS), never argon2.hash with defaults — a
// params mismatch (p=4 vs p=1) looks exactly like a decision #7 timing leak
// but is really the fixture measuring itself.
export async function createUser(overrides: Partial<IUser> & { password?: string } = {}): Promise<IUser> {
  const passwordHash = await hashPassword(overrides.password || "correct horse battery staple");
  return UserModel.create({
    email: overrides.email || `user-${Date.now()}-${Math.random()}@example.com`,
    passwordHash,
    role: overrides.role || "buyer",
    sellerTier: overrides.sellerTier || "unverified",
    mfaEnabled: overrides.mfaEnabled ?? false,
    // Default to a verified email so existing fixtures represent active users
    // that pass the requireEmailVerified gate. Tests for the unverified path
    // pass emailVerified: false explicitly.
    emailVerified: overrides.emailVerified ?? true,
  });
}

interface SessionOverrides {
  expiresAt?: Date;
  absoluteExpiresAt?: Date;
  mfaVerified?: boolean;
  revokedAt?: Date;
}

export async function createSession(user: IUser, overrides: SessionOverrides = {}) {
  const rawToken = generateSessionToken();
  const now = Date.now();
  const session = await SessionModel.create({
    tokenHash: hashSessionToken(rawToken),
    userId: user._id,
    expiresAt: overrides.expiresAt || new Date(now + 30 * 60 * 1000),
    absoluteExpiresAt: overrides.absoluteExpiresAt || new Date(now + 7 * 24 * 60 * 60 * 1000),
    mfaVerified: overrides.mfaVerified ?? true,
    revokedAt: overrides.revokedAt,
  });

  const csrfToken = generateCsrfToken();
  const sessionCookie = `${SESSION_COOKIE_NAME}=${rawToken}`;
  const csrfCookie = `${CSRF_COOKIE_NAME}=${csrfToken}`;

  return {
    rawToken,
    cookie: sessionCookie,
    cookies: [sessionCookie, csrfCookie],
    csrfToken,
    csrfHeader: { [CSRF_HEADER_NAME]: csrfToken },
    session,
  };
}

export async function createRecoveryCode(user: IUser) {
  const plaintext = generateSessionToken().slice(0, 10);
  const codeHash = await hashPassword(plaintext);
  const doc = await RecoveryCodeModel.create({ userId: user._id, codeHash });
  return { plaintext, doc };
}

export async function createCategory(overrides: { name?: string; slug?: string } = {}) {
  const unique = `${Date.now()}-${Math.random()}`;
  return CategoryModel.create({
    name: overrides.name || `Category ${unique}`,
    slug: overrides.slug || `category-${unique}`,
  });
}

interface ListingOverrides {
  title?: string;
  description?: string;
  priceMinorUnits?: number;
  category?: unknown;
  quantity?: number;
  status?: IListing["status"];
}

export async function createListing(seller: IUser, overrides: ListingOverrides = {}): Promise<IListing> {
  const category = overrides.category || (await createCategory())._id;
  const listing = await createListingService(seller, {
    title: overrides.title || "Test listing",
    description: overrides.description,
    priceMinorUnits: overrides.priceMinorUnits ?? 10000,
    category: category as Types.ObjectId,
    quantity: overrides.quantity,
  });
  if (overrides.status && overrides.status !== listing.status) {
    listing.status = overrides.status;
    await listing.save();
  }
  return listing;
}

interface OrderOverrides {
  quantity?: number;
  priceMinorUnits?: number;
  status?: string;
  stripePaymentIntentId?: string;
  deliveredAt?: Date;
  disputedAt?: Date;
}

export async function createOrder(buyer: IUser, seller: IUser, listing: IListing, overrides: OrderOverrides = {}) {
  const quantity = overrides.quantity || 1;
  const totalMinorUnits = (overrides.priceMinorUnits ?? listing.priceMinorUnits) * quantity;

  return OrderModel.create({
    buyerId: buyer._id,
    sellerId: seller._id,
    listingId: listing._id,
    listingSnapshot: {
      title: listing.title,
      priceMinorUnits: listing.priceMinorUnits,
      currency: listing.currency || "NPR",
    },
    quantity,
    totalMinorUnits,
    holdDurationMs: HOLD_DURATION_MS[seller.sellerTier || "unverified"],
    stripePaymentIntentId: overrides.stripePaymentIntentId || `pi_test_${Date.now()}`,
    status: overrides.status || "created",
    deliveredAt: overrides.deliveredAt,
    disputedAt: overrides.disputedAt,
  });
}

export async function createVerificationRequest(seller: IUser, overrides: Record<string, unknown> = {}) {
  return VerificationRequestModel.create({
    sellerId: seller._id,
    details: (overrides.details as Record<string, unknown>) || {
      fullName: "Test Seller",
      idType: "citizenship",
      idNumber: "1234567890",
      businessName: "Test Store",
      phone: "9800000000",
      address: "Kathmandu, Nepal",
    },
    status: overrides.status || "pending",
    reviewedBy: overrides.reviewedBy,
    reviewedAt: overrides.reviewedAt,
    rejectionReason: overrides.rejectionReason,
  });
}
