import { Types } from "mongoose";
import { OrderModel, IOrder, OrderStatus } from "../models/order.model";
import { EscrowEventModel, EscrowTriggerType } from "../models/escrow-event.model";
import { WebhookEventModel } from "../models/webhook-event.model";
import { ReturnRequestModel } from "../models/return-request.model";
import { ListingModel } from "../models/listing.model";
import { UserModel } from "../models/user.model";
import { SellerTier } from "../types/user.type";
import * as stripeService from "./stripe.service";
import {
  sendPaymentReceivedNotification,
  sendOrderShippedNotification,
  sendOrderDeliveredNotification,
  sendOrderDisputedNotification,
  sendOrderReleasedNotification,
  sendOrderRefundedNotification,
} from "./mail.service";
import { notifyUser } from "./notification.service";
import { initiateKhaltiPayment, lookupKhaltiPayment } from "./khalti.service";

// In-app notification helper for order events — mirrors the transactional
// emails, deep-linking to the order. Fire-and-forget, same as the emails.
function notifyOrder(userId: IdLike, orderId: IdLike, title: string, body: string): void {
  notifyUser(userId, { type: "order_update", title, body, link: `/orders/${orderId}` });
}

// ── State machine: data-driven transition table ──
interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  whoCanTrigger: EscrowTriggerType[];
  guards: string[];
}

const TRANSITIONS: TransitionRule[] = [
  { from: "created", to: "payment_held", whoCanTrigger: ["webhook"], guards: [] },
  { from: "payment_held", to: "shipped", whoCanTrigger: ["seller"], guards: [] },
  { from: "payment_held", to: "disputed", whoCanTrigger: ["buyer"], guards: ["dispute_window_open"] },
  { from: "shipped", to: "delivered", whoCanTrigger: ["buyer"], guards: [] },
  { from: "shipped", to: "disputed", whoCanTrigger: ["buyer"], guards: ["dispute_window_open"] },
  { from: "delivered", to: "released", whoCanTrigger: ["system", "admin"], guards: ["hold_expired"] },
  // Return approval: seller or admin refunds a delivered order.
  { from: "delivered", to: "refunded", whoCanTrigger: ["seller", "admin"], guards: [] },
  { from: "disputed", to: "refunded", whoCanTrigger: ["admin"], guards: [] },
  { from: "disputed", to: "released", whoCanTrigger: ["admin"], guards: [] },
];

const GUARDS: Record<string, (order: IOrder) => Promise<boolean>> = {
  dispute_window_open: async (order) => {
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - order.createdAt.getTime() < windowMs;
  },
  hold_expired: async (order) => {
    if (!order.deliveredAt) return false;
    return Date.now() - order.deliveredAt.getTime() >= order.holdDurationMs;
  },
};

export const HOLD_DURATION_MS: Record<SellerTier, number> = {
  trusted: 3 * 24 * 60 * 60 * 1000,
  verified: 7 * 24 * 60 * 60 * 1000,
  unverified: 14 * 24 * 60 * 60 * 1000,
};

// ── Error classes ──
export class TransitionNotAllowedError extends Error {
  constructor(fromStatus: string, toStatus: string, reason: string) {
    super(`Transition from ${fromStatus} to ${toStatus} not allowed: ${reason}`);
    this.name = "TransitionNotAllowedError";
  }
}
export class GuardFailedError extends Error {
  constructor(fromStatus: string, toStatus: string, guard: string) {
    super(`Guard "${guard}" failed for transition ${fromStatus} -> ${toStatus}`);
    this.name = "GuardFailedError";
  }
}
export class InsufficientQuantityError extends Error {
  constructor() {
    super("Insufficient quantity available");
    this.name = "InsufficientQuantityError";
  }
}
export class OrderNotFoundError extends Error {
  constructor() {
    super("Order not found");
    this.name = "OrderNotFoundError";
  }
}
export class OwnListingError extends Error {
  constructor() {
    super("Cannot purchase your own listing");
    this.name = "OwnListingError";
  }
}
export class ListingNotActiveError extends Error {
  constructor() {
    super("Listing is not available for purchase");
    this.name = "ListingNotActiveError";
  }
}

type IdLike = Types.ObjectId | string;

interface TransitionOptions {
  reason?: string;
  metadata?: Record<string, unknown>;
  disputeResolvedBy?: IdLike;
  disputeResolution?: "released" | "refunded";
  stripePaymentIntentId?: string;
  carrier?: string;
  trackingNumber?: string;
}

export interface ShippingDetails {
  carrier?: string;
  trackingNumber?: string;
}

function lookupTransition(fromStatus: string, toStatus: string, triggerType: string): TransitionRule | undefined {
  return TRANSITIONS.find((t) => t.from === fromStatus && t.to === toStatus && t.whoCanTrigger.includes(triggerType as EscrowTriggerType));
}

// Core atomic transition: the status change is a single findOneAndUpdate
// keyed on {_id, status: fromStatus} so two concurrent transitions can't
// both win. Every attempt — legal, illegal, or lost race — writes an
// immutable EscrowEvent.
export async function transitionOrder(
  orderId: IdLike,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  triggerType: EscrowTriggerType,
  actorId: IdLike | null,
  options: TransitionOptions = {},
): Promise<IOrder | null> {
  const transition = lookupTransition(fromStatus, toStatus, triggerType);
  if (!transition) {
    const order = await OrderModel.findById(orderId).select("status");
    const currentStatus = order ? order.status : "unknown";
    await EscrowEventModel.create({
      orderId,
      fromStatus,
      toStatus,
      triggeredBy: actorId,
      triggerType: "system",
      reason: `Illegal transition attempt: ${fromStatus} -> ${toStatus} by ${triggerType} (current: ${currentStatus})`,
      metadata: { illegal: true },
    });
    throw new TransitionNotAllowedError(fromStatus, toStatus, `${triggerType} cannot make this transition`);
  }

  const orderForGuard = await OrderModel.findById(orderId);
  if (!orderForGuard) throw new OrderNotFoundError();
  for (const guard of transition.guards) {
    if (!(await GUARDS[guard](orderForGuard))) {
      throw new GuardFailedError(fromStatus, toStatus, guard);
    }
  }

  const $set: Record<string, unknown> = { status: toStatus };
  if (toStatus === "shipped") {
    $set.shippedAt = new Date();
    if (options.carrier !== undefined) $set.carrier = options.carrier;
    if (options.trackingNumber !== undefined) $set.trackingNumber = options.trackingNumber;
  }
  if (toStatus === "delivered") $set.deliveredAt = new Date();
  if (toStatus === "disputed") $set.disputedAt = new Date();
  if (toStatus === "released") $set.releasedAt = new Date();
  if (toStatus === "refunded") $set.refundedAt = new Date();
  if (options.disputeResolvedBy) $set.disputeResolvedBy = options.disputeResolvedBy;
  if (options.disputeResolution) $set.disputeResolution = options.disputeResolution;
  if (options.stripePaymentIntentId) $set.stripePaymentIntentId = options.stripePaymentIntentId;

  const updated = await OrderModel.findOneAndUpdate({ _id: orderId, status: fromStatus }, { $set }, { new: true });

  if (!updated) {
    await EscrowEventModel.create({
      orderId,
      fromStatus,
      toStatus,
      triggeredBy: actorId,
      triggerType,
      reason: "Race lost or status already changed",
      metadata: { lostRace: true },
    });
    return null;
  }

  await EscrowEventModel.create({
    orderId,
    fromStatus,
    toStatus,
    triggeredBy: actorId,
    triggerType: triggerType || "system",
    reason: options.reason || "",
    metadata: options.metadata || {},
  });

  return updated;
}

// ── Domain methods ──
export type PaymentMethod = "stripe" | "khalti" | "cod";

export interface CheckoutResult {
  order: IOrder;
  paymentMethod: PaymentMethod;
  clientSecret?: string | null; // stripe
  paymentUrl?: string; // khalti — redirect the buyer here
}

export async function checkout(
  listingId: IdLike,
  quantity: number,
  buyerId: IdLike,
  paymentMethod: PaymentMethod = "stripe",
): Promise<CheckoutResult> {
  const listing = await ListingModel.findById(listingId);
  if (!listing || listing.status !== "active") throw new ListingNotActiveError();
  if (String(listing.sellerId) === String(buyerId)) throw new OwnListingError();
  if (listing.quantity < quantity) throw new InsufficientQuantityError();

  const seller = await UserModel.findById(listing.sellerId).select("sellerTier");
  const sellerTier: SellerTier = seller?.sellerTier || "unverified";
  const holdDurationMs = HOLD_DURATION_MS[sellerTier] || HOLD_DURATION_MS.unverified;
  const totalMinorUnits = listing.priceMinorUnits * quantity;

  // Reserve stock atomically before taking payment — the conditional $inc
  // can't oversell. Rolled back below if the chosen payment path fails.
  const reserved = await ListingModel.findOneAndUpdate(
    { _id: listingId, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity } },
    { new: true },
  );
  if (!reserved) throw new InsufficientQuantityError();
  const rollbackStock = () => ListingModel.findOneAndUpdate({ _id: listingId }, { $inc: { quantity } });

  const base = {
    buyerId,
    sellerId: listing.sellerId,
    listingId: listing._id,
    listingSnapshot: { title: listing.title, priceMinorUnits: listing.priceMinorUnits, currency: listing.currency || "NPR" },
    quantity,
    totalMinorUnits,
    holdDurationMs,
  };

  // ── Cash on Delivery: no online payment. Confirmed immediately; the buyer
  // pays cash when the order is delivered. Goes straight to payment_held so
  // the seller can ship. ──
  if (paymentMethod === "cod") {
    const order = await OrderModel.create({ ...base, paymentMethod: "cod", status: "payment_held" });
    await EscrowEventModel.create({ orderId: order._id, fromStatus: null, toStatus: "payment_held", triggeredBy: buyerId, triggerType: "buyer", reason: "COD order placed — pay on delivery" });
    notifyOrder(order.sellerId, order._id, "New order (Cash on Delivery)", `New COD order for "${listing.title}". Ship it and collect cash on delivery.`);
    return { order, paymentMethod: "cod" };
  }

  // ── Khalti: create order, initiate payment, return the redirect URL. The
  // order moves to payment_held only after confirmKhaltiPayment verifies it. ──
  if (paymentMethod === "khalti") {
    const order = await OrderModel.create({ ...base, paymentMethod: "khalti", status: "created" });
    let init;
    try {
      const buyer = await UserModel.findById(buyerId).select("email");
      init = await initiateKhaltiPayment({
        orderId: String(order._id),
        amountPaisa: totalMinorUnits,
        purchaseName: `BazaarHub — ${listing.title}`,
        customerName: buyer?.email || "",
        customerPhone: "",
      });
    } catch (err) {
      await OrderModel.deleteOne({ _id: order._id });
      await rollbackStock();
      throw err;
    }
    order.khaltiPidx = init.pidx;
    await order.save();
    await EscrowEventModel.create({ orderId: order._id, fromStatus: null, toStatus: "created", triggeredBy: buyerId, triggerType: "buyer", reason: "Order created via Khalti checkout", metadata: { pidx: init.pidx } });
    return { order, paymentMethod: "khalti", paymentUrl: init.payment_url };
  }

  // ── Stripe (legacy) ──
  let paymentIntent;
  try {
    paymentIntent = await stripeService.createPaymentIntent(totalMinorUnits, "npr", { listingId: String(listing._id), buyerId: String(buyerId) });
  } catch (err) {
    await rollbackStock();
    throw err;
  }
  const order = await OrderModel.create({ ...base, paymentMethod: "stripe", stripePaymentIntentId: paymentIntent.id, status: "created" });
  await EscrowEventModel.create({ orderId: order._id, fromStatus: null, toStatus: "created", triggeredBy: buyerId, triggerType: "buyer", reason: "Order created via checkout", metadata: { paymentIntentId: paymentIntent.id } });
  return { order, paymentMethod: "stripe", clientSecret: paymentIntent.client_secret };
}

// Verify a Khalti payment by pidx and, if completed, move the order to
// payment_held. Returns whether it's now paid.
export async function confirmKhaltiPayment(pidx: string, buyerId: IdLike): Promise<{ order: IOrder; paid: boolean; status: string }> {
  const { status, purchaseOrderId } = await lookupKhaltiPayment(pidx);
  const order = await OrderModel.findOne({ _id: purchaseOrderId, khaltiPidx: pidx });
  if (!order || String(order.buyerId) !== String(buyerId)) throw new OrderNotFoundError();

  if (status === "Completed" && order.status === "created") {
    const result = await transitionOrder(order._id, "created", "payment_held", "buyer", buyerId, { reason: "Khalti payment completed", metadata: { pidx } });
    if (result) {
      notifyOrder(result.sellerId, result._id, "Payment received", `Khalti payment for "${result.listingSnapshot.title}" is confirmed. Ship to release funds.`);
      return { order: result, paid: true, status };
    }
  }
  return { order, paid: order.status === "payment_held", status };
}

export async function markShipped(orderId: IdLike, sellerId: IdLike, shipping: ShippingDetails = {}) {
  const result = await transitionOrder(orderId, "payment_held", "shipped", "seller", sellerId, {
    carrier: shipping.carrier,
    trackingNumber: shipping.trackingNumber,
  });
  if (result) {
    sendOrderShippedNotification(result.buyerId, String(result._id));
    const tracking = result.trackingNumber ? ` Tracking: ${result.carrier || ""} ${result.trackingNumber}`.trimEnd() : "";
    notifyOrder(result.buyerId, result._id, "Order shipped", `"${result.listingSnapshot.title}" is on its way.${tracking}`);
  }
  return result;
}

// Seller updates/adds tracking on an already-shipped order (e.g. forgot to add
// it at ship time). Scoped to {_id, sellerId, status: "shipped"} so it can only
// touch the seller's own in-transit order.
export async function updateTracking(orderId: IdLike, sellerId: IdLike, shipping: ShippingDetails): Promise<IOrder | null> {
  const $set: Record<string, unknown> = {};
  if (shipping.carrier !== undefined) $set.carrier = shipping.carrier;
  if (shipping.trackingNumber !== undefined) $set.trackingNumber = shipping.trackingNumber;
  if (Object.keys($set).length === 0) return null;
  return OrderModel.findOneAndUpdate({ _id: orderId, sellerId, status: "shipped" }, { $set }, { new: true });
}

export async function confirmDelivery(orderId: IdLike, buyerId: IdLike) {
  const result = await transitionOrder(orderId, "shipped", "delivered", "buyer", buyerId);
  if (result) {
    sendOrderDeliveredNotification(result.sellerId, String(result._id));
    notifyOrder(result.sellerId, result._id, "Delivery confirmed", `The buyer confirmed delivery of "${result.listingSnapshot.title}".`);
  }
  return result;
}

export async function openDispute(orderId: IdLike, buyerId: IdLike) {
  const order = await OrderModel.findById(orderId);
  if (!order) throw new OrderNotFoundError();
  if (order.status !== "payment_held" && order.status !== "shipped") {
    throw new TransitionNotAllowedError(order.status, "disputed", "Can only dispute from payment_held or shipped");
  }
  const result = await transitionOrder(orderId, order.status, "disputed", "buyer", buyerId);
  if (result) {
    sendOrderDisputedNotification(result.sellerId, String(result._id));
    notifyOrder(result.sellerId, result._id, "Order disputed", `The buyer opened a dispute on "${result.listingSnapshot.title}".`);
  }
  return result;
}

export async function resolveDispute(orderId: IdLike, adminId: IdLike, resolution: "released" | "refunded") {
  const result = await transitionOrder(orderId, "disputed", resolution, "admin", adminId, {
    disputeResolvedBy: adminId,
    disputeResolution: resolution,
  });
  if (result) {
    if (resolution === "released") {
      await handleReleaseActions(result);
      sendOrderReleasedNotification(result.buyerId, String(result._id));
      sendOrderReleasedNotification(result.sellerId, String(result._id));
      notifyOrder(result.buyerId, result._id, "Dispute resolved — released", `Funds for "${result.listingSnapshot.title}" were released to the seller.`);
      notifyOrder(result.sellerId, result._id, "Dispute resolved — released", `Funds for "${result.listingSnapshot.title}" were released to you.`);
    } else {
      await handleRefundActions(result);
      sendOrderRefundedNotification(result.buyerId, String(result._id));
      sendOrderRefundedNotification(result.sellerId, String(result._id));
      notifyOrder(result.buyerId, result._id, "Dispute resolved — refunded", `You were refunded for "${result.listingSnapshot.title}".`);
      notifyOrder(result.sellerId, result._id, "Dispute resolved — refunded", `"${result.listingSnapshot.title}" was refunded to the buyer.`);
    }
  }
  return result;
}

export async function adminRelease(orderId: IdLike, adminId: IdLike) {
  const result = await transitionOrder(orderId, "delivered", "released", "admin", adminId);
  if (result) {
    await handleReleaseActions(result);
    sendOrderReleasedNotification(result.buyerId, String(result._id));
    sendOrderReleasedNotification(result.sellerId, String(result._id));
    notifyOrder(result.sellerId, result._id, "Funds released", `Funds for "${result.listingSnapshot.title}" were released to you.`);
  }
  return result;
}

export async function tryAutoRelease(order: IOrder) {
  if (order.status !== "delivered" || !order.deliveredAt) return null;
  if (Date.now() - order.deliveredAt.getTime() < order.holdDurationMs) return null;
  // A pending return holds the funds — never auto-release out from under it.
  const pendingReturn = await ReturnRequestModel.exists({ orderId: order._id, status: "requested" });
  if (pendingReturn) return null;
  const result = await transitionOrder(order._id, "delivered", "released", "system", null);
  if (result) {
    await handleReleaseActions(result);
    sendOrderReleasedNotification(result.buyerId, String(result._id));
    sendOrderReleasedNotification(result.sellerId, String(result._id));
    notifyOrder(result.sellerId, result._id, "Funds released", `The hold period ended and funds for "${result.listingSnapshot.title}" were released to you.`);
  }
  return result;
}

// Refund a delivered order because an approved return. Seller or admin only
// (enforced by the transition table). Releases the escrow hold and notifies
// both parties.
export async function refundDeliveredOrder(orderId: IdLike, actorId: IdLike, triggerType: "seller" | "admin") {
  const result = await transitionOrder(orderId, "delivered", "refunded", triggerType, actorId, {
    reason: "Return approved",
  });
  if (result) {
    await handleRefundActions(result);
    sendOrderRefundedNotification(result.buyerId, String(result._id));
    sendOrderRefundedNotification(result.sellerId, String(result._id));
    notifyOrder(result.buyerId, result._id, "Return approved — refunded", `Your return for "${result.listingSnapshot.title}" was approved and refunded.`);
    notifyOrder(result.sellerId, result._id, "Return approved", `The return for "${result.listingSnapshot.title}" was approved and refunded to the buyer.`);
  }
  return result;
}

export async function handlePaymentSucceeded(paymentIntentId: string, stripeEventId: string) {
  // Idempotency ledger: claim this event id first. Stripe redelivers webhooks
  // on any non-2xx (and sometimes even on success), so the same event can
  // arrive multiple times. The unique index on eventId makes the insert the
  // single arbiter — a duplicate delivery hits E11000 and we no-op. This is
  // belt-and-braces on top of the {status: "created"} guard in transitionOrder.
  const order = await OrderModel.findOne({ stripePaymentIntentId: paymentIntentId });
  try {
    await WebhookEventModel.create({
      eventId: stripeEventId,
      type: "payment_intent.succeeded",
      orderId: order?._id,
    });
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) return order; // already processed
    throw err;
  }

  if (!order || order.status !== "created") return order;
  const result = await transitionOrder(order._id, "created", "payment_held", "webhook", null, {
    reason: "Payment intent succeeded",
    metadata: { stripeEventId },
  });
  if (result) {
    sendPaymentReceivedNotification(result.sellerId, String(result._id));
    notifyOrder(result.sellerId, result._id, "Payment received", `Payment for "${result.listingSnapshot.title}" is held in escrow. Ship to release funds.`);
    notifyOrder(result.buyerId, result._id, "Payment confirmed", `Your payment for "${result.listingSnapshot.title}" is secured in escrow.`);
  }
  return result;
}

async function handleReleaseActions(order: IOrder): Promise<void> {
  if (order.stripePaymentIntentId) {
    try {
      await stripeService.capturePaymentIntent(order.stripePaymentIntentId);
    } catch (err) {
      console.error("Capture failed:", (err as Error).message);
    }
  }
}

async function handleRefundActions(order: IOrder): Promise<void> {
  if (order.stripePaymentIntentId) {
    try {
      await stripeService.cancelPaymentIntent(order.stripePaymentIntentId);
    } catch (err) {
      console.error("Cancel failed:", (err as Error).message);
    }
  }
}

// ── Query helpers with lazy auto-release ──
export async function getOrder(orderId: IdLike): Promise<IOrder | null> {
  const order = await OrderModel.findById(orderId);
  if (!order) return null;
  if (order.status === "delivered") {
    const released = await tryAutoRelease(order);
    if (released) return released;
  }
  return order;
}

export async function listOrders(userId: IdLike, role: string): Promise<IOrder[]> {
  const filter = role === "seller" ? { sellerId: userId } : { buyerId: userId };
  const orders = await OrderModel.find(filter).sort({ createdAt: -1 });
  const results: IOrder[] = [];
  for (const order of orders) {
    if (order.status === "delivered") {
      const released = await tryAutoRelease(order);
      results.push(released || order);
    } else {
      results.push(order);
    }
  }
  return results;
}

export async function getOrderEvents(orderId: IdLike) {
  return EscrowEventModel.find({ orderId }).sort({ createdAt: 1 });
}

// ── Reservation expiry sweep ──
// checkout() reserves stock (decrements listing.quantity) BEFORE payment, and
// only rolls it back if the Stripe call itself throws. A buyer who abandons
// the payment leaves the order in `created` forever with stock held hostage.
// This sweep cancels `created` orders older than RESERVATION_TTL_MS, returns
// their stock, and cancels the (uncaptured) payment intent.
//
// Race safety: the cancel is an atomic findOneAndUpdate guarded on
// {status: "created"}, the same guard handlePaymentSucceeded uses. Only one of
// {sweep, webhook} can win. If the sweep wins a near-simultaneous payment, the
// buyer's intent is cancelled (funds never captured — createPaymentIntent uses
// manual capture), so no money is trapped. TTL is chosen well above realistic
// payment-completion time to make that collision vanishingly rare.
export const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Atomically cancel an order and undo its side effects: return reserved stock
// to the listing and release the (uncaptured) payment hold. The status change
// is a single findOneAndUpdate guarded on the order's currently-loaded status,
// so a concurrent transition (webhook, another cancel) can't double-restore —
// the loser sees null and no-ops. Shared by the reservation sweep and the
// buyer-initiated cancel so both take exactly one code path. Returns the
// updated order, or null if it had already moved on.
async function cancelAndRestore(
  order: IOrder,
  triggerType: EscrowTriggerType,
  actorId: IdLike | null,
  reason: string,
): Promise<IOrder | null> {
  const fromStatus = order.status;
  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id, status: fromStatus },
    { $set: { status: "cancelled", cancelledAt: new Date() } },
    { new: true },
  );
  if (!updated) return null;

  await ListingModel.findOneAndUpdate({ _id: order.listingId }, { $inc: { quantity: order.quantity } });

  if (order.stripePaymentIntentId) {
    try {
      await stripeService.cancelPaymentIntent(order.stripePaymentIntentId);
    } catch (err) {
      console.error("Cancel: payment intent cancel failed:", (err as Error).message);
    }
  }

  await EscrowEventModel.create({
    orderId: order._id,
    fromStatus,
    toStatus: "cancelled",
    triggeredBy: actorId,
    triggerType,
    reason,
    metadata: { restoredQuantity: order.quantity },
  });
  return updated;
}

export async function expireStaleReservations(now: number = Date.now()): Promise<number> {
  const cutoff = new Date(now - RESERVATION_TTL_MS);
  const stale = await OrderModel.find({ status: "created", createdAt: { $lt: cutoff } });

  let cancelled = 0;
  for (const order of stale) {
    const result = await cancelAndRestore(order, "system", null, "Reservation expired — payment not completed within TTL");
    if (result) cancelled += 1;
  }
  return cancelled;
}

// Buyer-initiated cancellation. Allowed only BEFORE the seller ships — i.e.
// from `created` (unpaid) or `payment_held` (paid, not yet shipped). Once the
// order is shipped or beyond, the buyer's recourse is dispute/return, not
// cancel. Restores stock and releases any payment hold via cancelAndRestore.
export async function cancelOrderByBuyer(orderId: IdLike, buyerId: IdLike): Promise<IOrder | null> {
  const order = await OrderModel.findById(orderId);
  if (!order) throw new OrderNotFoundError();
  // 404-parity with the rest of escrow: never reveal that an order exists to a
  // non-owner. The controller also checks; this keeps the service safe on its own.
  if (String(order.buyerId) !== String(buyerId)) throw new OrderNotFoundError();
  if (order.status !== "created" && order.status !== "payment_held") {
    throw new TransitionNotAllowedError(order.status, "cancelled", "Order can only be cancelled before it ships");
  }
  const result = await cancelAndRestore(order, "buyer", buyerId, "Cancelled by buyer before shipment");
  if (result) notifyOrder(result.sellerId, result._id, "Order cancelled", `The buyer cancelled their order for "${result.listingSnapshot.title}".`);
  return result;
}
