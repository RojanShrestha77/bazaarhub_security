import { Request, Response, NextFunction } from "express";
import {
  checkout as checkoutService,
  confirmKhaltiPayment,
  markShipped,
  confirmDelivery,
  openDispute,
  cancelOrderByBuyer,
  updateTracking,
  resolveDispute as resolveDisputeService,
  adminRelease,
  getOrder,
  listOrders,
  getOrderEvents,
  OrderNotFoundError,
  TransitionNotAllowedError,
  GuardFailedError,
  InsufficientQuantityError,
  OwnListingError,
  ListingNotActiveError,
} from "../services/escrow.service";
import { KhaltiError } from "../services/khalti.service";
import { OrderModel } from "../models/order.model";
import { logEvent } from "../services/audit.service";
import {
  sendPaymentReceivedNotification,
  sendOrderShippedNotification,
  sendOrderDeliveredNotification,
  sendOrderDisputedNotification,
  sendOrderReleasedNotification,
  sendOrderRefundedNotification,
} from "../services/mail.service";
import { CheckoutDto, ResolveDisputeDto, ShipDto, KhaltiVerifyDto } from "../validators/escrow.schema";

export class EscrowController {
  private handleError(err: unknown, res: Response, next: NextFunction) {
    if (err instanceof OrderNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof TransitionNotAllowedError) return res.status(409).json({ error: err.message });
    if (err instanceof GuardFailedError) return res.status(409).json({ error: err.message });
    if (err instanceof InsufficientQuantityError) return res.status(409).json({ error: err.message });
    if (err instanceof OwnListingError) return res.status(400).json({ error: err.message });
    if (err instanceof ListingNotActiveError) return res.status(400).json({ error: err.message });
    if (err instanceof KhaltiError) return res.status(502).json({ error: err.message });
    next(err);
  }

  checkout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.validatedBody as CheckoutDto;
      const result = await checkoutService(body.listingId, body.quantity, req.user!._id, body.paymentMethod || "cod");
      logEvent({ actor: req.user!._id, action: "escrow_checkout", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId: String(result.order._id), paymentMethod: result.paymentMethod } }).catch(() => {});
      return res.status(201).json({
        orderId: result.order._id,
        paymentMethod: result.paymentMethod,
        status: result.order.status,
        totalMinorUnits: result.order.totalMinorUnits,
        clientSecret: result.clientSecret, // stripe
        paymentUrl: result.paymentUrl, // khalti — redirect the buyer here
      });
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  verifyKhalti = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pidx } = req.validatedBody as KhaltiVerifyDto;
      const { order, paid, status } = await confirmKhaltiPayment(pidx, req.user!._id);
      logEvent({ actor: req.user!._id, action: "escrow_khalti_verify", outcome: paid ? "success" : "failure", ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId: String(order._id), status } }).catch(() => {});
      return res.status(200).json({ orderId: order._id, paid, status });
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  listOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = req.query.role === "seller" ? "seller" : "buyer";
      const orders = await listOrders(req.user!._id, role);
      return res.status(200).json(orders);
    } catch (err) {
      next(err);
    }
  };

  getOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await getOrder(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Not found" });
      const isBuyer = String(order.buyerId) === String(req.user!._id);
      const isSeller = String(order.sellerId) === String(req.user!._id);
      const isAdmin = req.user!.role === "admin";
      if (!isBuyer && !isSeller && !isAdmin) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(order);
    } catch (err) {
      next(err);
    }
  };

  getOrderEvents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await OrderModel.findById(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Not found" });
      const isBuyer = String(order.buyerId) === String(req.user!._id);
      const isSeller = String(order.sellerId) === String(req.user!._id);
      const isAdmin = req.user!.role === "admin";
      if (!isBuyer && !isSeller && !isAdmin) return res.status(404).json({ error: "Not found" });
      const events = await getOrderEvents(req.params.orderId);
      return res.status(200).json(events);
    } catch (err) {
      next(err);
    }
  };

  cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await OrderModel.findById(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Not found" });
      if (String(order.buyerId) !== String(req.user!._id)) return res.status(404).json({ error: "Not found" });
      const updated = await cancelOrderByBuyer(req.params.orderId, req.user!._id);
      if (!updated) return res.status(409).json({ error: "Transition failed — state changed" });
      logEvent({ actor: req.user!._id, action: "escrow_cancel", outcome: "success", subject: order.sellerId, ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId: req.params.orderId, fromStatus: order.status } }).catch(() => {});
      // Both parties are notified: the buyer that their cancellation went
      // through, the seller that a held/pending order was withdrawn.
      sendOrderRefundedNotification(order.buyerId, req.params.orderId);
      sendOrderRefundedNotification(order.sellerId, req.params.orderId);
      return res.status(200).json(updated);
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  markShipped = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await OrderModel.findById(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Not found" });
      if (String(order.sellerId) !== String(req.user!._id)) return res.status(404).json({ error: "Not found" });
      const shipping = (req.validatedBody as ShipDto) || {};
      const updated = await markShipped(req.params.orderId, req.user!._id, { carrier: shipping.carrier, trackingNumber: shipping.trackingNumber });
      if (!updated) return res.status(409).json({ error: "Transition failed — state changed" });
      logEvent({ actor: req.user!._id, action: "escrow_ship", outcome: "success", subject: order.buyerId, ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId: req.params.orderId } }).catch(() => {});
      sendOrderShippedNotification(order.buyerId, req.params.orderId);
      return res.status(200).json(updated);
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  updateTracking = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const shipping = req.validatedBody as ShipDto;
      const updated = await updateTracking(req.params.orderId, req.user!._id, { carrier: shipping.carrier, trackingNumber: shipping.trackingNumber });
      if (!updated) return res.status(404).json({ error: "Not found" });
      logEvent({ actor: req.user!._id, action: "escrow_update_tracking", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId: req.params.orderId } }).catch(() => {});
      return res.status(200).json(updated);
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  confirmDelivery = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await OrderModel.findById(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Not found" });
      if (String(order.buyerId) !== String(req.user!._id)) return res.status(404).json({ error: "Not found" });
      const updated = await confirmDelivery(req.params.orderId, req.user!._id);
      if (!updated) return res.status(409).json({ error: "Transition failed — state changed" });
      logEvent({ actor: req.user!._id, action: "escrow_confirm_delivery", outcome: "success", subject: order.sellerId, ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId: req.params.orderId } }).catch(() => {});
      sendOrderDeliveredNotification(order.sellerId, req.params.orderId);
      return res.status(200).json(updated);
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  openDispute = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await OrderModel.findById(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Not found" });
      if (String(order.buyerId) !== String(req.user!._id)) return res.status(404).json({ error: "Not found" });
      const updated = await openDispute(req.params.orderId, req.user!._id);
      if (!updated) return res.status(409).json({ error: "Transition failed — state changed" });
      logEvent({ actor: req.user!._id, action: "escrow_dispute", outcome: "success", subject: order.sellerId, ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId: req.params.orderId } }).catch(() => {});
      sendOrderDisputedNotification(order.sellerId, req.params.orderId);
      return res.status(200).json(updated);
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  resolveDispute = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.validatedBody as ResolveDisputeDto;
      const order = await OrderModel.findById(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Not found" });
      const updated = await resolveDisputeService(req.params.orderId, req.user!._id, body.resolution);
      if (!updated) return res.status(409).json({ error: "Transition failed — state changed" });
      logEvent({ actor: req.user!._id, action: "escrow_resolve_dispute", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId: req.params.orderId, resolution: body.resolution } }).catch(() => {});
      // Fix: compare against the actual enum value "released" (was "release",
      // which never matched and mis-sent a refunded notice on a release).
      if (body.resolution === "released") {
        sendOrderReleasedNotification(order.sellerId, req.params.orderId);
      } else {
        sendOrderRefundedNotification(order.buyerId, req.params.orderId);
      }
      return res.status(200).json(updated);
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  adminRelease = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await OrderModel.findById(req.params.orderId);
      if (!order) return res.status(404).json({ error: "Not found" });
      const updated = await adminRelease(req.params.orderId, req.user!._id);
      if (!updated) return res.status(409).json({ error: "Transition failed — state changed" });
      logEvent({ actor: req.user!._id, action: "escrow_admin_release", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { orderId: req.params.orderId } }).catch(() => {});
      sendOrderReleasedNotification(order.sellerId, req.params.orderId);
      return res.status(200).json(updated);
    } catch (err) {
      this.handleError(err, res, next);
    }
  };
}
