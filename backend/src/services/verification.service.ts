import { Types } from "mongoose";
import {
  VerificationRequestModel,
  IVerificationRequest,
  IVerificationDetails,
  VerificationStatus,
} from "../models/verification-request.model";
import { UserModel } from "../models/user.model";
import { logEvent } from "./audit.service";
import { revokeAllSessionsForUser } from "./session.service";
import {
  sendVerificationSubmittedNotification,
  sendVerificationApprovedNotification,
  sendVerificationRejectedNotification,
} from "./mail.service";

export class SelfApprovalError extends Error {
  code = "SELF_APPROVAL";
  constructor() {
    super("Admins cannot approve their own verification request");
  }
}
export class NoPendingRequestError extends Error {
  code = "NO_PENDING_REQUEST";
  constructor() {
    super("No pending verification request");
  }
}
export class RequestNotFoundError extends Error {
  code = "REQUEST_NOT_FOUND";
  constructor() {
    super("Verification request not found");
  }
}

type IdLike = Types.ObjectId | string;

export async function submitRequest(sellerId: IdLike, details: IVerificationDetails): Promise<IVerificationRequest> {
  const existing = await VerificationRequestModel.findOne({ sellerId, status: "pending" });
  if (existing) {
    throw new NoPendingRequestError();
  }

  const request = await VerificationRequestModel.create({ sellerId, details, status: "pending" });
  sendVerificationSubmittedNotification(sellerId, String(request._id));
  return request;
}

// Admin approves — tier up + session revoke + audit. Self-approval blocked.
export async function approveRequest(requestId: IdLike, adminId: IdLike): Promise<IVerificationRequest> {
  const request = await VerificationRequestModel.findById(requestId);
  if (!request) throw new RequestNotFoundError();
  if (request.status !== "pending") {
    throw new Error(`Cannot approve a request with status "${request.status}"`);
  }

  if (String(request.sellerId) === String(adminId)) {
    throw new SelfApprovalError();
  }

  const seller = await UserModel.findById(request.sellerId);
  if (!seller) throw new Error("Seller not found");

  const before = seller.sellerTier;
  const after = "verified" as const;

  seller.sellerTier = after;
  await seller.save();

  await revokeAllSessionsForUser(request.sellerId as Types.ObjectId);

  await logEvent({ actor: adminId as Types.ObjectId, subject: request.sellerId as Types.ObjectId, action: "tier_change", outcome: "success", before, after });

  request.status = "approved";
  request.reviewedBy = adminId as Types.ObjectId;
  request.reviewedAt = new Date();
  await request.save();

  sendVerificationApprovedNotification(request.sellerId, String(request._id));
  return request;
}

export async function rejectRequest(requestId: IdLike, adminId: IdLike, reason: string): Promise<IVerificationRequest> {
  const request = await VerificationRequestModel.findById(requestId);
  if (!request) throw new RequestNotFoundError();
  if (request.status !== "pending") {
    throw new Error(`Cannot reject a request with status "${request.status}"`);
  }

  request.status = "rejected";
  request.reviewedBy = adminId as Types.ObjectId;
  request.reviewedAt = new Date();
  request.rejectionReason = reason;
  await request.save();

  sendVerificationRejectedNotification(request.sellerId, String(request._id), reason);
  return request;
}

export async function getMyRequest(sellerId: IdLike): Promise<IVerificationRequest | null> {
  return VerificationRequestModel.findOne({ sellerId }).sort({ createdAt: -1 });
}

export async function listPendingRequests(): Promise<IVerificationRequest[]> {
  return VerificationRequestModel.find({ status: "pending" }).sort({ createdAt: -1 }).populate("sellerId", "email");
}

export async function listAllRequests(filters: { status?: VerificationStatus } = {}): Promise<IVerificationRequest[]> {
  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  return VerificationRequestModel.find(query).sort({ createdAt: -1 }).populate("sellerId", "email");
}
