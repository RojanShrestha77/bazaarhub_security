import { OrderModel as Order } from "../../src/models/order.model";
import { EscrowEventModel as EscrowEvent } from "../../src/models/escrow-event.model";
import { ListingModel as Listing } from "../../src/models/listing.model";
import * as escrowService from "../../src/services/escrow.service";
import * as stripeService from "../../src/services/stripe.service";
import { createUser, createListing, createCategory } from "../helpers/fixtures";

// Fix #3: abandoned checkouts must not hold stock forever. checkout() reserves
// stock before payment; expireStaleReservations() returns it once the payment
// window lapses.
describe("reservation expiry sweep", () => {
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

  it("cancels a stale unpaid order and restores its reserved stock", async () => {
    const { order } = await escrowService.checkout(listing._id, 3, buyer._id);
    expect((await Listing.findById(listing._id)).quantity).toBe(7); // reserved

    // Simulate the order having been created longer ago than the TTL.
    // Age the order via the raw driver: Mongoose's timestamps plugin ignores a
    // $set on createdAt through findByIdAndUpdate.
    await Order.collection.updateOne(
      { _id: order._id },
      { $set: { createdAt: new Date(Date.now() - escrowService.RESERVATION_TTL_MS - 1000) } },
    );

    const cancelled = await escrowService.expireStaleReservations();
    expect(cancelled).toBe(1);

    const swept = await Order.findById(order._id);
    expect(swept.status).toBe("cancelled");
    expect(swept.cancelledAt).toBeTruthy();
    expect((await Listing.findById(listing._id)).quantity).toBe(10); // stock returned
    expect(cancelCalls).toHaveLength(1); // uncaptured payment intent cancelled
  });

  it("leaves a fresh unpaid order untouched", async () => {
    const { order } = await escrowService.checkout(listing._id, 2, buyer._id);
    const cancelled = await escrowService.expireStaleReservations();
    expect(cancelled).toBe(0);
    expect((await Order.findById(order._id)).status).toBe("created");
    expect((await Listing.findById(listing._id)).quantity).toBe(8);
  });

  it("never touches an order that already advanced to payment_held", async () => {
    const { order } = await escrowService.checkout(listing._id, 1, buyer._id);
    await Order.findByIdAndUpdate(order._id, {
      $set: {
        status: "payment_held",
        createdAt: new Date(Date.now() - escrowService.RESERVATION_TTL_MS - 1000),
      },
    });

    const cancelled = await escrowService.expireStaleReservations();
    expect(cancelled).toBe(0);
    expect((await Order.findById(order._id)).status).toBe("payment_held");
    // Stock stays reserved for the real, paid order.
    expect((await Listing.findById(listing._id)).quantity).toBe(9);
  });

  it("writes an immutable cancellation event", async () => {
    const { order } = await escrowService.checkout(listing._id, 1, buyer._id);
    // Age the order via the raw driver: Mongoose's timestamps plugin ignores a
    // $set on createdAt through findByIdAndUpdate.
    await Order.collection.updateOne(
      { _id: order._id },
      { $set: { createdAt: new Date(Date.now() - escrowService.RESERVATION_TTL_MS - 1000) } },
    );
    await escrowService.expireStaleReservations();

    const events = await EscrowEvent.find({ orderId: order._id, toStatus: "cancelled" });
    expect(events).toHaveLength(1);
    expect(events[0].triggerType).toBe("system");
    expect(events[0].metadata.restoredQuantity).toBe(1);
  });
});
