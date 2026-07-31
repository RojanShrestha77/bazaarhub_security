import { Types } from "mongoose";
import { ReturnRequestModel, IReturnRequest } from "../models/return-request.model";
import { OrderModel } from "../models/order.model";
import { refundDeliveredOrder } from "./escrow.service";
import { notifyUser } from "./notification.service";

type IdLike = Types.ObjectId | string;

export class OrderNotReturnableError extends Error {
  constructor() { super("Only delivered orders can be returned"); this.name = "OrderNotReturnableError"; }
}
export class ReturnAlreadyExistsError extends Error {
  constructor() { super("A return request is already open for this order"); this.name = "ReturnAlreadyExistsError"; }
}
export class ReturnNotFoundError extends Error {
  constructor() { super("Return request not found"); this.name = "ReturnNotFoundError"; }
}
export class ReturnNotActionableError extends Error {
  constructor() { super("This return request has already been resolved"); this.name = "ReturnNotActionableError"; }
}
export class OrderNotFoundError extends Error {
  constructor() { super("Order not found"); this.name = "OrderNotFoundError"; }
}

// Buyer opens a return on a delivered order they own.
export async function requestReturn(orderId: IdLike, buyerId: IdLike, reason: string): Promise<IReturnRequest> {
  const order = await OrderModel.findById(orderId);
  // 404-parity: unknown order and someone else's order look the same.
  if (!order || String(order.buyerId) !== String(buyerId)) throw new OrderNotFoundError();
  if (order.status !== "delivered") throw new OrderNotReturnableError();

  try {
    const rr = await ReturnRequestModel.create({ orderId: order._id, buyerId, sellerId: order.sellerId, reason });
    notifyUser(order.sellerId, { type: "order_update", title: "Return requested", body: `The buyer requested a return for "${order.listingSnapshot.title}".`, link: `/orders/${order._id}` });
    return rr;
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) throw new ReturnAlreadyExistsError(); // partial unique index
    throw err;
  }
}

// Load a return the actor is allowed to resolve: the seller it belongs to, or
// any admin. 404-parity for everyone else.
async function loadActionable(returnId: IdLike, actorId: IdLike, isAdmin: boolean): Promise<IReturnRequest> {
  const rr = await ReturnRequestModel.findById(returnId);
  if (!rr) throw new ReturnNotFoundError();
  if (!isAdmin && String(rr.sellerId) !== String(actorId)) throw new ReturnNotFoundError();
  if (rr.status !== "requested") throw new ReturnNotActionableError();
  return rr;
}

export async function approveReturn(returnId: IdLike, actorId: IdLike, isAdmin: boolean): Promise<IReturnRequest> {
  const rr = await loadActionable(returnId, actorId, isAdmin);
  const refunded = await refundDeliveredOrder(rr.orderId, actorId, isAdmin ? "admin" : "seller");
  // If the order already left "delivered" (e.g. auto-released before approval),
  // the transition returns null — surface it as not-actionable rather than
  // marking the return approved with no refund.
  if (!refunded) throw new ReturnNotActionableError();
  rr.status = "approved";
  rr.resolvedBy = new Types.ObjectId(String(actorId));
  rr.resolvedAt = new Date();
  await rr.save();
  return rr;
}

export async function rejectReturn(returnId: IdLike, actorId: IdLike, isAdmin: boolean): Promise<IReturnRequest> {
  const rr = await loadActionable(returnId, actorId, isAdmin);
  rr.status = "rejected";
  rr.resolvedBy = new Types.ObjectId(String(actorId));
  rr.resolvedAt = new Date();
  await rr.save();
  notifyUser(rr.buyerId, { type: "order_update", title: "Return rejected", body: "Your return request was declined.", link: `/orders/${rr.orderId}` });
  return rr;
}

export async function listReturns(userId: IdLike, role: string): Promise<IReturnRequest[]> {
  const filter = role === "admin" ? {} : role === "seller" ? { sellerId: userId } : { buyerId: userId };
  return ReturnRequestModel.find(filter).sort({ createdAt: -1 });
}
