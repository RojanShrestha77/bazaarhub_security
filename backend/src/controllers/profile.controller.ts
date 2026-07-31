import fs from "node:fs";
import { Request, Response, NextFunction } from "express";
import {
  getOrCreateProfile,
  updateProfile,
  setAvatarPath,
  serializePublicProfile,
  serializePrivateProfile,
} from "../services/profile.service";
import { resolveAvatarPath } from "../middlewares/avatar-upload";
import { UserModel } from "../models/user.model";
import { verifyPassword } from "../services/password.service";
import { deleteAccount, ActiveOrdersExistError } from "../services/account-deletion.service";
import { getSellerRating } from "../services/review.service";
import { clearSessionCookie } from "../lib/cookies";
import { logEvent } from "../services/audit.service";
import { AccountDeleteDto } from "../validators/profile.schema";

export class ProfileController {
  private streamAvatar(storedFilename: string | null, res: Response, next: NextFunction) {
    if (!storedFilename) {
      return res.status(404).json({ error: "No avatar set" });
    }
    const filePath = resolveAvatarPath(storedFilename);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: "No avatar set" });
    }
    return res.sendFile(filePath, (err) => {
      if (err) next(err);
    });
  }

  // ── Own profile ──
  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await getOrCreateProfile(req.user!._id);
      return res.status(200).json(serializePrivateProfile(profile, req.user!));
    } catch (err) {
      next(err);
    }
  };

  patchMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await updateProfile(req.user!._id, req.validatedBody as Record<string, unknown>);
      return res.status(200).json(serializePrivateProfile(profile!, req.user!));
    } catch (err) {
      next(err);
    }
  };

  uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await setAvatarPath(req.user!._id, req.avatarFilename!);
      return res.status(200).json(serializePrivateProfile(profile!, req.user!));
    } catch (err) {
      next(err);
    }
  };

  getMyAvatar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await getOrCreateProfile(req.user!._id);
      return this.streamAvatar(profile.avatarPath, res, next);
    } catch (err) {
      next(err);
    }
  };

  // ── Data export / import — operate exclusively on req.user._id ──
  exportMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await getOrCreateProfile(req.user!._id);
      // Explicit field list, never toObject()/populate() — those can carry
      // passwordHash/totpSecret/loginFailure that must never leave the server.
      return res.status(200).json({
        user: {
          email: req.user!.email,
          role: req.user!.role,
          sellerTier: req.user!.sellerTier,
          mfaEnabled: req.user!.mfaEnabled,
          createdAt: req.user!.createdAt,
        },
        profile: {
          displayName: profile.displayName,
          bio: profile.bio,
          location: profile.location,
          hasAvatar: Boolean(profile.avatarPath),
        },
      });
    } catch (err) {
      next(err);
    }
  };

  // Reuses the exact same .strict() schema as PATCH /me — writing role/tier
  // through this path is provably impossible.
  importMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await updateProfile(req.user!._id, req.validatedBody as Record<string, unknown>);
      return res.status(200).json(serializePrivateProfile(profile!, req.user!));
    } catch (err) {
      next(err);
    }
  };

  // ── Account deletion / erasure (self-only) ──
  deleteMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword } = req.validatedBody as AccountDeleteDto;
      const valid = await verifyPassword(req.user!.passwordHash, currentPassword);
      if (!valid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      await deleteAccount(req.user!._id);
      clearSessionCookie(res);
      logEvent({ actor: req.user!._id, action: "account_delete", outcome: "success", ip: req.ip, userAgent: req.get("user-agent") }).catch(() => {});
      return res.status(204).end();
    } catch (err) {
      if (err instanceof ActiveOrdersExistError) {
        return res.status(409).json({ error: "Resolve orders that are still in progress before deleting your account" });
      }
      next(err);
    }
  };

  // ── Public profile viewing — serializePublicProfile never includes
  // sensitive fields, so this needs no ownership gate. ──
  getPublic = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await UserModel.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "Not found" });
      }
      const profile = await getOrCreateProfile(user._id);
      const base = serializePublicProfile(profile);
      // Sellers carry a public rating badge aggregated from verified-purchase
      // reviews across all their listings. Buyers have no such field.
      if (user.role === "seller") {
        const sellerRating = await getSellerRating(user._id);
        return res.status(200).json({ ...base, sellerRating });
      }
      return res.status(200).json(base);
    } catch (err) {
      next(err);
    }
  };

  getPublicAvatar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await UserModel.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "Not found" });
      }
      const profile = await getOrCreateProfile(user._id);
      return this.streamAvatar(profile.avatarPath, res, next);
    } catch (err) {
      next(err);
    }
  };
}
