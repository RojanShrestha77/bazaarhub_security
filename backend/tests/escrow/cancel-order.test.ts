import { OrderModel as Order } from "../../src/models/order.model";
import { EscrowEventModel as EscrowEvent } from "../../src/models/escrow-event.model";
import { ListingModel as Listing } from "../../src/models/listing.model";
import * as escrowService from "../../src/services/escrow.service";
import * as stripeService from "../../src/services/stripe.service";
import { createUser, createListing, createCategory } from "../helpers/fixtures";

// Feature: buyer order cancellation (Phase 2). A buyer may cancel an order
// before the seller ships it (created / payment_held); doing so restores stock
// and releases any payment hold. After shipment, cancellation is refused.
describe("buyer order cancellation", () => {
  let buyer, seller, listing;
  let cancelCalls;

  beforeAll(() => {
    stripeService._setStripeInstance({
      paymentIntents: {
        create: async () => ({ id: `pi_${Date.now()}_${Math.random()}`, client_secret: "cs_test" }),
        capture: async () => ({}),
        cancel: async (id) => {
          cancelCalls.push(id);
          return {};
        },
      },
    });
  });

  beforeEach(async () => {
    cancelCalls = [];
    buyer = await createUser({ role: "buyer" });
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    const category = await createCategory();
    listing = await createListing(seller, { category: category._id, status: "active", priceMinorUnits: 10000, quantity: 10 });
  });

  async function setStatus(orderId, status) {
    return Order.findByIdAndUpdate(orderId, { $set: { status } }, { new: true });
  }

  it("cancels an unpaid (created) order and restores stock", async () => {
    const { order } = await escrowService.checkout(listing._id, 3, buyer._id);
    expect((await Listing.findById(listing._id)).quantity).toBe(7);

    const result = await escrowService.cancelOrderByBuyer(order._id, buyer._id);
    expect(result.status).toBe("cancelled");
    expect(result.cancelledAt).toBeTruthy();
    expect((await Listing.findById(listing._id)).quantity).toBe(10);
    expect(cancelCalls).toHaveLength(1); // payment intent released
  });

  it("cancels a paid-but-unshipped (payment_held) order and restores stock", async () => {
    const { order } = await escrowService.checkout(listing._id, 2, buyer._id);
    await setStatus(order._id, "payment_held");

    const result = await escrowService.cancelOrderByBuyer(order._id, buyer._id);
    expect(result.status).toBe("cancelled");
    expect((await Listing.findById(listing._id)).quantity).toBe(10);
    expect(cancelCalls).toHaveLength(1); // held funds released
  });

  it("refuses cancellation once the order has shipped", async () => {
    const { order } = await escrowService.checkout(listing._id, 1, buyer._id);
    await setStatus(order._id, "shipped");
    await expect(escrowService.cancelOrderByBuyer(order._id, buyer._id)).rejects.toThrow("before it ships");
    // stock stays reserved for the in-flight order
    expect((await Listing.findById(listing._id)).quantity).toBe(9);
  });

  it("does not let a non-owner cancel someone else's order (404-parity)", async () => {
    const { order } = await escrowService.checkout(listing._id, 1, buyer._id);
    const stranger = await createUser({ role: "buyer" });
    await expect(escrowService.cancelOrderByBuyer(order._id, stranger._id)).rejects.toThrow("Order not found");
    expect((await Order.findById(order._id)).status).toBe("created");
  });

  it("writes an immutable buyer-triggered cancellation event", async () => {
    const { order } = await escrowService.checkout(listing._id, 1, buyer._id);
    await escrowService.cancelOrderByBuyer(order._id, buyer._id);
    const events = await EscrowEvent.find({ orderId: order._id, toStatus: "cancelled" });
    expect(events).toHaveLength(1);
    expect(events[0].triggerType).toBe("buyer");
    expect(String(events[0].triggeredBy)).toBe(String(buyer._id));
    expect(events[0].metadata.restoredQuantity).toBe(1);
  });

  it("is idempotent against a concurrent cancel — only one restores stock", async () => {
    const { order } = await escrowService.checkout(listing._id, 4, buyer._id);
    expect((await Listing.findById(listing._id)).quantity).toBe(6);

    const [a, b] = await Promise.all([
      escrowService.cancelOrderByBuyer(order._id, buyer._id).catch((e) => e),
      escrowService.cancelOrderByBuyer(order._id, buyer._id).catch((e) => e),
    ]);
    const winners = [a, b].filter((r) => r && !(r instanceof Error) && r.status === "cancelled");
    expect(winners).toHaveLength(1);
    // stock restored exactly once (6 + 4 = 10), never double-counted
    expect((await Listing.findById(listing._id)).quantity).toBe(10);
  });
});
