import request from "supertest";
import { createApp } from "../../src/app";
import { OrderModel as Order } from "../../src/models/order.model";
import { EscrowEventModel as EscrowEvent } from "../../src/models/escrow-event.model";
import {
  transitionOrder,
  handlePaymentSucceeded,
  tryAutoRelease,
} from "../../src/services/escrow.service";
import { createUser, createSession, createListing } from "../helpers/fixtures";
import * as stripeService from "../../src/services/stripe.service";

let app;

beforeAll(async () => {
  app = createApp();
});

beforeEach(() => {
  stripeService._setStripeInstance({
    paymentIntents: {
      create: async () => ({ id: "pi_test_mock", client_secret: "pi_test_secret_mock" }),
      capture: async () => ({}),
      cancel: async () => ({}),
    },
    webhooks: {
      constructEvent: () => ({ type: "payment_intent.succeeded", id: "evt_test_mock", data: { object: { id: "pi_test_mock" } } }),
    },
  });
});

afterEach(() => {
  stripeService._setStripeInstance(null);
  stripeService.resetStripeInstance();
});

// ── Two simultaneous release requests — exactly one succeeds ──

describe("Concurrency: double release race", () => {
  test("two simultaneous release attempts — exactly one succeeds", async () => {
    const buyer = await createUser();
    const seller = await createUser({ role: "seller", sellerTier: "trusted" });
    const listing = await createListing(seller, { status: "active" });

    const order = await Order.create({
      buyerId: buyer._id,
      sellerId: seller._id,
      listingId: listing._id,
      listingSnapshot: { title: listing.title, priceMinorUnits: listing.priceMinorUnits, currency: "NPR" },
      quantity: 1,
      totalMinorUnits: listing.priceMinorUnits,
      holdDurationMs: 0,
      stripePaymentIntentId: "pi_test_race",
      status: "delivered",
      deliveredAt: new Date(),
    });

    const [first, second] = await Promise.all([
      transitionOrder(order._id, "delivered", "released", "system", null),
      transitionOrder(order._id, "delivered", "released", "system", null),
    ]);

    const succeeded = [first, second].filter((r) => r !== null);
    expect(succeeded).toHaveLength(1);
    expect(succeeded[0].status).toBe("released");

    const final = await Order.findById(order._id);
    expect(final.status).toBe("released");
  });
});

// ── Simultaneous release + dispute — deterministic outcome ──

describe("Concurrency: release vs dispute race", () => {
  test("release vs dispute from payment_held — dispute wins (valid)", async () => {
    const buyer = await createUser();
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active" });

    const order = await Order.create({
      buyerId: buyer._id,
      sellerId: seller._id,
      listingId: listing._id,
      listingSnapshot: { title: listing.title, priceMinorUnits: listing.priceMinorUnits, currency: "NPR" },
      quantity: 1,
      totalMinorUnits: listing.priceMinorUnits,
      holdDurationMs: 0,
      stripePaymentIntentId: "pi_test_race2",
      status: "payment_held",
    });

    const [releaseResult, disputeResult] = await Promise.all([
      transitionOrder(order._id, "payment_held", "released", "system", null).catch(() => null),
      transitionOrder(order._id, "payment_held", "disputed", "buyer", buyer._id).catch(() => null),
    ]);

    const final = await Order.findById(order._id);
    expect(final.status).toBe("disputed");
  });

  test("release vs dispute from delivered — release wins", async () => {
    const buyer = await createUser();
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active" });

    const order = await Order.create({
      buyerId: buyer._id,
      sellerId: seller._id,
      listingId: listing._id,
      listingSnapshot: { title: listing.title, priceMinorUnits: listing.priceMinorUnits, currency: "NPR" },
      quantity: 1,
      totalMinorUnits: listing.priceMinorUnits,
      holdDurationMs: 0,
      stripePaymentIntentId: "pi_test_race3",
      status: "delivered",
      deliveredAt: new Date(),
    });

    const [releaseResult, disputeResult] = await Promise.all([
      transitionOrder(order._id, "delivered", "released", "system", null).catch(() => null),
      transitionOrder(order._id, "delivered", "disputed", "buyer", buyer._id).catch(() => null),
    ]);

    const final = await Order.findById(order._id);
    expect(final.status).toBe("released");
  });
});

// ── Double refund attempt ──

describe("Concurrency: double refund", () => {
  test("two simultaneous refund transitions — only one succeeds", async () => {
    const buyer = await createUser();
    const seller = await createUser({ role: "seller" });
    const adminUser = await createUser({ role: "admin" });
    const listing = await createListing(seller, { status: "active" });

    const order = await Order.create({
      buyerId: buyer._id,
      sellerId: seller._id,
      listingId: listing._id,
      listingSnapshot: { title: listing.title, priceMinorUnits: listing.priceMinorUnits, currency: "NPR" },
      quantity: 1,
      totalMinorUnits: listing.priceMinorUnits,
      holdDurationMs: 86400000,
      stripePaymentIntentId: "pi_test_refund",
      status: "disputed",
    });

    const [first, second] = await Promise.all([
      transitionOrder(order._id, "disputed", "refunded", "admin", adminUser._id),
      transitionOrder(order._id, "disputed", "refunded", "admin", adminUser._id),
    ]);

    const succeeded = [first, second].filter((r) => r !== null);
    expect(succeeded).toHaveLength(1);
    expect(succeeded[0].status).toBe("refunded");

    // Count only successful transition events (not lost-race events)
    const successEvents = await EscrowEvent.find({ orderId: order._id, toStatus: "refunded", "metadata.lostRace": { $ne: true } });
    expect(successEvents.length).toBe(1);
  });
});

// ── Webhook replay (same event twice) ──

describe("Concurrency: webhook replay", () => {
  test("processing same payment_intent.succeeded twice is idempotent", async () => {
    const buyer = await createUser();
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active" });

    const order = await Order.create({
      buyerId: buyer._id,
      sellerId: seller._id,
      listingId: listing._id,
      listingSnapshot: { title: listing.title, priceMinorUnits: listing.priceMinorUnits, currency: "NPR" },
      quantity: 1,
      totalMinorUnits: listing.priceMinorUnits,
      holdDurationMs: 86400000,
      stripePaymentIntentId: "pi_test_replay",
      status: "created",
    });

    const [first, second] = await Promise.all([
      handlePaymentSucceeded("pi_test_replay", "evt_test_1"),
      handlePaymentSucceeded("pi_test_replay", "evt_test_2"),
    ]);

    const transitions = [first, second].filter((r) => r !== null);
    const transitioned = transitions.filter((r) => r.status === "payment_held");
    expect(transitioned.length).toBe(1);

    const final = await Order.findById(order._id);
    expect(final.status).toBe("payment_held");
  });
});

// ── Auto-release firing while manual release in flight ──

describe("Concurrency: auto-release vs manual release", () => {
  test("auto-release and admin release — only one wins", async () => {
    const buyer = await createUser();
    const seller = await createUser({ role: "seller" });
    const adminUser = await createUser({ role: "admin" });
    const listing = await createListing(seller, { status: "active" });

    const order = await Order.create({
      buyerId: buyer._id,
      sellerId: seller._id,
      listingId: listing._id,
      listingSnapshot: { title: listing.title, priceMinorUnits: listing.priceMinorUnits, currency: "NPR" },
      quantity: 1,
      totalMinorUnits: listing.priceMinorUnits,
      holdDurationMs: 0,
      stripePaymentIntentId: "pi_test_auto_vs_manual",
      status: "delivered",
      deliveredAt: new Date(Date.now() - 86400000),
    });

    const [autoResult, manualResult] = await Promise.all([
      tryAutoRelease(order).catch(() => null),
      transitionOrder(order._id, "delivered", "released", "admin", adminUser._id).catch(() => null),
    ]);

    const succeeded = [autoResult, manualResult].filter((r) => r !== null);
    expect(succeeded).toHaveLength(1);

    const final = await Order.findById(order._id);
    expect(final.status).toBe("released");
  });
});
