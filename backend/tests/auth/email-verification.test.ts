import request from "supertest";
import { createApp } from "../../src/app";
import { UserModel as User } from "../../src/models/user.model";
import { EmailVerificationTokenModel as VToken } from "../../src/models/email-verification-token.model";
import { createEmailVerificationToken } from "../../src/services/email-verification.service";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

describe("email verification — token flow", () => {
  it("registration creates an unverified user and issues a verification token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "newbie@example.com", password: "a-perfectly-fine-password-123" });
    expect(res.status).toBe(201);

    const user = await User.findOne({ email: "newbie@example.com" });
    expect(user!.emailVerified).toBe(false);
    expect(await VToken.countDocuments({ userId: user!._id, used: false })).toBe(1);
  });

  it("verifies with a valid token and flips emailVerified", async () => {
    const user = await createUser({ emailVerified: false });
    const token = await createEmailVerificationToken(user._id);

    const res = await request(app).post("/api/auth/email/verify").send({ token });
    expect(res.status).toBe(200);
    expect(res.body.emailVerified).toBe(true);

    const after = await User.findById(user._id);
    expect(after!.emailVerified).toBe(true);
    expect(after!.emailVerifiedAt).toBeTruthy();
  });

  it("rejects an invalid token", async () => {
    const res = await request(app).post("/api/auth/email/verify").send({ token: "not-a-real-token" });
    expect(res.status).toBe(400);
  });

  it("is single-use — a consumed token cannot be replayed", async () => {
    const user = await createUser({ emailVerified: false });
    const token = await createEmailVerificationToken(user._id);

    const first = await request(app).post("/api/auth/email/verify").send({ token });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/email/verify").send({ token });
    expect(second.status).toBe(400);
  });

  it("resend issues a fresh token for an unverified, authenticated user", async () => {
    const user = await createUser({ emailVerified: false });
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });

    const res = await request(app)
      .post("/api/auth/email/verify/resend")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({});
    expect(res.status).toBe(200);
    expect(await VToken.countDocuments({ userId: user._id, used: false })).toBe(1);
  });

  it("resend is a no-op for an already-verified user (issues no token)", async () => {
    const user = await createUser({ emailVerified: true });
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });

    const res = await request(app)
      .post("/api/auth/email/verify/resend")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({});
    expect(res.status).toBe(200);
    expect(await VToken.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe("email verification — sensitive-action gate", () => {
  it("blocks checkout for an unverified user with 403", async () => {
    const buyer = await createUser({ role: "buyer", emailVerified: false });
    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });

    const res = await request(app)
      .post("/api/escrow/checkout")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: "a".repeat(24), quantity: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verification/i);
  });

  it("blocks seller application for an unverified user with 403", async () => {
    const buyer = await createUser({ role: "buyer", emailVerified: false });
    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });

    const res = await request(app)
      .post("/api/seller/apply")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verification/i);
  });

  it("lets a verified user past the gate (not a 403 email-verification error)", async () => {
    const buyer = await createUser({ role: "buyer", emailVerified: true });
    const { cookies, csrfHeader } = await createSession(buyer, { mfaVerified: true });

    const res = await request(app)
      .post("/api/escrow/checkout")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ listingId: "a".repeat(24), quantity: 1 });
    // The gate is passed; the request fails later (no such listing) — the point
    // is it is NOT the email-verification 403.
    expect(res.status).not.toBe(403);
  });
});
