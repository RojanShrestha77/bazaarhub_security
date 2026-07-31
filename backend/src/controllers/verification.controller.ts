import { Request, Response, NextFunction } from "express";
import {
  submitRequest,
  approveRequest,
  rejectRequest,
  getMyRequest,
  listPendingRequests,
  listAllRequests,
  SelfApprovalError,
  NoPendingRequestError,
  RequestNotFoundError,
} from "../services/verification.service";
import { VerificationStatus } from "../models/verification-request.model";
import { logEvent } from "../services/audit.service";
import { RejectVerificationDto, VerificationSubmitDto } from "../validators/verification.schema";

export class VerificationController {
  private handleError(err: unknown, res: Response, next: NextFunction) {
    if (err instanceof SelfApprovalError) return res.status(400).json({ error: err.message });
    if (err instanceof NoPendingRequestError) return res.status(409).json({ error: err.message });
    if (err instanceof RequestNotFoundError) return res.status(404).json({ error: err.message });
    next(err);
  }

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.validatedBody as VerificationSubmitDto;
      const request = await submitRequest(req.user!._id, {
        fullName: body.fullName,
        idType: body.idType,
        idNumber: body.idNumber,
        businessName: body.businessName ?? "",
        phone: body.phone,
        address: body.address,
      });
      logEvent({ actor: req.user!._id, action: "verification_submit", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { requestId: String(request._id) } }).catch(() => {});
      return res.status(201).json({ id: request._id, status: request.status, createdAt: request.createdAt });
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  getStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await getMyRequest(req.user!._id);
      if (!request) {
        return res.status(200).json({ status: null, message: "No verification request found" });
      }
      return res.status(200).json({
        id: request._id,
        status: request.status,
        rejectionReason: request.rejectionReason,
        createdAt: request.createdAt,
        reviewedAt: request.reviewedAt,
      });
    } catch (err) {
      next(err);
    }
  };

  listRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status as VerificationStatus | undefined;
      const requests = status ? await listAllRequests({ status }) : await listPendingRequests();
      return res.status(200).json(requests);
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request = await approveRequest(req.params.id, req.user!._id);
      return res.status(200).json({ id: request._id, status: request.status, reviewedAt: request.reviewedAt });
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reason = (req.validatedBody as RejectVerificationDto).reason;
      const request = await rejectRequest(req.params.id, req.user!._id, reason);
      logEvent({ actor: req.user!._id, action: "verification_reject", outcome: "success", subject: request.sellerId, ip: req.ip, userAgent: req.get("user-agent"), metadata: { requestId: req.params.id, reason } }).catch(() => {});
      return res.status(200).json({ id: request._id, status: request.status, rejectionReason: request.rejectionReason, reviewedAt: request.reviewedAt });
    } catch (err) {
      this.handleError(err, res, next);
    }
  };
}
