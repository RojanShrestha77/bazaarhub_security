import { Types } from "mongoose";
import { UserModel, IUser } from "../models/user.model";
import { logEvent } from "./audit.service";

export class SellerApplicationError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Self-service seller request by a logged-in user. Only a buyer whose
// application is not already open may apply — this can ONLY move the status to
// "pending", never grant the seller role (that is admin-only, see
// admin.service.approveSellerApplication). A rejected applicant may re-apply.
export async function applyForSeller(userId: Types.ObjectId): Promise<IUser> {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new SellerApplicationError("NOT_FOUND", "User not found", 404);
  }
  if (user.role === "seller") {
    throw new SellerApplicationError("ALREADY_SELLER", "You are already a seller");
  }
  if (user.role === "admin") {
    throw new SellerApplicationError("ADMIN_INELIGIBLE", "Admins cannot apply as sellers");
  }
  if (user.sellerApplicationStatus === "pending") {
    throw new SellerApplicationError("ALREADY_PENDING", "Your seller application is already under review");
  }

  user.sellerApplicationStatus = "pending";
  await user.save();

  await logEvent({ actor: userId, subject: userId, action: "seller_application_submit", outcome: "success" }).catch(() => {});

  return user;
}
