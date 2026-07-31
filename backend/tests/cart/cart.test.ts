import request from "supertest";

import { createApp } from "../../src/app";
import { ListingModel as Listing } from "../../src/models/listing.model";
import { createUser, createSession, createListing } from "../helpers/fixtures";

const app = createApp();

describe("cart — cannot add own/inactive/sold listings", () => {
  it("rejects adding your own listing", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active" });
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1 });

    expect(res.status).toBe(400);
  });

  it("rejects adding a draft (not yet active) listing", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "draft" });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1 });

    expect(res.status).toBe(400);
  });

  it("rejects adding a sold listing", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "sold" });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1 });

    expect(res.status).toBe(400);
  });

  it("allows adding an active listing that isn't the buyer's own", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", priceMinorUnits: 5000, quantity: 5 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].available).toBe(true);
    expect(res.body.items[0].unitPriceMinorUnits).toBe(5000);
    expect(res.body.items[0].lineTotalMinorUnits).toBe(10000);
  });
});

describe("cart — quantity validation", () => {
  it("rejects a zero quantity", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", quantity: 5 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 0 });

    expect(res.status).toBe(400);
  });

  it("rejects a non-integer quantity", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", quantity: 5 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1.5 });

    expect(res.status).toBe(400);
  });

  it("rejects a quantity above the hard per-line cap (10)", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", quantity: 999 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 11 });

    expect(res.status).toBe(400);
  });

  it("rejects a quantity above the listing's actual available stock", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", quantity: 2 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 3 });

    expect(res.status).toBe(400);
  });
});

describe("cart — price/availability are always re-resolved live, never trusted from add-time", () => {
  it("reflects a price change made by the seller after the item was carted", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", priceMinorUnits: 1000 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1 });

    // Seller changes the price after it's already in the buyer's cart.
    listing.priceMinorUnits = 999999;
    await listing.save();

    const res = await request(app).get("/api/cart").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.items[0].unitPriceMinorUnits).toBe(999999);
    expect(res.body.totalMinorUnits).toBe(999999);
  });

  it("flags an item unavailable once the listing sells out from under the cart, and excludes it from the total", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", priceMinorUnits: 1000 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1 });

    listing.status = "sold";
    await listing.save();

    const res = await request(app).get("/api/cart").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.items[0].available).toBe(false);
    expect(res.body.totalMinorUnits).toBe(0);
  });
});

describe("cart — price manipulation attempt", () => {
  it("ignores a client-supplied price field on add-to-cart", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", priceMinorUnits: 5000 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1, priceMinorUnits: 1 });

    expect(res.status).toBe(400); // .strict() schema rejects the unknown field outright
  });
});

describe("cart — remove and update", () => {
  it("updates quantity", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", quantity: 5, priceMinorUnits: 1000 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1 });

    const res = await request(app)
      .patch(`/api/cart/items/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body.items[0].quantity).toBe(3);
    expect(res.body.items[0].lineTotalMinorUnits).toBe(3000);
  });

  it("removes an item", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active" });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1 });

    const res = await request(app)
      .delete(`/api/cart/items/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });
});

describe("checkout — validation-only, no persistence", () => {
  it("returns a priced summary and does not mutate the listing", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", priceMinorUnits: 2500, quantity: 5 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 2 });

    const res = await request(app).post("/api/cart/checkout").set("Cookie", cookies).set(csrfHeader);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.totalMinorUnits).toBe(5000);

    const reloaded = await Listing.findById(listing._id);
    expect(reloaded.status).toBe("active");
    expect(reloaded.quantity).toBe(5); // untouched — no Order model, no decrement
  });

  it("returns 409 with the specific unavailable items if something changed since carting", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active", priceMinorUnits: 2500 });
    const buyer = await createUser();
    const { cookies, csrfHeader } = await createSession(buyer);

    await request(app)
      .post("/api/cart/items")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: listing._id.toString(), quantity: 1 });

    listing.status = "withdrawn";
    await listing.save();

    const res = await request(app).post("/api/cart/checkout").set("Cookie", cookies).set(csrfHeader);

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.unavailable).toHaveLength(1);
  });
});
