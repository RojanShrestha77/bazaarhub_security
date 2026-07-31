import { Request, Response, NextFunction } from "express";
import { createAuthzRouter } from "../lib/authzRouter";
import { PUBLIC, requireSession, requireRole, requireOwnership } from "../middlewares/authz";
import { requireEmailVerified } from "../middlewares/session";
import { requireCsrfToken } from "../lib/csrf";
import { listingReadLimiter, listingWriteLimiter, searchLimiter, listingImageUploadLimiter } from "../middlewares/rate-limiters";
import { validateBody, validateQuery, validateObjectIdParam } from "../middlewares/validate";
import { listingCreateSchema, listingUpdateSchema, searchQuerySchema } from "../validators/listing.schema";
import { reviewCreateSchema } from "../validators/review.schema";
import { ListingModel } from "../models/listing.model";
import { receiveListingImages, validateAndStoreListingImages } from "../middlewares/listing-image-upload";
import { ListingController } from "../controllers/listing.controller";
import { ReviewController } from "../controllers/review.controller";

const router = createAuthzRouter();
const listing = new ListingController();
const review = new ReviewController();

// Ownership resolver + attach middleware stay at the route (wiring concern).
async function resolveListingOwner(req: Request) {
  const found = await ListingModel.findById(req.params.id);
  return found?.sellerId ?? null;
}

async function attachListing(req: Request, _res: Response, next: NextFunction) {
  try {
    req.listing = await ListingModel.findById(req.params.id);
    next();
  } catch (err) {
    next(err);
  }
}

router.post("/", [requireSession, requireRole("seller")], requireEmailVerified, requireCsrfToken, listingWriteLimiter, validateBody(listingCreateSchema), listing.create);

// Search registered BEFORE /:id so "/search" isn't captured as :id.
router.get("/search", PUBLIC, searchLimiter, validateQuery(searchQuerySchema), listing.search);

// Seller's own listings (all statuses). Also before /:id. Seller-only.
router.get("/mine", [requireSession, requireRole("seller")], listingReadLimiter, listing.mine);

router.get("/:id", PUBLIC, listingReadLimiter, validateObjectIdParam("id"), listing.read);

router.patch(
  "/:id",
  [requireSession, requireOwnership(resolveListingOwner)],
  requireCsrfToken,
  listingWriteLimiter,
  validateObjectIdParam("id"),
  validateBody(listingUpdateSchema),
  listing.update,
);

router.delete("/:id", [requireSession, requireOwnership(resolveListingOwner)], requireCsrfToken, listingWriteLimiter, validateObjectIdParam("id"), listing.withdraw);

router.post(
  "/:id/images",
  [requireSession, requireOwnership(resolveListingOwner)],
  requireCsrfToken,
  listingImageUploadLimiter,
  validateObjectIdParam("id"),
  attachListing,
  receiveListingImages,
  validateAndStoreListingImages,
  listing.addImages,
);

router.get("/:id/images/:filename", PUBLIC, listingReadLimiter, validateObjectIdParam("id"), listing.serveImage);

// ── Reviews (verified-purchase) ──
router.get("/:id/reviews", PUBLIC, listingReadLimiter, validateObjectIdParam("id"), review.list);
router.post("/:id/reviews", [requireSession], requireCsrfToken, listingWriteLimiter, validateObjectIdParam("id"), validateBody(reviewCreateSchema), review.create);

export default router;
