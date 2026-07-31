import request from "supertest";
import { createApp } from "../../src/app";
import { UserModel as User } from "../../src/models/user.model";
import { ProfileModel as Profile } from "../../src/models/profile.model";
import { SessionModel as Session } from "../../src/models/session.model";
import { createUser, createSession, createListing, createOrder } from "../helpers/fixtures";

const app = createApp();
const PASSWORD = "correct horse battery staple";

describe("account deletion / erasure", () => {
  it("deletes the account, scrubbing PII and tombstoning the email", async () => {
    const user = await createUser({ password: PASSWORD });
    await Profile.create({ userId: user._id, displayName: "Real Name", bio: "secret bio", location: "Kathmandu" });
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });

    const res = await request(app)
      .delete("/api/profiles/me")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ currentPassword: PASSWORD });
    expect(res.status).toBe(204);

    const after = await User.findById(user._id);
    expect(after!.deletedAt).toBeTruthy();
    expect(after!.email).toBe(`deleted-${user._id}@deleted.invalid`);

    const profile = await Profile.findOne({ userId: user._id });
    expect(profile!.displayName).toBe("");
    expect(profile!.bio).toBe("");
    expect(profile!.location).toBe("");
  });

  it("revokes all sessions on deletion", async () => {
    const user = await createUser({ password: PASSWORD });
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });

    await request(app).delete("/api/profiles/me").set("Cookie", cookies).set(csrfHeader).send({ currentPassword: PASSWORD });

    const live = await Session.countDocuments({ userId: user._id, revokedAt: null });
    expect(live).toBe(0);
  });

  it("rejects deletion with the wrong password and leaves the account intact", async () => {
    const user = await createUser({ password: PASSWORD });
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });

    const res = await request(app)
      .delete("/api/profiles/me")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ currentPassword: "wrong-password" });
    expect(res.status).toBe(401);

    const after = await User.findById(user._id);
    expect(after!.deletedAt).toBeFalsy();
    expect(after!.email).toBe(user.email);
  });

  it("blocks deletion while an order is still in progress (409)", async () => {
    const buyer = await createUser({ password: PASSWORD, role: "buyer" });
    const seller = await createUser({ role: "seller", sellerTier: "trusted" });
    const listing = await createListing(seller, { status: "active" });
    await createOrder(buyer, seller, listing, { status: "payment_held" });

    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });
    const res = await request(app)
      .delete("/api/profiles/me")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ currentPassword: PASSWORD });
    expect(res.status).toBe(409);

    expect((await User.findById(buyer._id))!.deletedAt).toBeFalsy();
  });

  it("allows deletion when all orders are in a terminal state", async () => {
    const buyer = await createUser({ password: PASSWORD, role: "buyer" });
    const seller = await createUser({ role: "seller", sellerTier: "trusted" });
    const listing = await createListing(seller, { status: "active" });
    await createOrder(buyer, seller, listing, { status: "released" });

    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });
    const res = await request(app)
      .delete("/api/profiles/me")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ currentPassword: PASSWORD });
    expect(res.status).toBe(204);
  });

  it("prevents a deleted account from logging in with its old email", async () => {
    const user = await createUser({ password: PASSWORD, email: "gone@example.com" });
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });
    await request(app).delete("/api/profiles/me").set("Cookie", cookies).set(csrfHeader).send({ currentPassword: PASSWORD });

    const login = await request(app).post("/api/auth/login").send({ email: "gone@example.com", password: PASSWORD });
    expect(login.status).toBe(401);
  });
});
