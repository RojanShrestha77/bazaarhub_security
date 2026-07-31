// Phase 2 self-attack Finding 4 (FIXED): a malformed :id crashed through
// to a 500 (Mongoose CastError). validateObjectIdParam (src/middleware/
// validate.js) now rejects malformed ids at the route boundary — and
// deliberately with the SAME 404 body a well-formed-but-missing id gets,
// not a distinct 400. See docs/security-decisions.md and the comment atop
// validateObjectIdParam for why: a distinguishable 400-vs-404 would still
// tell an attacker their guess was syntactically wrong vs. simply absent,
// which is the same class of signal as Finding 1's unthrottled brute-force
// surface, just via response shape instead of response rate.
import request from "supertest";

import { createApp } from "../../src/app";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

describe("Finding 4 (FIXED) — malformed :id is now indistinguishable from a well-formed-but-missing id", () => {
  it("admin route: malformed id -> 404, same as a valid-but-nonexistent id", async () => {
    const admin = await createUser({ role: "admin" });
    const { cookies, csrfHeader } = await createSession(admin, { mfaVerified: true });

    const malformed = await request(app)
      .patch("/api/admin/users/not-a-valid-id/role")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ role: "buyer" });
    const wellFormedMissing = await request(app)
      .patch("/api/admin/users/000000000000000000000000/role")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ role: "buyer" });

    expect(malformed.status).toBe(404);
    expect(wellFormedMissing.status).toBe(404);
    expect(malformed.body).toEqual(wellFormedMissing.body);
  });

  it("profile route: malformed id -> 404, identical body to a well-formed-but-missing id's 404", async () => {
    const user = await createUser();
    const { cookie } = await createSession(user);

    const malformed = await request(app).get("/api/profiles/not-a-valid-id").set("Cookie", cookie);
    const wellFormedMissing = await request(app)
      .get("/api/profiles/000000000000000000000000")
      .set("Cookie", cookie);

    expect(malformed.status).toBe(404);
    expect(wellFormedMissing.status).toBe(404);
    expect(malformed.body).toEqual(wellFormedMissing.body);
  });

  it("profile avatar route: malformed id -> 404, same as missing id", async () => {
    const user = await createUser();
    const { cookie } = await createSession(user);

    const malformed = await request(app).get("/api/profiles/not-a-valid-id/avatar").set("Cookie", cookie);
    expect(malformed.status).toBe(404);
  });

  it("a genuinely valid, existing id still works normally", async () => {
    const target = await createUser();
    const requester = await createUser();
    const { cookie } = await createSession(requester);

    const res = await request(app).get(`/api/profiles/${target._id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});
