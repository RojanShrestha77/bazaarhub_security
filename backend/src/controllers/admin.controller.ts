import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { UserModel } from "../models/user.model";
import {
  changeUserRole,
  changeUserTier,
  listSellerApplications,
  approveSellerApplication,
  rejectSellerApplication,
  SelfTargetError,
} from "../services/admin.service";
import { RoleChangeDto, TierChangeDto, PayoutDto } from "../validators/admin.schema";
import { recordPayout, getPayoutSummary, PayoutAmountError } from "../services/seller-analytics.service";
import { logEvent } from "../services/audit.service";

export class AdminController {
  list = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await UserModel.find({}).select("-passwordHash -passwordHistory -mfaSecret -recoveryCodes").lean();
      return res.status(200).json(users);
    } catch (err) {
      next(err);
    }
  };

  // Record a payout of released earnings to a seller. Guarded against
  // over-disbursing beyond the seller's available balance in the service.
  sellerPayoutSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      return res.status(200).json(await getPayoutSummary(req.params.id));
    } catch (err) {
      next(err);
    }
  };

  recordSellerPayout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amountMinorUnits, note } = req.validatedBody as PayoutDto;
      const payout = await recordPayout(req.params.id, amountMinorUnits, req.user!._id, note ?? "");
      logEvent({ actor: req.user!._id, subject: new Types.ObjectId(req.params.id), action: "seller_payout", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { amountMinorUnits } }).catch(() => {});
      return res.status(201).json({ id: payout._id, amountMinorUnits: payout.amountMinorUnits });
    } catch (err) {
      if (err instanceof PayoutAmountError) return res.status(400).json({ error: err.message });
      next(err);
    }
  };

  // :id is re-resolved server-side by the service (findById), never trusted
  // as proof of anything on its own.
  changeRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subject = await changeUserRole(req.user!._id, req.params.id, (req.validatedBody as RoleChangeDto).role);
      if (!subject) {
        return res.status(404).json({ error: "Not found" });
      }
      return res.status(200).json({ id: subject._id, role: subject.role });
    } catch (err) {
      if (err instanceof SelfTargetError) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  };

  listSellerApplications = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const applicants = await listSellerApplications();
      return res.status(200).json(applicants);
    } catch (err) {
      next(err);
    }
  };

  approveSellerApplication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subject = await approveSellerApplication(req.user!._id, req.params.id);
      if (!subject) {
        return res.status(404).json({ error: "Not found" });
      }
      return res.status(200).json({ id: subject._id, role: subject.role, sellerApplicationStatus: subject.sellerApplicationStatus });
    } catch (err) {
      if (err instanceof SelfTargetError) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  };

  rejectSellerApplication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subject = await rejectSellerApplication(req.user!._id, req.params.id);
      if (!subject) {
        return res.status(404).json({ error: "Not found" });
      }
      return res.status(200).json({ id: subject._id, sellerApplicationStatus: subject.sellerApplicationStatus });
    } catch (err) {
      if (err instanceof SelfTargetError) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  };

  changeTier = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subject = await changeUserTier(req.user!._id, req.params.id, (req.validatedBody as TierChangeDto).sellerTier);
      if (!subject) {
        return res.status(404).json({ error: "Not found" });
      }
      return res.status(200).json({ id: subject._id, sellerTier: subject.sellerTier });
    } catch (err) {
      if (err instanceof SelfTargetError) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  };
}
