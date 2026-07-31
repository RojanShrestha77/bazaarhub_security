import { OrderModel as Order } from "../../src/models/order.model";
import { EscrowEventModel as EscrowEvent } from "../../src/models/escrow-event.model";
import { WebhookEventModel as WebhookEvent } from "../../src/models/webhook-event.model";
import * as escrowService from "../../src/services/escrow.service";
import * as stripeService from "../../src/services/stripe.service";
import { createUser, createListing, createCategory } from "../helpers/fixtures";

// Fix #4: Stripe redelivers webhooks. handlePaymentSucceeded records each event
// id in an idempotency ledger so a replayed delivery advances the order at most
// once.
describe("webhook idempotency", () => {
  let buyer, seller, listing;

  beforeAll(() => {
    stripeService._setStripeInstance({
      paymentIntents: {
        create: async () => ({ id: `pi_${Date.now()}_${Math.random()}`, client_secret: "cs_test" }),
        capture: async () => ({}),
        cancel: async () => ({}),
      },
    });
  });

  beforeEach(async () => {
    buyer = await createUser({ role: "buyer" });
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    const category = await createCategory();
    listing = await createListing(seller, { category: category._id, status: "active", priceMinorUnits: 10000, quantity: 10 });
  });

  it("advances a created order to payment_held on first delivery", async () => {
    const { order } = await escrowService.checkout(listing._id, 1, buyer._id);
    const result = await escrowService.handlePaymentSucceeded(order.stripePaymentIntentId, "evt_1");
    expect(result.status).toBe("payment_held");
    expect(await WebhookEvent.countDocuments({ eventId: "evt_1" })).toBe(1);
  });

  it("is a no-op on a redelivered event id (no second transition event)", async () => {
    const { order } = await escrowService.checkout(listing._id, 1, buyer._id);

    await escrowService.handlePaymentSucceeded(order.stripePaymentIntentId, "evt_dup");
    const heldEventsAfterFirst = await EscrowEvent.countDocuments({ orderId: order._id, toStatus: "payment_held" });

    // Same event id arrives again (Stripe retry).
    await escrowService.handlePaymentSucceeded(order.stripePaymentIntentId, "evt_dup");

    const heldEventsAfterSecond = await EscrowEvent.countDocuments({ orderId: order._id, toStatus: "payment_held" });
    expect(heldEventsAfterFirst).toBe(1);
    expect(heldEventsAfterSecond).toBe(1); // not reprocessed
    expect(await WebhookEvent.countDocuments({ eventId: "evt_dup" })).toBe(1);
    expect((await Order.findById(order._id)).status).toBe("payment_held");
  });

  it("records distinct event ids separately", async () => {
    const { order } = await escrowService.checkout(listing._id, 1, buyer._id);
    await escrowService.handlePaymentSucceeded(order.stripePaymentIntentId, "evt_a");
    // A different event for an already-held order: ledgered, but no transition.
    await escrowService.handlePaymentSucceeded(order.stripePaymentIntentId, "evt_b");
    expect(await WebhookEvent.countDocuments({})).toBe(2);
    expect(await EscrowEvent.countDocuments({ orderId: order._id, toStatus: "payment_held" })).toBe(1);
  });
});
