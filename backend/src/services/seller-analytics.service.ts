import { Types } from "mongoose";
import { OrderModel } from "../models/order.model";
import { ListingModel } from "../models/listing.model";
import { PayoutModel } from "../models/payout.model";

type IdLike = Types.ObjectId | string;

// Platform commission taken from released (settled) earnings. Kept here as the
export const PLATFORM_COMMISSION_RATE = 0.05; // 5%

// Statuses where funds are committed by the buyer but not yet settled.
const PENDING_STATUSES = ["payment_held", "shipped", "delivered"];

interface SellerAnalytics {
  orderCount: number;
  activeListings: number;
  grossRevenueMinorUnits: number; // released
  pendingRevenueMinorUnits: number; // held/shipped/delivered
  byStatus: Record<string, { count: number; totalMinorUnits: number }>;
}

export async function getSellerAnalytics(sellerId: IdLike): Promise<SellerAnalytics> {
  const sid = new Types.ObjectId(String(sellerId));
  const [rows, activeListings] = await Promise.all([
    OrderModel.aggregate<{ _id: string; count: number; total: number }>([
      { $match: { sellerId: sid } },
      { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$totalMinorUnits" } } },
    ]),
    ListingModel.countDocuments({ sellerId: sid, status: "active" }),
  ]);

  const byStatus: SellerAnalytics["byStatus"] = {};
  let orderCount = 0;
  let gross = 0;
  let pending = 0;
  for (const r of rows) {
    byStatus[r._id] = { count: r.count, totalMinorUnits: r.total };
    orderCount += r.count;
    if (r._id === "released") gross += r.total;
    if (PENDING_STATUSES.includes(r._id)) pending += r.total;
  }

  return { orderCount, activeListings, grossRevenueMinorUnits: gross, pendingRevenueMinorUnits: pending, byStatus };
}

interface PayoutSummary {
  releasedGrossMinorUnits: number;
  commissionMinorUnits: number;
  netEarningsMinorUnits: number;
  paidOutMinorUnits: number;
  availableMinorUnits: number;
  commissionRate: number;
}

export async function getPayoutSummary(sellerId: IdLike): Promise<PayoutSummary> {
  const sid = new Types.ObjectId(String(sellerId));
  const [releasedAgg, paidAgg] = await Promise.all([
    OrderModel.aggregate<{ total: number }>([
      { $match: { sellerId: sid, status: "released" } },
      { $group: { _id: null, total: { $sum: "$totalMinorUnits" } } },
    ]),
    PayoutModel.aggregate<{ total: number }>([
      { $match: { sellerId: sid } },
      { $group: { _id: null, total: { $sum: "$amountMinorUnits" } } },
    ]),
  ]);

  const releasedGross = releasedAgg[0]?.total ?? 0;
  const commission = Math.round(releasedGross * PLATFORM_COMMISSION_RATE);
  const net = releasedGross - commission;
  const paidOut = paidAgg[0]?.total ?? 0;

  return {
    releasedGrossMinorUnits: releasedGross,
    commissionMinorUnits: commission,
    netEarningsMinorUnits: net,
    paidOutMinorUnits: paidOut,
    availableMinorUnits: Math.max(0, net - paidOut),
    commissionRate: PLATFORM_COMMISSION_RATE,
  };
}

export async function listPayouts(sellerId: IdLike) {
  return PayoutModel.find({ sellerId }).sort({ createdAt: -1 });
}

export class PayoutAmountError extends Error {
  constructor(message: string) { super(message); this.name = "PayoutAmountError"; }
}

// Admin records a payout. Guarded so the platform can't over-disburse beyond
// the seller's available (net, unpaid) balance.
export async function recordPayout(sellerId: IdLike, amountMinorUnits: number, adminId: IdLike, note = "") {
  if (!Number.isInteger(amountMinorUnits) || amountMinorUnits < 1) {
    throw new PayoutAmountError("Payout amount must be a positive integer (minor units)");
  }
  const summary = await getPayoutSummary(sellerId);
  if (amountMinorUnits > summary.availableMinorUnits) {
    throw new PayoutAmountError("Payout exceeds the seller's available balance");
  }
  return PayoutModel.create({ sellerId, amountMinorUnits, createdBy: adminId, note });
}
