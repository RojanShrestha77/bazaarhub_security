import request from "supertest";

import { createApp } from "../../src/app";
import { ListingModel as Listing } from "../../src/models/listing.model";
import { createUser, createSession, createCategory, createListing } from "../helpers/fixtures";

const app = createApp();

// Mongoose builds indexes (including the text index on Listing) in the
// background after the model is compiled — Model.init() resolves once
// that initial build actually completes, closing the race where a $text
// query could run before the text index exists yet.
beforeAll(async () => {
  await Listing.init();
});

describe("search — NoSQL operator injection on every query param", () => {
  let requester;
  let cookie;

  beforeEach(async () => {
    requester = await createUser();
    ({ cookie } = await createSession(requester));
  });

  // Express's query parser (qs) turns ?field[$gt]= into
  // req.query.field = {"$gt": ""} — an object. Every field in
  // searchQuerySchema is a plain string/number type, so safeParse must
  // reject all of these with 400, never letting the object reach a Mongo
  // filter.
  it.each([
    ["q", "q[$gt]="],
    ["category", "category[$gt]="],
    ["minPrice", "minPrice[$gt]="],
    ["maxPrice", "maxPrice[$gt]="],
    ["page", "page[$gt]="],
    ["limit", "limit[$gt]="],
  ])("rejects operator injection on %s", async (_field, qs) => {
    const res = await request(app).get(`/api/listings/search?${qs}`).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("rejects a $where-shaped injection attempt on q", async () => {
    const res = await request(app)
      .get("/api/listings/search")
      .query({ "q[$where]": "1==1" })
      .set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("a well-formed search still works normally (sanity check the guard isn't over-broad)", async () => {
    const seller = await createUser({ role: "seller" });
    await createListing(seller, { title: "Mountain bike", status: "active" });

    const res = await request(app).get("/api/listings/search?q=mountain").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.listings.length).toBeGreaterThan(0);
  });
});

describe("search — ReDoS: $text never compiles user input as a regex", () => {
  it("a classic catastrophic-backtracking payload as the search text returns quickly, not exponentially slow", async () => {
    const user = await createUser();
    const { cookie } = await createSession(user);

    // Shaped like the canonical ReDoS trigger for a vulnerable (a+)+$ /
    // (a|a)*$ pattern — if this were ever compiled as a RegExp against a
    // similarly-shaped stored string, a naive backtracking engine could
    // take exponential time. $text tokenizes this as search terms, so it
    // should return in normal query time regardless.
    const redosPayload = "a".repeat(40) + "!";

    const start = Date.now();
    const res = await request(app)
      .get("/api/listings/search")
      .query({ q: redosPayload })
      .set("Cookie", cookie);
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(200);
    // Generous bound (this is a single in-memory-mongod query, not a
    // production benchmark) — the point is "flat", not "fast": a
    // vulnerable regex engine on this class of payload would blow past
    // any bound in this range, not sit near it.
    expect(elapsedMs).toBeLessThan(1000);
  });
});

describe("search — filters, active-only, pagination cap", () => {
  it("only returns active listings, never draft/sold/withdrawn", async () => {
    const seller = await createUser({ role: "seller", sellerTier: "verified" });
    const category = await createCategory();
    await createListing(seller, { title: "Draft item", category: category._id, status: "draft" });
    await createListing(seller, { title: "Active item", category: category._id, status: "active" });
    await createListing(seller, { title: "Sold item", category: category._id, status: "sold" });
    await createListing(seller, { title: "Withdrawn item", category: category._id, status: "withdrawn" });

    const buyer = await createUser();
    const { cookie } = await createSession(buyer);

    const res = await request(app)
      .get("/api/listings/search")
      .query({ category: category.slug })
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(1);
    expect(res.body.listings[0].title).toBe("Active item");
  });

  it("filters by price range", async () => {
    const seller = await createUser({ role: "seller" });
    const category = await createCategory();
    await createListing(seller, {
      title: "Cheap",
      category: category._id,
      priceMinorUnits: 1000,
      status: "active",
    });
    await createListing(seller, {
      title: "Expensive",
      category: category._id,
      priceMinorUnits: 900000,
      status: "active",
    });

    const buyer = await createUser();
    const { cookie } = await createSession(buyer);

    const res = await request(app)
      .get("/api/listings/search")
      .query({ category: category.slug, maxPrice: 5000 })
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(1);
    expect(res.body.listings[0].title).toBe("Cheap");
  });

  it("an unknown category returns an empty result, not an error", async () => {
    const user = await createUser();
    const { cookie } = await createSession(user);

    const res = await request(app)
      .get("/api/listings/search")
      .query({ category: "does-not-exist" })
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.listings).toEqual([]);
  });

  it("clamps an oversized limit to the server-side cap (50), not whatever the client sent", async () => {
    const user = await createUser();
    const { cookie } = await createSession(user);

    const res = await request(app)
      .get("/api/listings/search")
      .query({ limit: 999999 })
      .set("Cookie", cookie);

    expect(res.status).toBe(400); // zod .max(50) rejects it outright
  });

  it("rejects a non-positive page", async () => {
    const user = await createUser();
    const { cookie } = await createSession(user);

    const res = await request(app).get("/api/listings/search").query({ page: 0 }).set("Cookie", cookie);
    expect(res.status).toBe(400);
  });
});
