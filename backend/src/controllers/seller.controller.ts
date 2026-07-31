import { Request, Response, NextFunction } from "express";
import { applyForSeller, SellerApplicationError } from "../services/seller.service";
import { getSellerAnalytics, getPayoutSummary, listPayouts } from "../services/seller-analytics.service";

export class SellerController {
  apply = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await applyForSeller(req.user!._id);
      return res.status(200).json({ sellerApplicationStatus: user.sellerApplicationStatus });
    } catch (err) {
      if (err instanceof SellerApplicationError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      next(err);
    }
  };

  // Seller's own sales analytics — scoped to req.user, so no cross-seller leak.
  analytics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getSellerAnalytics(req.user!._id);
      return res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  };

  // Seller's own payout summary + history.
  payouts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [summary, history] = await Promise.all([getPayoutSummary(req.user!._id), listPayouts(req.user!._id)]);
      return res.status(200).json({
        summary,
        payouts: history.map((p) => ({ id: p._id, amountMinorUnits: p.amountMinorUnits, note: p.note, createdAt: p.createdAt })),
      });
    } catch (err) {
      next(err);
    }
  };
}
