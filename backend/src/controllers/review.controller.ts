import { Request, Response, NextFunction } from "express";
import {
  createReview,
  listReviewsForListing,
  getListingRating,
  ListingNotFoundError,
  NoQualifyingPurchaseError,
  AlreadyReviewedError,
} from "../services/review.service";
import { logEvent } from "../services/audit.service";
import { ReviewCreateDto } from "../validators/review.schema";

function serializeReview(r: {
  _id: unknown;
  reviewerId: unknown;
  rating: number;
  comment: string;
  createdAt: Date;
}) {
  // Never leak more than the public shape. reviewerId is included so the client
  // can attribute the review, but no email/profile is joined in here.
  return { id: r._id, reviewerId: r.reviewerId, rating: r.rating, comment: r.comment, createdAt: r.createdAt };
}

export class ReviewController {
  private handleError(err: unknown, res: Response, next: NextFunction) {
    if (err instanceof ListingNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof NoQualifyingPurchaseError) return res.status(403).json({ error: err.message });
    if (err instanceof AlreadyReviewedError) return res.status(409).json({ error: err.message });
    next(err);
  }

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.validatedBody as ReviewCreateDto;
      const review = await createReview(req.params.id, req.user!._id, body);
      logEvent({ actor: req.user!._id, action: "review_create", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { listingId: req.params.id, rating: body.rating } }).catch(() => {});
      return res.status(201).json(serializeReview(review));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [reviews, summary] = await Promise.all([
        listReviewsForListing(req.params.id),
        getListingRating(req.params.id),
      ]);
      return res.status(200).json({ summary, reviews: reviews.map(serializeReview) });
    } catch (err) {
      next(err);
    }
  };
}
