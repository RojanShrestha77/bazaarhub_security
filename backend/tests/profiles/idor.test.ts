import request from "supertest";

import { createApp } from "../../src/app";
import { UserModel as User } from "../../src/models/user.model";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

describe("IDOR hardening — :id routes re-resolve ownership/role server-side", () => {
  it("a non-admin seller cannot change another seller's tier via the admin :id route", async () => {
    const sellerA = await createUser({ role: "seller" });
    const sellerB = await createUser({ role: "seller", sellerTier: "unverified" });
    const { cookies, csrfHeader } = await createSession(sellerA);

    const res = await request(app)
      .patch(`/api/admin/users/${sellerB._id}/tier`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ sellerTier: "trusted" });

    expect(res.status).toBe(403);
    const reloaded = await User.findById(sellerB._id);
    expect(reloaded.sellerTier).toBe("unverified");
  });

  it("PATCH /api/profiles/me never accepts or uses a body-supplied id — always the session's own user", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const { cookies, csrfHeader } = await createSession(userA);

    const res = await request(app)
      .patch("/api/profiles/me")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ displayName: "A's name" });
    expect(res.status).toBe(200);

    const bReloaded = await User.findById(userB._id);
    expect(bReloaded).not.toBeNull();
    // Sanity: userB's profile was never touched by userA's request.
    const bProfileRes = await request(app).get(`/api/profiles/${userB._id}`).set("Cookie", cookies);
    expect(bProfileRes.body.displayName).not.toBe("A's name");
  });
});

describe("data export — self-only, no cross-user leakage", () => {
  it("exports only the requesting user's own data, never another user's", async () => {
    const userA = await createUser({ role: "seller" });
    const userB = await createUser({ role: "seller" });
    const { cookies: cookiesA } = await createSession(userA);
    const { cookies: cookiesB, csrfHeader: csrfHeaderB } = await createSession(userB);

    await request(app)
      .patch("/api/profiles/me")
      .set("Cookie", cookiesB)
      .set(csrfHeaderB)
      .send({ displayName: "B's secret display name" });

    const exportRes = await request(app).get("/api/profiles/me/export").set("Cookie", cookiesA);
    expect(exportRes.status).toBe(200);
    expect(exportRes.body.user.email).toBe(userA.email);
    expect(JSON.stringify(exportRes.body)).not.toContain(userB.email);
    expect(JSON.stringify(exportRes.body)).not.toContain("B's secret display name");
  });

  it("never leaks password hash, TOTP secret, or login-failure state", async () => {
    const user = await createUser();
    const { cookies } = await createSession(user);

    const res = await request(app).get("/api/profiles/me/export").set("Cookie", cookies);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/passwordHash|totpSecret|loginFailure/i);
  });
});

describe("data import — cannot write privilege/verification state", () => {
  it("rejects role/sellerTier/mfaEnabled in the import body (same strict schema as PATCH)", async () => {
    const user = await createUser({ role: "buyer" });
    const { cookies, csrfHeader } = await createSession(user);

    const res = await request(app)
      .post("/api/profiles/me/import")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ displayName: "Imported Name", role: "admin", sellerTier: "trusted", mfaEnabled: true });

    expect(res.status).toBe(400);

    const reloaded = await User.findById(user._id);
    expect(reloaded.role).toBe("buyer");
    expect(reloaded.mfaEnabled).toBe(false);
  });

  it("accepts a legitimate allowlisted import", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user);

    const res = await request(app)
      .post("/api/profiles/me/import")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ displayName: "Imported Name", bio: "Imported bio" });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Imported Name");
  });
});
