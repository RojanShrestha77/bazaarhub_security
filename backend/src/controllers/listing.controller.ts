import fs from "node:fs";
import { Request, Response, NextFunction } from "express";
import {
  createListing,
  updateListing,
  withdrawListing,
  searchListings,
  listSellerListings,
  TierLimitError,
  InvalidTransitionError,
  InvalidCategoryError,
} from "../services/listing.service";
import { serializeListing } from "../services/listing-serializer";
import { ListingModel, IListing } from "../models/listing.model";
import { resolveListingImagePath } from "../middlewares/listing-image-upload";
import { ListingCreateDto, ListingUpdateDto, SearchQueryDto } from "../validators/listing.schema";

// Draft listings are visible only to their owner; everything else is
// publicly viewable. 404 not 403 — same existence-hiding reasoning.
function isVisibleTo(listing: IListing, userId: unknown): boolean {
  return listing.status !== "draft" || String(listing.sellerId) === String(userId);
}

export class ListingController {
  private handleError(err: unknown, res: Response, next: NextFunction) {
    if (err instanceof TierLimitError) {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof InvalidTransitionError || err instanceof InvalidCategoryError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }

  // Sellers only; tier limit enforced in the service.
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await createListing(req.user!, req.validatedBody as ListingCreateDto);
      return res.status(201).json(serializeListing(listing));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await searchListings(req.validatedQuery as SearchQueryDto);
      return res.status(200).json({
        listings: result.listings.map(serializeListing),
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (err) {
      next(err);
    }
  };

  // Seller's own listings, all statuses — scoped to req.user in the service.
  mine = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listings = await listSellerListings(req.user!._id);
      return res.status(200).json({ listings: listings.map(serializeListing) });
    } catch (err) {
      next(err);
    }
  };

  read = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await ListingModel.findById(req.params.id).populate("category", "name slug");
      if (!listing || !isVisibleTo(listing, req.user?._id)) {
        return res.status(404).json({ error: "Not found" });
      }
      return res.status(200).json(serializeListing(listing));
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await ListingModel.findById(req.params.id);
      if (!listing) {
        return res.status(404).json({ error: "Not found" });
      }
      const updated = await updateListing(listing, req.validatedBody as ListingUpdateDto);
      return res.status(200).json(serializeListing(updated));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  withdraw = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await ListingModel.findById(req.params.id);
      if (!listing) {
        return res.status(404).json({ error: "Not found" });
      }
      const withdrawn = await withdrawListing(listing);
      return res.status(200).json(serializeListing(withdrawn));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  addImages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.listing!.images.push(...req.uploadedImageFilenames!);
      await req.listing!.save();
      return res.status(200).json(serializeListing(req.listing!));
    } catch (err) {
      next(err);
    }
  };

  serveImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listing = await ListingModel.findById(req.params.id);
      // The filename must belong to this listing; same draft-visibility rule.
      if (!listing || !listing.images.includes(req.params.filename) || !isVisibleTo(listing, req.user?._id)) {
        return res.status(404).json({ error: "Not found" });
      }
      const filePath = resolveListingImagePath(req.params.filename);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Not found" });
      }
      return res.sendFile(filePath, (err) => {
        if (err) next(err);
      });
    } catch (err) {
      next(err);
    }
  };
}
