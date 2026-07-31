import { OrderModel as Order } from "../../src/models/order.model";
import { EscrowEventModel as EscrowEvent } from "../../src/models/escrow-event.model";
import { ListingModel as Listing } from "../../src/models/listing.model";
import * as escrowService from "../../src/services/escrow.service";
import * as stripeService from "../../src/services/stripe.service";
import {
  createUser,
  createListing,
  createCategory,
} from "../helpers/fixtures";

const MOCK_PI = { id: "pi_test_mock", client_secret: "pi_test_secret_mock" };
const LISTING_PRICE = 10000;

function createOrderDoc(buyerId, sellerId, listingId, overrides = {}) {
  return {
    buyerId,
    sellerId,
    listingId,
    listingSnapshot: { title: "Test", priceMinorUnits: LISTING_PRICE, currency: "NPR" },
    quantity: 1,
    totalMinorUnits: LISTING_PRICE,
    holdDurationMs: 1,
    status: "created",
    stripePaymentIntentId: "pi_test_mock",
    deliveredAt: overrides.deliveredAt || undefined,
    holdDurationMs: overrides.holdDurationMs || 100000,
    ...overrides,
  };
}

async function setOrderState(orderId, status, extra = {}) {
  return Order.findByIdAndUpdate(orderId, { $set: { status, ...extra } }, { new: true });
}

describe("escrow state machine", () => {
  let buyer, seller, admin, listing;

  beforeAll(() => {
    stripeService._setStripeInstance({
      paymentIntents: {
        create: async () => MOCK_PI,
        capture: async () => ({}),
        cancel: async () => ({}),
      },
    });
  });

  beforeEach(async () => {
    buyer = await createUser({ role: "buyer" });
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    admin = await createUser({ role: "admin" });
    const category = await createCategory();
    listing = await createListing(seller, { category: category._id, status: "active", priceMinorUnits: LISTING_PRICE, quantity: 10 });
  });

  describe("checkout", () => {
    it("creates order + returns clientSecret", async () => {
      const result = await escrowService.checkout(listing._id, 2, buyer._id);
      expect(result.order.status).toBe("created");
      expect(result.clientSecret).toBe(MOCK_PI.client_secret);
      expect(result.order.quantity).toBe(2);
      expect(result.order.totalMinorUnits).toBe(LISTING_PRICE * 2);
    });

    it("rejects own listing", async () => {
      await expect(escrowService.checkout(listing._id, 1, seller._id)).rejects.toThrow("own listing");
    });

    it("rejects inactive listing", async () => {
      listing.status = "draft";
      await listing.save();
      await expect(escrowService.checkout(listing._id, 1, buyer._id)).rejects.toThrow("not available");
    });

    it("rejects insufficient quantity", async () => {
      await expect(escrowService.checkout(listing._id, 999, buyer._id)).rejects.toThrow("Insufficient quantity");
    });

    it("decrements listing quantity atomically", async () => {
      await escrowService.checkout(listing._id, 3, buyer._id);
      const updated = await Listing.findById(listing._id);
      expect(updated.quantity).toBe(7);
    });
  });

  describe("happy path transitions", () => {
    let order;
    beforeEach(async () => {
      const result = await escrowService.checkout(listing._id, 1, buyer._id);
      order = result.order;
    });

    it("payment_held -> shipped (seller)", async () => {
      await setOrderState(order._id, "payment_held");
      const updated = await escrowService.markShipped(order._id, seller._id);
      expect(updated).not.toBeNull();
      expect(updated.status).toBe("shipped");
    });

    it("shipped -> delivered (buyer)", async () => {
      await setOrderState(order._id, "shipped");
      const updated = await escrowService.confirmDelivery(order._id, buyer._id);
      expect(updated).not.toBeNull();
      expect(updated.status).toBe("delivered");
      expect(updated.deliveredAt).toBeTruthy();
    });

    it("shipped -> disputed (buyer)", async () => {
      await setOrderState(order._id, "shipped");
      const updated = await escrowService.openDispute(order._id, buyer._id);
      expect(updated).not.toBeNull();
      expect(updated.status).toBe("disputed");
    });

    it("payment_held -> disputed (buyer)", async () => {
      await setOrderState(order._id, "payment_held");
      const updated = await escrowService.openDispute(order._id, buyer._id);
      expect(updated).not.toBeNull();
      expect(updated.status).toBe("disputed");
    });

    it("disputed -> released (admin)", async () => {
      await setOrderState(order._id, "disputed");
      const updated = await escrowService.resolveDispute(order._id, admin._id, "released");
      expect(updated).not.toBeNull();
      expect(updated.status).toBe("released");
    });

    it("disputed -> refunded (admin)", async () => {
      await setOrderState(order._id, "disputed");
      const updated = await escrowService.resolveDispute(order._id, admin._id, "refunded");
      expect(updated).not.toBeNull();
      expect(updated.status).toBe("refunded");
    });

    it("delivered -> released (admin, after hold expires)", async () => {
      await setOrderState(order._id, "delivered", { deliveredAt: new Date(Date.now() - 5000), holdDurationMs: 1 });
      const updated = await escrowService.adminRelease(order._id, admin._id);
      expect(updated).not.toBeNull();
      expect(updated.status).toBe("released");
    });

    it("auto-release after hold window", async () => {
      order = await Order.create(createOrderDoc(buyer._id, seller._id, listing._id, {
        status: "delivered",
        deliveredAt: new Date(Date.now() - 5000),
        holdDurationMs: 1,
      }));
      const released = await escrowService.tryAutoRelease(await Order.findById(order._id));
      expect(released).not.toBeNull();
      expect(released.status).toBe("released");
    });
  });

  describe("illegal transitions", () => {
    let order;
    beforeEach(async () => {
      const result = await escrowService.checkout(listing._id, 1, buyer._id);
      order = result.order;
    });

    it("created -> shipped returns null (status mismatch)", async () => {
      const result = await escrowService.markShipped(order._id, seller._id);
      expect(result).toBeNull();
    });

    it("dispute from created throws", async () => {
      await expect(escrowService.openDispute(order._id, buyer._id)).rejects.toThrow("not allowed");
    });

    it("SELLER MUST NOT TRIGGER RELEASE — no function exists", () => {
      expect(escrowService.releaseOrder).toBeUndefined();
      expect(escrowService.markReleased).toBeUndefined();
    });
  });

  describe("guards", () => {
    let order;

    it("hold_expired guard blocks premature auto-release", async () => {
      const result = await escrowService.checkout(listing._id, 1, buyer._id);
      order = result.order;
      await setOrderState(order._id, "delivered", { deliveredAt: new Date() });
      const released = await escrowService.tryAutoRelease(await Order.findById(order._id));
      expect(released).toBeNull();
    });

    it("dispute window from created (30 days) is open", async () => {
      order = await escrowService.checkout(listing._id, 1, buyer._id);
      order = order.order;
      await setOrderState(order._id, "payment_held");
      const disputed = await escrowService.openDispute(order._id, buyer._id);
      expect(disputed).not.toBeNull();
    });
  });

  describe("concurrency — atomicity", () => {
    let order;
    beforeEach(async () => {
      order = await Order.create(createOrderDoc(buyer._id, seller._id, listing._id, { status: "shipped" }));
    });

    it("two simultaneous confirm-delivery — one wins", async () => {
      const [a, b] = await Promise.all([
        escrowService.confirmDelivery(order._id, buyer._id).catch((e) => e),
        escrowService.confirmDelivery(order._id, buyer._id).catch((e) => e),
      ]);
      expect([a, b].filter((r) => r && !(r instanceof Error) && r.status === "delivered")).toHaveLength(1);
    });

    it("deliver + dispute race — one wins", async () => {
      const [d, di] = await Promise.all([
        escrowService.confirmDelivery(order._id, buyer._id).catch((e) => e),
        escrowService.openDispute(order._id, buyer._id).catch((e) => e),
      ]);
      expect([d, di].filter((r) => r && !(r instanceof Error))).toHaveLength(1);
    });

    it("double dispute — one wins", async () => {
      const [a, b] = await Promise.all([
        escrowService.openDispute(order._id, buyer._id).catch((e) => e),
        escrowService.openDispute(order._id, buyer._id).catch((e) => e),
      ]);
      expect([a, b].filter((r) => r && !(r instanceof Error))).toHaveLength(1);
    });

    it("auto-release + admin release race — one wins", async () => {
      order = await Order.create(createOrderDoc(buyer._id, seller._id, listing._id, {
        status: "delivered",
        deliveredAt: new Date(Date.now() - 5000),
        holdDurationMs: 1,
      }));
      const [auto, adminRes] = await Promise.all([
        escrowService.tryAutoRelease(await Order.findById(order._id)),
        escrowService.adminRelease(order._id, admin._id).catch((e) => e),
      ]);
      expect([auto, adminRes].filter((r) => r && !(r instanceof Error) && r.status === "released")).toHaveLength(1);
    });
  });
});
