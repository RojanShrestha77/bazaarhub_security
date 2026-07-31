import request from "supertest";
import { createApp } from "../../src/app";
import { OrderModel } from "../../src/models/order.model";
import { ReturnRequestModel } from "../../src/models/return-request.model";
import * as stripeService from "../../src/services/stripe.service";
import { createUser, createSession, createListing, createOrder } from "../helpers/fixtures";

const app = createApp();

describe("returns / RMA", () => {
  let buyer, seller, admin, listing, buyerS, sellerS, adminS;

  beforeAll(() => {
    stripeService._setStripeInstance({
      paymentIntents: { create: async () => ({ id: "pi", client_secret: "cs" }), capture: async () => ({}), cancel: async () => ({}) },
    });
  });

  beforeEach(async () => {
    buyer = await createUser({ role: "buyer" });
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    admin = await createUser({ role: "admin" });
    listing = await createListing(seller, { status: "active" });
    buyerS = await createSession(buyer, { mfaVerified: true });
    sellerS = await createSession(seller, { mfaVerified: true });
    adminS = await createSession(admin, { mfaVerified: true });
  });

  const delivered = () => createOrder(buyer, seller, listing, { status: "delivered", deliveredAt: new Date() });

  const reqReturn = (session, orderId, reason = "Item defective") =>
    request(app).post("/api/returns").set("Cookie", session.cookies).set(session.csrfHeader).send({ orderId: String(orderId), reason });

  it("lets a buyer open a return on a delivered order", async () => {
    const order = await delivered();
    const res = await reqReturn(buyerS, order._id);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("requested");
  });

  it("refuses a return on a non-delivered order (400)", async () => {
    const order = await createOrder(buyer, seller, listing, { status: "payment_held" });
    const res = await reqReturn(buyerS, order._id);
    expect(res.status).toBe(400);
  });

  it("refuses a return on someone else's order (404-parity)", async () => {
    const order = await delivered();
    const stranger = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });
    const res = await reqReturn(stranger, order._id);
    expect(res.status).toBe(404);
  });

  it("prevents a second open return on the same order (409)", async () => {
    const order = await delivered();
    expect((await reqReturn(buyerS, order._id)).status).toBe(201);
    expect((await reqReturn(buyerS, order._id)).status).toBe(409);
  });

  it("approval by the seller refunds the order", async () => {
    const order = await delivered();
    const rid = (await reqReturn(buyerS, order._id)).body.id;
    const res = await request(app).post(`/api/returns/${rid}/approve`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect((await OrderModel.findById(order._id))!.status).toBe("refunded");
  });

  it("approval by an admin also works", async () => {
    const order = await delivered();
    const rid = (await reqReturn(buyerS, order._id)).body.id;
    const res = await request(app).post(`/api/returns/${rid}/approve`).set("Cookie", adminS.cookies).set(adminS.csrfHeader).send();
    expect(res.status).toBe(200);
    expect((await OrderModel.findById(order._id))!.status).toBe("refunded");
  });

  it("a stranger seller cannot resolve a return they don't own (404)", async () => {
    const order = await delivered();
    const rid = (await reqReturn(buyerS, order._id)).body.id;
    const otherSeller = await createSession(await createUser({ role: "seller", sellerTier: "verified" }), { mfaVerified: true });
    const res = await request(app).post(`/api/returns/${rid}/approve`).set("Cookie", otherSeller.cookies).set(otherSeller.csrfHeader).send();
    expect(res.status).toBe(404);
    expect((await OrderModel.findById(order._id))!.status).toBe("delivered"); // untouched
  });

  it("rejection leaves the order delivered", async () => {
    const order = await delivered();
    const rid = (await reqReturn(buyerS, order._id)).body.id;
    const res = await request(app).post(`/api/returns/${rid}/reject`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect((await OrderModel.findById(order._id))!.status).toBe("delivered");
  });

  it("cannot re-resolve an already-resolved return (409)", async () => {
    const order = await delivered();
    const rid = (await reqReturn(buyerS, order._id)).body.id;
    await request(app).post(`/api/returns/${rid}/reject`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send();
    const again = await request(app).post(`/api/returns/${rid}/approve`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send();
    expect(again.status).toBe(409);
  });

  it("scopes the list by role", async () => {
    const order = await delivered();
    await reqReturn(buyerS, order._id);
    const buyerList = await request(app).get("/api/returns").set("Cookie", buyerS.cookies);
    expect(buyerList.body.returns).toHaveLength(1);
    const sellerList = await request(app).get("/api/returns").set("Cookie", sellerS.cookies);
    expect(sellerList.body.returns).toHaveLength(1);
    const stranger = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });
    const strangerList = await request(app).get("/api/returns").set("Cookie", stranger.cookies);
    expect(strangerList.body.returns).toHaveLength(0);
  });
});
