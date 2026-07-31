import request from "supertest";
import { createApp } from "../../src/app";
import { PayoutModel } from "../../src/models/payout.model";
import { getSellerAnalytics, getPayoutSummary, PLATFORM_COMMISSION_RATE } from "../../src/services/seller-analytics.service";
import { createUser, createSession, createListing, createOrder } from "../helpers/fixtures";

const app = createApp();

describe("seller analytics + payouts", () => {
  let seller, buyer, listing;

  beforeEach(async () => {
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    buyer = await createUser({ role: "buyer" });
    listing = await createListing(seller, { status: "active", priceMinorUnits: 100000 });
  });

  it("aggregates revenue by status", async () => {
    await createOrder(buyer, seller, listing, { status: "released", priceMinorUnits: 100000 });
    await createOrder(buyer, seller, listing, { status: "released", priceMinorUnits: 100000 });
    await createOrder(buyer, seller, listing, { status: "payment_held", priceMinorUnits: 100000 });

    const a = await getSellerAnalytics(seller._id);
    expect(a.orderCount).toBe(3);
    expect(a.grossRevenueMinorUnits).toBe(200000); // two released
    expect(a.pendingRevenueMinorUnits).toBe(100000); // one held
    expect(a.activeListings).toBe(1);
    expect(a.byStatus.released.count).toBe(2);
  });

  it("computes payout summary with commission", async () => {
    await createOrder(buyer, seller, listing, { status: "released", priceMinorUnits: 100000 });
    const s = await getPayoutSummary(seller._id);
    expect(s.releasedGrossMinorUnits).toBe(100000);
    expect(s.commissionMinorUnits).toBe(Math.round(100000 * PLATFORM_COMMISSION_RATE));
    expect(s.netEarningsMinorUnits).toBe(100000 - s.commissionMinorUnits);
    expect(s.availableMinorUnits).toBe(s.netEarningsMinorUnits);
  });

  it("subtracts recorded payouts from available balance", async () => {
    await createOrder(buyer, seller, listing, { status: "released", priceMinorUnits: 100000 });
    await PayoutModel.create({ sellerId: seller._id, amountMinorUnits: 10000, createdBy: seller._id });
    const s = await getPayoutSummary(seller._id);
    expect(s.paidOutMinorUnits).toBe(10000);
    expect(s.availableMinorUnits).toBe(s.netEarningsMinorUnits - 10000);
  });

  it("serves the seller's own analytics over HTTP (seller-only)", async () => {
    await createOrder(buyer, seller, listing, { status: "released", priceMinorUnits: 100000 });
    const s = await createSession(seller, { mfaVerified: true });
    const res = await request(app).get("/api/seller/analytics").set("Cookie", s.cookies);
    expect(res.status).toBe(200);
    expect(res.body.grossRevenueMinorUnits).toBe(100000);

    // A buyer is forbidden from the seller analytics endpoint.
    const b = await createSession(buyer, { mfaVerified: true });
    const forbidden = await request(app).get("/api/seller/analytics").set("Cookie", b.cookies);
    expect(forbidden.status).toBe(403);
  });

  it("admin can record a payout, but not beyond the available balance", async () => {
    await createOrder(buyer, seller, listing, { status: "released", priceMinorUnits: 100000 });
    const admin = await createUser({ role: "admin" });
    const adminS = await createSession(admin, { mfaVerified: true });
    const summary = await getPayoutSummary(seller._id);

    const over = await request(app).post(`/api/admin/sellers/${seller._id}/payouts`).set("Cookie", adminS.cookies).set(adminS.csrfHeader)
      .send({ amountMinorUnits: summary.availableMinorUnits + 1 });
    expect(over.status).toBe(400);

    const ok = await request(app).post(`/api/admin/sellers/${seller._id}/payouts`).set("Cookie", adminS.cookies).set(adminS.csrfHeader)
      .send({ amountMinorUnits: 5000, note: "weekly payout" });
    expect(ok.status).toBe(201);
    expect(await PayoutModel.countDocuments({ sellerId: seller._id })).toBe(1);
  });
});
