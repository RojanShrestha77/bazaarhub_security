import { OrderModel } from "../../src/models/order.model";
import { EscrowEventModel } from "../../src/models/escrow-event.model";
import { ListingModel } from "../../src/models/listing.model";
import * as escrowService from "../../src/services/escrow.service";
import * as stripeService from "../../src/services/stripe.service";
import { createUser, createListing, createCategory } from "../helpers/fixtures";

describe("checkout payment methods", () => {
  let buyer, seller, listing;

  beforeAll(() => {
    stripeService._setStripeInstance({
      paymentIntents: { create: async () => ({ id: "pi_x", client_secret: "cs_x" }), capture: async () => ({}), cancel: async () => ({}) },
    });
  });

  beforeEach(async () => {
    buyer = await createUser({ role: "buyer" });
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    const category = await createCategory();
    listing = await createListing(seller, { category: category._id, status: "active", priceMinorUnits: 50000, quantity: 10 });
  });

  it("COD checkout places the order straight into payment_held with no payment intent", async () => {
    const { order, paymentMethod } = await escrowService.checkout(listing._id, 2, buyer._id, "cod");
    expect(paymentMethod).toBe("cod");
    expect(order.paymentMethod).toBe("cod");
    expect(order.status).toBe("payment_held");
    expect(order.stripePaymentIntentId).toBeUndefined();
    expect(order.totalMinorUnits).toBe(100000);
    // stock still reserved
    expect((await ListingModel.findById(listing._id)).quantity).toBe(8);
    // an escrow event was written
    expect(await EscrowEventModel.countDocuments({ orderId: order._id, toStatus: "payment_held" })).toBe(1);
  });

  it("a COD order can be shipped immediately (seller)", async () => {
    const { order } = await escrowService.checkout(listing._id, 1, buyer._id, "cod");
    const shipped = await escrowService.markShipped(order._id, seller._id);
    expect(shipped.status).toBe("shipped");
  });

  it("stripe checkout still returns a client secret and stays in created", async () => {
    const { order, paymentMethod, clientSecret } = await escrowService.checkout(listing._id, 1, buyer._id, "stripe");
    expect(paymentMethod).toBe("stripe");
    expect(order.status).toBe("created");
    expect(clientSecret).toBe("cs_x");
  });

  it("default checkout (no method) is stripe for backward compatibility", async () => {
    const { paymentMethod } = await escrowService.checkout(listing._id, 1, buyer._id);
    expect(paymentMethod).toBe("stripe");
  });

  it("rolls nothing back on COD (no external call to fail)", async () => {
    await escrowService.checkout(listing._id, 3, buyer._id, "cod");
    const orders = await OrderModel.countDocuments({ buyerId: buyer._id, paymentMethod: "cod" });
    expect(orders).toBe(1);
  });
});
