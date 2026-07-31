import request from "supertest";
import { createApp } from "../../src/app";
import { WishlistItemModel } from "../../src/models/wishlist-item.model";
import { createUser, createSession, createListing } from "../helpers/fixtures";

const app = createApp();

describe("wishlist", () => {
  let user, seller, listing, cookies, csrfHeader;

  beforeEach(async () => {
    user = await createUser({ role: "buyer" });
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    listing = await createListing(seller, { status: "active" });
    ({ cookies, csrfHeader } = await createSession(user, { mfaVerified: true }));
  });

  it("saves a listing and lists it back", async () => {
    const add = await request(app).put(`/api/wishlist/${listing._id}`).set("Cookie", cookies).set(csrfHeader).send();
    expect(add.status).toBe(201);

    const list = await request(app).get("/api/wishlist").set("Cookie", cookies);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(String(list.body.items[0].id)).toBe(String(listing._id));
  });

  it("is idempotent — saving twice keeps a single row and returns 200 the second time", async () => {
    const first = await request(app).put(`/api/wishlist/${listing._id}`).set("Cookie", cookies).set(csrfHeader).send();
    expect(first.status).toBe(201);
    const second = await request(app).put(`/api/wishlist/${listing._id}`).set("Cookie", cookies).set(csrfHeader).send();
    expect(second.status).toBe(200);
    expect(await WishlistItemModel.countDocuments({ userId: user._id })).toBe(1);
  });

  it("removes a saved listing", async () => {
    await request(app).put(`/api/wishlist/${listing._id}`).set("Cookie", cookies).set(csrfHeader).send();
    const del = await request(app).delete(`/api/wishlist/${listing._id}`).set("Cookie", cookies).set(csrfHeader).send();
    expect(del.status).toBe(204);
    expect(await WishlistItemModel.countDocuments({ userId: user._id })).toBe(0);
  });

  it("removing something not saved is a no-op success", async () => {
    const del = await request(app).delete(`/api/wishlist/${listing._id}`).set("Cookie", cookies).set(csrfHeader).send();
    expect(del.status).toBe(204);
  });

  it("404s when saving a listing that doesn't exist", async () => {
    const res = await request(app).put(`/api/wishlist/${"a".repeat(24)}`).set("Cookie", cookies).set(csrfHeader).send();
    expect(res.status).toBe(404);
  });

  it("is private to the session user — another user's wishlist is not visible", async () => {
    await request(app).put(`/api/wishlist/${listing._id}`).set("Cookie", cookies).set(csrfHeader).send();

    const other = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });
    const list = await request(app).get("/api/wishlist").set("Cookie", other.cookies);
    expect(list.body.items).toHaveLength(0);
  });

  it("requires a session", async () => {
    const res = await request(app).get("/api/wishlist");
    expect(res.status).toBe(401);
  });

  it("requires a CSRF token to save", async () => {
    const res = await request(app).put(`/api/wishlist/${listing._id}`).set("Cookie", cookies).send();
    expect(res.status).toBe(403);
  });
});
