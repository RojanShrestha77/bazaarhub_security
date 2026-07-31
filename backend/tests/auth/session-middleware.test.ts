import request from "supertest";

import { createApp } from "../../src/app";
import { SessionModel as Session } from "../../src/models/session.model";
import { createUser, createSession } from "../helpers/fixtures";

// Decision #1: the TTL index is garbage collection, not enforcement — the
// lookup path must re-check expiry itself and must not trust that an
// expired-but-not-yet-reaped document is still valid.

const app = createApp();

describe("session middleware — expiry re-checking", () => {
  it("rejects a session past expiresAt even though the document still exists", async () => {
    const user = await createUser();
    const { cookie, session } = await createSession(user, {
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    // Prove the TTL reaper hasn't run — the document is still there.
    const stillExists = await Session.findById(session._id);
    expect(stillExists).not.toBeNull();

    const res = await request(app).post("/api/auth/logout-all").set("Cookie", cookie).send({});
    expect(res.status).toBe(401);
  });

  it("rejects a session past absoluteExpiresAt even if expiresAt looks current", async () => {
    const user = await createUser();
    const { cookie } = await createSession(user, {
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // sliding window looks fresh
      absoluteExpiresAt: new Date(Date.now() - 1000), // but the hard cap has passed
    });

    const res = await request(app).post("/api/auth/logout-all").set("Cookie", cookie).send({});
    expect(res.status).toBe(401);
  });

  it("rejects a revoked session", async () => {
    const user = await createUser();
    const { cookie, session } = await createSession(user, { revokedAt: new Date() });

    const res = await request(app).post("/api/auth/logout-all").set("Cookie", cookie).send({});
    expect(res.status).toBe(401);

    // Sanity: the session really was pre-revoked, not revoked by the call above.
    const doc = await Session.findById(session._id);
    expect(doc.revokedAt).toBeTruthy();
  });

  it("extends the sliding window on a successful authenticated request", async () => {
    const user = await createUser();
    const { cookies, csrfHeader, session } = await createSession(user, {
      expiresAt: new Date(Date.now() + 60 * 1000), // 1 min left
    });
    const originalExpiresAt = session.expiresAt.getTime();

    const res = await request(app)
      .post("/api/auth/session/refresh")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({});
    expect(res.status).toBe(200);

    const updated = await Session.findById(session._id);
    expect(updated.expiresAt.getTime()).toBeGreaterThan(originalExpiresAt);
  });

  it("caps the extended sliding window at absoluteExpiresAt", async () => {
    const user = await createUser();
    const nearCap = new Date(Date.now() + 60 * 1000); // absolute cap in 1 min
    const { cookies, csrfHeader, session } = await createSession(user, {
      expiresAt: new Date(Date.now() + 30 * 1000),
      absoluteExpiresAt: nearCap,
    });

    const res = await request(app)
      .post("/api/auth/session/refresh")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({});
    expect(res.status).toBe(200);

    const updated = await Session.findById(session._id);
    expect(updated.expiresAt.getTime()).toBeLessThanOrEqual(nearCap.getTime());
  });
});
