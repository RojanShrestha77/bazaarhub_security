// Phase 2 self-attack Finding 3 (FIXED): an admin could target their own
// account on the role/tier change routes, which would revoke their own
// session immediately on success. See docs/security-decisions.md for why
// this is blocked outright rather than just discouraged: a self-demotion
// that happens to be the last admin has no in-app recovery path.
import request from "supertest";

import { createApp } from "../../src/app";
import { UserModel as User } from "../../src/models/user.model";
import { AuditLogModel as AuditLog } from "../../src/models/audit-log.model";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

describe("Finding 3 (FIXED) — admin self-targeting is blocked on both role and tier changes", () => {
  it("rejects an admin's role-change attempt against their own id with 400, session stays alive", async () => {
    const admin = await createUser({ role: "admin" });
    const { cookies, csrfHeader } = await createSession(admin, { mfaVerified: true });

    const res = await request(app)
      .patch(`/api/admin/users/${admin._id}/role`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ role: "buyer" });

    expect(res.status).toBe(400);

    const reloaded = await User.findById(admin._id);
    expect(reloaded.role).toBe("admin");

    // Not locked out — self-targeting is blocked, not silently succeeding.
    const followUp = await request(app).get("/api/profiles/me").set("Cookie", cookies);
    expect(followUp.status).toBe(200);

    const entry = await AuditLog.findOne({ subject: admin._id });
    expect(entry).toBeNull(); // rejected before any audit entry is written
  });

  it("rejects an admin's tier-change attempt against their own id with 400", async () => {
    const admin = await createUser({ role: "admin", sellerTier: "unverified" });
    const { cookies, csrfHeader } = await createSession(admin, { mfaVerified: true });

    const res = await request(app)
      .patch(`/api/admin/users/${admin._id}/tier`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ sellerTier: "trusted" });

    expect(res.status).toBe(400);

    const reloaded = await User.findById(admin._id);
    expect(reloaded.sellerTier).toBe("unverified");
  });

  it("still allows an admin to change a DIFFERENT admin's role", async () => {
    const actingAdmin = await createUser({ role: "admin" });
    const otherAdmin = await createUser({ role: "admin" });
    const { cookies, csrfHeader } = await createSession(actingAdmin, { mfaVerified: true });

    const res = await request(app)
      .patch(`/api/admin/users/${otherAdmin._id}/role`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ role: "buyer" });

    expect(res.status).toBe(200);
    const reloaded = await User.findById(otherAdmin._id);
    expect(reloaded.role).toBe("buyer");
  });
});
