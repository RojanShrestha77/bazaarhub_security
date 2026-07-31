import fs from "node:fs";
import { Types } from "mongoose";
import { UserModel } from "../models/user.model";
import { ProfileModel } from "../models/profile.model";
import { OrderModel } from "../models/order.model";
import { resolveAvatarPath } from "../middlewares/avatar-upload";
import { revokeAllSessionsForUser } from "./session.service";
import { invalidateAllResetTokensForUser } from "./password-reset.service";
import { invalidateVerificationTokensForUser } from "./email-verification.service";

// Orders in these states have no outstanding escrow obligation — funds are
// settled (released/refunded) or the order never progressed (cancelled). Any
// other state means money or delivery is still in flight and the account
// cannot be closed until it resolves.
const TERMINAL_ORDER_STATUSES = ["released", "refunded", "cancelled"];

export class ActiveOrdersExistError extends Error {
  constructor() {
    super("Account has orders that are still in progress");
    this.name = "ActiveOrdersExistError";
  }
}

export async function hasActiveOrders(userId: Types.ObjectId): Promise<boolean> {
  const count = await OrderModel.countDocuments({
    $or: [{ buyerId: userId }, { sellerId: userId }],
    status: { $nin: TERMINAL_ORDER_STATUSES },
  });
  return count > 0;
}

// Erase a user by anonymization. The User row survives (so historical orders,
// escrow events, and audit logs keep valid foreign keys), but every piece of
// personal data is scrubbed and the account is permanently closed.
export async function deleteAccount(userId: Types.ObjectId): Promise<void> {
  if (await hasActiveOrders(userId)) throw new ActiveOrdersExistError();

  const user = await UserModel.findById(userId);
  if (!user || user.deletedAt) return; // idempotent — already gone

  // Scrub the profile: text PII cleared, avatar file removed from disk.
  const profile = await ProfileModel.findOne({ userId });
  if (profile?.avatarPath) {
    const filePath = resolveAvatarPath(profile.avatarPath);
    if (filePath) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* best-effort: a missing avatar file must not block erasure */
      }
    }
  }
  await ProfileModel.updateOne(
    { userId },
    { $set: { displayName: "", bio: "", location: "", avatarPath: null } },
  );

  // Tombstone the user. The email is anonymized to a unique, unusable value
  // (keeps the unique index happy and frees the original address for reuse);
  // MFA secret and password history are dropped. passwordHash is left intact
  // so the timing-safe login path still has a real hash to compare against —
  // authentication is blocked by deletedAt, not by a malformed hash.
  user.email = `deleted-${user._id.toString()}@deleted.invalid`;
  user.deletedAt = new Date();
  user.mfaEnabled = false;
  user.totpSecret = undefined;
  user.totpLastUsedStep = undefined;
  user.passwordHistory = [];
  user.sellerApplicationStatus = "none";
  await user.save();

  // Kill every live credential path.
  await revokeAllSessionsForUser(userId);
  await invalidateAllResetTokensForUser(userId);
  await invalidateVerificationTokensForUser(userId);
}
