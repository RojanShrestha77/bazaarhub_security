import request from "supertest";
import { createApp } from "../../src/app";
import { OrderModel } from "../../src/models/order.model";
import { NotificationModel } from "../../src/models/notification.model";
import * as stripeService from "../../src/services/stripe.service";
import { createUser, createSession, createListing, createOrder } from "../helpers/fixtures";

const app = createApp();

describe("shipping / delivery tracking", () => {
  let buyer, seller, listing, sellerS, buyerS;

  beforeAll(() => {
    stripeService._setStripeInstance({
      paymentIntents: { create: async () => ({ id: "pi", client_secret: "cs" }), capture: async () => ({}), cancel: async () => ({}) },
    });
  });

  beforeEach(async () => {
    buyer = await createUser({ role: "buyer" });
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    listing = await createListing(seller, { status: "active" });
    sellerS = await createSession(seller, { mfaVerified: true });
    buyerS = await createSession(buyer, { mfaVerified: true });
  });

  const held = () => createOrder(buyer, seller, listing, { status: "payment_held" });

  it("records carrier + tracking number when the seller ships", async () => {
    const order = await held();
    const res = await request(app).post(`/api/escrow/orders/${order._id}/ship`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader)
      .send({ carrier: "Nepal Post", trackingNumber: "NP123456789" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("shipped");

    const saved = await OrderModel.findById(order._id);
    expect(saved!.carrier).toBe("Nepal Post");
    expect(saved!.trackingNumber).toBe("NP123456789");
    expect(saved!.shippedAt).toBeTruthy();
  });

  it("allows shipping without tracking details", async () => {
    const order = await held();
    const res = await request(app).post(`/api/escrow/orders/${order._id}/ship`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send({});
    expect(res.status).toBe(200);
    const saved = await OrderModel.findById(order._id);
    expect(saved!.status).toBe("shipped");
    expect(saved!.trackingNumber).toBeUndefined();
    expect(saved!.shippedAt).toBeTruthy();
  });

  it("surfaces tracking info to the buyer on the order", async () => {
    const order = await held();
    await request(app).post(`/api/escrow/orders/${order._id}/ship`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send({ carrier: "Aramex", trackingNumber: "AR999" });
    const res = await request(app).get(`/api/escrow/orders/${order._id}`).set("Cookie", buyerS.cookies);
    expect(res.status).toBe(200);
    expect(res.body.carrier).toBe("Aramex");
    expect(res.body.trackingNumber).toBe("AR999");
  });

  it("lets the seller add tracking after shipping via PATCH", async () => {
    const order = await held();
    await request(app).post(`/api/escrow/orders/${order._id}/ship`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send({});
    const res = await request(app).patch(`/api/escrow/orders/${order._id}/tracking`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader)
      .send({ carrier: "DHL", trackingNumber: "DHL42" });
    expect(res.status).toBe(200);
    const saved = await OrderModel.findById(order._id);
    expect(saved!.carrier).toBe("DHL");
    expect(saved!.trackingNumber).toBe("DHL42");
  });

  it("rejects an empty tracking update (400)", async () => {
    const order = await held();
    await request(app).post(`/api/escrow/orders/${order._id}/ship`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send({});
    const res = await request(app).patch(`/api/escrow/orders/${order._id}/tracking`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send({});
    expect(res.status).toBe(400);
  });

  it("won't update tracking on a non-shipped order (404)", async () => {
    const order = await held();
    const res = await request(app).patch(`/api/escrow/orders/${order._id}/tracking`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send({ trackingNumber: "X1" });
    expect(res.status).toBe(404);
  });

  it("won't let a non-seller ship someone else's order (404)", async () => {
    const order = await held();
    const otherSeller = await createSession(await createUser({ role: "seller", sellerTier: "verified" }), { mfaVerified: true });
    const res = await request(app).post(`/api/escrow/orders/${order._id}/ship`).set("Cookie", otherSeller.cookies).set(otherSeller.csrfHeader).send({ trackingNumber: "hax" });
    expect(res.status).toBe(404);
    expect((await OrderModel.findById(order._id))!.status).toBe("payment_held");
  });

  it("notifies the buyer with tracking in the message", async () => {
    const order = await held();
    await request(app).post(`/api/escrow/orders/${order._id}/ship`).set("Cookie", sellerS.cookies).set(sellerS.csrfHeader).send({ carrier: "FedEx", trackingNumber: "FX7" });
    // notifyUser is fire-and-forget; poll for it.
    let n = null;
    for (let i = 0; i < 50; i++) {
      n = await NotificationModel.findOne({ userId: buyer._id, type: "order_update", title: "Order shipped" });
      if (n) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(n).toBeTruthy();
    expect(n!.body).toContain("FX7");
  });
});
