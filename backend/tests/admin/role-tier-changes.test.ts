import request from "supertest";

import { createApp } from "../../src/app";
import { AuditLogModel as AuditLog } from "../../src/models/audit-log.model";
import { UserModel as User } from "../../src/models/user.model";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

describe("admin role/tier changes — access control", () => {
  it("rejects a buyer", async () => {
    const buyer = await createUser({ role: "buyer" });
    const target = await createUser({ role: "seller" });
    const { cookies, csrfHeader } = await createSession(buyer);

    const res = await request(app)
      .patch(`/api/admin/users/${target._id}/role`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ role: "admin" });

    expect(res.status).toBe(403);
  });

  it("rejects a seller trying to self-promote", async () => {
    const seller = await createUser({ role: "seller" });
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .patch(`/api/admin/users/${seller._id}/role`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ role: "admin" });

    expect(res.status).toBe(403);
    const reloaded = await User.findById(seller._id);
    expect(reloaded.role).toBe("seller");
  });

  it("rejects an admin session that hasn't completed MFA", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ role: "seller" });
    const { cookies, csrfHeader } = await createSession(admin, { mfaVerified: false });

    const res = await request(app)
      .patch(`/api/admin/users/${target._id}/tier`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ sellerTier: "verified" });

    expect(res.status).toBe(403);
  });

  it("allows an MFA-verified admin to change role and tier", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ role: "seller", sellerTier: "unverified" });
    const { cookies, csrfHeader } = await createSession(admin, { mfaVerified: true });

    const roleRes = await request(app)
      .patch(`/api/admin/users/${target._id}/role`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ role: "buyer" });
    expect(roleRes.status).toBe(200);
    expect(roleRes.body.role).toBe("buyer");

    const tierRes = await request(app)
      .patch(`/api/admin/users/${target._id}/tier`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ sellerTier: "verified" });
    expect(tierRes.status).toBe(200);
    expect(tierRes.body.sellerTier).toBe("verified");
  });
});

describe("admin tier change — session invalidation takes effect immediately", () => {
  it("downgrading a trusted seller revokes their existing session; the next request with the old cookie is rejected", async () => {
    const admin = await createUser({ role: "admin" });
    const { cookies: adminCookies, csrfHeader: adminCsrf } = await createSession(admin, { mfaVerified: true });

    const seller = await createUser({ role: "seller", sellerTier: "trusted" });
    const { csrfHeader: sellerCsrf, cookies: sellerCookies } = await createSession(seller);

    // Sanity: the seller's session works before the downgrade.
    const before = await request(app)
      .post("/api/auth/session/refresh")
      .set("Cookie", sellerCookies)
      .set(sellerCsrf)
      .send({});
    expect(before.status).toBe(200);

    const downgrade = await request(app)
      .patch(`/api/admin/users/${seller._id}/tier`)
      .set("Cookie", adminCookies)
      .set(adminCsrf)
      .send({ sellerTier: "unverified" });
    expect(downgrade.status).toBe(200);

    const after = await request(app)
      .post("/api/auth/session/refresh")
      .set("Cookie", sellerCookies)
      .set(sellerCsrf)
      .send({});
    expect(after.status).toBe(401);
  });
});

describe("admin role/tier changes — audit log", () => {
  it("records actor, subject, before, and after on a role change", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ role: "buyer" });
    const { cookies, csrfHeader } = await createSession(admin, { mfaVerified: true });

    await request(app)
      .patch(`/api/admin/users/${target._id}/role`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ role: "seller" });

    const entry = await AuditLog.findOne({ subject: target._id, action: "role_change" });
    expect(entry).not.toBeNull();
    expect(entry.actor.toString()).toBe(admin._id.toString());
    expect(entry.before).toBe("buyer");
    expect(entry.after).toBe("seller");
  });

  it("records a tier change", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ role: "seller", sellerTier: "unverified" });
    const { cookies, csrfHeader } = await createSession(admin, { mfaVerified: true });

    await request(app)
      .patch(`/api/admin/users/${target._id}/tier`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ sellerTier: "trusted" });

    const entry = await AuditLog.findOne({ subject: target._id, action: "tier_change" });
    expect(entry).not.toBeNull();
    expect(entry.before).toBe("unverified");
    expect(entry.after).toBe("trusted");
  });
});
