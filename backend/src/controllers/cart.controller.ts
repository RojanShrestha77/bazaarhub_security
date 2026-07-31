import { Request, Response, NextFunction } from "express";
import {
  addItem,
  updateItemQuantity,
  removeItem,
  getCart,
  checkoutPreview,
  ListingNotFoundError,
  OwnListingError,
  ListingNotAvailableError,
  InvalidQuantityError,
} from "../services/cart.service";
import { AddCartItemDto, UpdateCartItemDto } from "../validators/cart.schema";

export class CartController {
  private handleError(err: unknown, res: Response, next: NextFunction) {
    if (err instanceof ListingNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof OwnListingError || err instanceof ListingNotAvailableError || err instanceof InvalidQuantityError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }

  // Read (always the requester's own cart).
  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cart = await getCart(req.user!._id);
      return res.status(200).json(cart);
    } catch (err) {
      next(err);
    }
  };

  addItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.validatedBody as AddCartItemDto;
      await addItem(req.user!._id, body.listingId, body.quantity);
      const cart = await getCart(req.user!._id);
      return res.status(200).json(cart);
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  updateItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.validatedBody as UpdateCartItemDto;
      await updateItemQuantity(req.user!._id, req.params.listingId, body.quantity);
      const cart = await getCart(req.user!._id);
      return res.status(200).json(cart);
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  removeItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await removeItem(req.user!._id, req.params.listingId);
      const cart = await getCart(req.user!._id);
      return res.status(200).json(cart);
    } catch (err) {
      next(err);
    }
  };

  // Validation-only preview: re-resolves price/availability, persists nothing.
  checkout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const preview = await checkoutPreview(req.user!._id);
      return res.status(preview.ok ? 200 : 409).json(preview);
    } catch (err) {
      next(err);
    }
  };
}
