import request from "supertest";

import { createApp } from "../../src/app";
import { ListingModel as Listing } from "../../src/models/listing.model";
import { createUser, createSession, createCategory, createListing } from "../helpers/fixtures";

const app = createApp();

describe("listing creation — role and tier gating", () => {
  it("rejects a buyer trying to create a listing", async () => {
    const buyer = await createUser({ role: "buyer" });
    const category = await createCategory();
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .post("/api/listings")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ title: "Bike", priceMinorUnits: 500000, category: category._id.toString() });

    expect(res.status).toBe(403);
  });

  it("allows a seller to create a listing, starting in draft status", async () => {
    const seller = await createUser({ role: "seller" });
    const category = await createCategory();
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .post("/api/listings")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ title: "Bike", priceMinorUnits: 500000, category: category._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.sellerId).toBe(seller._id.toString());
  });

  it("enforces the unverified-tier listing cap (3) server-side", async () => {
    const seller = await createUser({ role: "seller", sellerTier: "unverified" });
    const category = await createCategory();
    const { cookies, csrfHeader } = await createSession(seller);

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/listings")
        .set("Cookie", cookies)
        .set(csrfHeader)
        .send({ title: `Item ${i}`, priceMinorUnits: 1000, category: category._id.toString() });
      expect(res.status).toBe(201);
    }

    const fourth = await request(app)
      .post("/api/listings")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ title: "Item 4", priceMinorUnits: 1000, category: category._id.toString() });

    expect(fourth.status).toBe(403);

    const count = await Listing.countDocuments({ sellerId: seller._id });
    expect(count).toBe(3);
  });

  it("a verified seller gets a higher cap (20) than an unverified one", async () => {
    const seller = await createUser({ role: "seller", sellerTier: "verified" });
    const category = await createCategory();
    const { cookies, csrfHeader } = await createSession(seller);

    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post("/api/listings")
        .set("Cookie", cookies)
        .set(csrfHeader)
        .send({ title: `Item ${i}`, priceMinorUnits: 1000, category: category._id.toString() });
      expect(res.status).toBe(201);
    }
  });

  it("withdrawing a listing frees up a tier-limit slot", async () => {
    const seller = await createUser({ role: "seller", sellerTier: "unverified" });
    const category = await createCategory();
    const { cookies, csrfHeader } = await createSession(seller);

    const listings = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/listings")
        .set("Cookie", cookies)
        .set(csrfHeader)
        .send({ title: `Item ${i}`, priceMinorUnits: 1000, category: category._id.toString() });
      listings.push(res.body.id);
    }

    await request(app).delete(`/api/listings/${listings[0]}`).set("Cookie", cookies).set(csrfHeader);

    const res = await request(app)
      .post("/api/listings")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ title: "New item", priceMinorUnits: 1000, category: category._id.toString() });

    expect(res.status).toBe(201);
  });

  it("rejects an unknown category", async () => {
    const seller = await createUser({ role: "seller" });
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .post("/api/listings")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ title: "Bike", priceMinorUnits: 500000, category: "000000000000000000000000" });

    expect(res.status).toBe(400);
  });
});

describe("listing mass assignment", () => {
  it("ignores a client-supplied sellerId and status on create", async () => {
    const seller = await createUser({ role: "seller" });
    const otherUser = await createUser();
    const category = await createCategory();
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .post("/api/listings")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({
        title: "Bike",
        priceMinorUnits: 500000,
        category: category._id.toString(),
        sellerId: otherUser._id.toString(),
        status: "active",
      });

    expect(res.status).toBe(400); // .strict() schema rejects unknown keys
  });
});

describe("draft listing visibility (self-attack finding)", () => {
  it("hides a draft listing from a non-owner with 404, not the listing data", async () => {
    const seller = await createUser({ role: "seller" });
    const draft = await createListing(seller, { title: "Unpublished secret item", status: "draft" });
    const stranger = await createUser();
    const { cookie } = await createSession(stranger);

    const res = await request(app).get(`/api/listings/${draft._id}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("still shows the owner their own draft listing", async () => {
    const seller = await createUser({ role: "seller" });
    const draft = await createListing(seller, { title: "My draft", status: "draft" });
    const { cookie } = await createSession(seller);

    const res = await request(app).get(`/api/listings/${draft._id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("My draft");
  });

  it("shows an active listing to anyone", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active" });
    const stranger = await createUser();
    const { cookie } = await createSession(stranger);

    const res = await request(app).get(`/api/listings/${listing._id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});

describe("listing ownership", () => {
  it("rejects a non-owner's PATCH with 404 (not 403 — no existence leak)", async () => {
    const seller = await createUser({ role: "seller" });
    const attacker = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(attacker);

    const res = await request(app)
      .patch(`/api/listings/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ title: "Hijacked title" });

    expect(res.status).toBe(404);

    const reloaded = await Listing.findById(listing._id);
    expect(reloaded.title).toBe(listing.title);
  });

  it("allows the owner to edit their own listing", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .patch(`/api/listings/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ title: "Updated title" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated title");
  });

  it("rejects a non-owner's DELETE with 404", async () => {
    const seller = await createUser({ role: "seller" });
    const attacker = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(attacker);

    const res = await request(app)
      .delete(`/api/listings/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader);

    expect(res.status).toBe(404);
  });
});

describe("status transitions", () => {
  it("allows draft -> active -> sold", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(seller);

    const toActive = await request(app)
      .patch(`/api/listings/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ status: "active" });
    expect(toActive.status).toBe(200);
    expect(toActive.body.status).toBe("active");

    const toSold = await request(app)
      .patch(`/api/listings/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ status: "sold" });
    expect(toSold.status).toBe(200);
    expect(toSold.body.status).toBe("sold");
  });

  it("rejects sold -> active", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "sold" });
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .patch(`/api/listings/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ status: "active" });

    expect(res.status).toBe(400);

    const reloaded = await Listing.findById(listing._id);
    expect(reloaded.status).toBe("sold");
  });

  it("rejects draft -> sold (must pass through active)", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .patch(`/api/listings/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ status: "sold" });

    expect(res.status).toBe(400);
  });

  it("DELETE withdraws an active listing", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active" });
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .delete(`/api/listings/${listing._id}`)
      .set("Cookie", cookies)
      .set(csrfHeader);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("withdrawn");
  });
});
