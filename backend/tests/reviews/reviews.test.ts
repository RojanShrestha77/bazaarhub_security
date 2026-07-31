import request from "supertest";
import { createApp } from "../../src/app";
import { ReviewModel } from "../../src/models/review.model";
import { createUser, createSession, createListing, createOrder } from "../helpers/fixtures";

const app = createApp();

describe("reviews — verified purchase", () => {
  let seller, listing;

  beforeEach(async () => {
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    listing = await createListing(seller, { status: "active" });
  });

  async function reviewerWithPurchase(status = "delivered") {
    const buyer = await createUser({ role: "buyer" });
    await createOrder(buyer, seller, listing, { status });
    return buyer;
  }

  it("lets a buyer with a delivered order post a review", async () => {
    const buyer = await reviewerWithPurchase("delivered");
    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });

    const res = await request(app)
      .post(`/api/listings/${listing._id}/reviews`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ rating: 5, comment: "Great tool" });
    expect(res.status).toBe(201);
    expect(res.body.rating).toBe(5);
    expect(await ReviewModel.countDocuments({ listingId: listing._id })).toBe(1);
  });

  it("accepts a released order as a qualifying purchase too", async () => {
    const buyer = await reviewerWithPurchase("released");
    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });
    const res = await request(app)
      .post(`/api/listings/${listing._id}/reviews`)
      .set("Cookie", cookies).set(csrfHeader)
      .send({ rating: 4 });
    expect(res.status).toBe(201);
  });

  it("rejects a review from someone who never completed a purchase (403)", async () => {
    const stranger = await createUser({ role: "buyer" });
    const { cookies, csrfHeader } = await createSession(stranger, { mfaVerified: true });
    const res = await request(app)
      .post(`/api/listings/${listing._id}/reviews`)
      .set("Cookie", cookies).set(csrfHeader)
      .send({ rating: 5 });
    expect(res.status).toBe(403);
    expect(await ReviewModel.countDocuments({ listingId: listing._id })).toBe(0);
  });

  it("rejects a review when the buyer's order has only shipped (not yet received)", async () => {
    const buyer = await reviewerWithPurchase("shipped");
    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });
    const res = await request(app)
      .post(`/api/listings/${listing._id}/reviews`)
      .set("Cookie", cookies).set(csrfHeader)
      .send({ rating: 5 });
    expect(res.status).toBe(403);
  });

  it("prevents a second review of the same listing by the same buyer (409)", async () => {
    const buyer = await reviewerWithPurchase("delivered");
    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });
    const first = await request(app).post(`/api/listings/${listing._id}/reviews`).set("Cookie", cookies).set(csrfHeader).send({ rating: 5 });
    expect(first.status).toBe(201);
    const second = await request(app).post(`/api/listings/${listing._id}/reviews`).set("Cookie", cookies).set(csrfHeader).send({ rating: 1 });
    expect(second.status).toBe(409);
  });

  it("rejects an out-of-range rating (400)", async () => {
    const buyer = await reviewerWithPurchase("delivered");
    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });
    const res = await request(app).post(`/api/listings/${listing._id}/reviews`).set("Cookie", cookies).set(csrfHeader).send({ rating: 6 });
    expect(res.status).toBe(400);
  });

  it("requires a session to post a review (401)", async () => {
    const res = await request(app).post(`/api/listings/${listing._id}/reviews`).send({ rating: 5 });
    expect(res.status).toBe(401);
  });

  it("surfaces the seller's aggregate rating on their public profile", async () => {
    const buyer = await reviewerWithPurchase("delivered");
    const s = await createSession(buyer, { mfaVerified: true });
    await request(app).post(`/api/listings/${listing._id}/reviews`).set("Cookie", s.cookies).set(s.csrfHeader).send({ rating: 5 });

    // Any authenticated user can view the seller's public profile.
    const viewer = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });
    const res = await request(app).get(`/api/profiles/${seller._id}`).set("Cookie", viewer.cookies);
    expect(res.status).toBe(200);
    expect(res.body.sellerRating).toEqual({ average: 5, count: 1 });
  });

  it("omits the rating badge for non-seller profiles", async () => {
    const buyerUser = await createUser({ role: "buyer" });
    const viewer = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });
    const res = await request(app).get(`/api/profiles/${buyerUser._id}`).set("Cookie", viewer.cookies);
    expect(res.status).toBe(200);
    expect(res.body.sellerRating).toBeUndefined();
  });

  it("exposes public reviews with an aggregate summary", async () => {
    const b1 = await reviewerWithPurchase("delivered");
    const b2 = await reviewerWithPurchase("released");
    const s1 = await createSession(b1, { mfaVerified: true });
    const s2 = await createSession(b2, { mfaVerified: true });
    await request(app).post(`/api/listings/${listing._id}/reviews`).set("Cookie", s1.cookies).set(s1.csrfHeader).send({ rating: 4 });
    await request(app).post(`/api/listings/${listing._id}/reviews`).set("Cookie", s2.cookies).set(s2.csrfHeader).send({ rating: 2 });

    const res = await request(app).get(`/api/listings/${listing._id}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.summary.count).toBe(2);
    expect(res.body.summary.average).toBe(3); // (4 + 2) / 2
    expect(res.body.reviews).toHaveLength(2);
  });
});
