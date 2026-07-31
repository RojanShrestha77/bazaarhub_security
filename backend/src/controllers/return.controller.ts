import { Request, Response, NextFunction } from "express";
import {
  requestReturn,
  approveReturn,
  rejectReturn,
  listReturns,
  OrderNotFoundError,
  OrderNotReturnableError,
  ReturnAlreadyExistsError,
  ReturnNotFoundError,
  ReturnNotActionableError,
} from "../services/return.service";
import { logEvent } from "../services/audit.service";
import { IReturnRequest } from "../models/return-request.model";
import { ReturnRequestDto } from "../validators/return.schema";

function serialize(r: IReturnRequest) {
  return { id: r._id, orderId: r.orderId, buyerId: r.buyerId, sellerId: r.sellerId, reason: r.reason, status: r.status, resolvedAt: r.resolvedAt, createdAt: r.createdAt };
}

export class ReturnController {
  private handleError(err: unknown, res: Response, next: NextFunction) {
    if (err instanceof OrderNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof ReturnNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof OrderNotReturnableError) return res.status(400).json({ error: err.message });
    if (err instanceof ReturnAlreadyExistsError) return res.status(409).json({ error: err.message });
    if (err instanceof ReturnNotActionableError) return res.status(409).json({ error: err.message });
    next(err);
  }

  request = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId, reason } = req.validatedBody as ReturnRequestDto;
      const rr = await requestReturn(orderId, req.user!._id, reason);
      logEvent({ actor: req.user!._id, action: "return_request", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId } }).catch(() => {});
      return res.status(201).json(serialize(rr));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const returns = await listReturns(req.user!._id, req.user!.role);
      return res.status(200).json({ returns: returns.map(serialize) });
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rr = await approveReturn(req.params.id, req.user!._id, req.user!.role === "admin");
      logEvent({ actor: req.user!._id, action: "return_approve", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { returnId: req.params.id } }).catch(() => {});
      return res.status(200).json(serialize(rr));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rr = await rejectReturn(req.params.id, req.user!._id, req.user!.role === "admin");
      logEvent({ actor: req.user!._id, action: "return_reject", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { returnId: req.params.id } }).catch(() => {});
      return res.status(200).json(serialize(rr));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };
}
