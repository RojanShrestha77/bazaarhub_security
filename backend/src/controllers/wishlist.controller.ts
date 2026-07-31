import { Request, Response, NextFunction } from "express";
import {
  addToWishlist,
  removeFromWishlist,
  listWishlist,
  ListingNotFoundError,
} from "../services/wishlist.service";
import { serializeListing } from "../services/listing-serializer";

export class WishlistController {
  private handleError(err: unknown, res: Response, next: NextFunction) {
    if (err instanceof ListingNotFoundError) return res.status(404).json({ error: err.message });
    next(err);
  }

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listings = await listWishlist(req.user!._id);
      return res.status(200).json({ items: listings.map(serializeListing) });
    } catch (err) {
      next(err);
    }
  };

  add = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const created = await addToWishlist(req.user!._id, req.params.listingId);
      return res.status(created ? 201 : 200).json({ saved: true });
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await removeFromWishlist(req.user!._id, req.params.listingId);
      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}
