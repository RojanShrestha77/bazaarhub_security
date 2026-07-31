// Phase 2 self-attack Finding 1 (FIXED): profile routes had no rate
// limiting except GET /me/export. Split into its own file (was originally
// combined with Findings 3/4 in a single self-attack-findings.test.js)
// because these tests deliberately exhaust profileReadLimiter/
// profileWriteLimiter's buckets, and express-rate-limit's in-memory store
// is shared for the lifetime of the `app` instance a test file imports —
// sharing a file with Finding 4's :id tests meant this file's bursts were
// leaving the read limiter tripped for tests that expected a clean 404.
import request from "supertest";

import { createApp } from "../../src/app";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

describe("Finding 1 (FIXED) — profile routes are now rate limited, reads and writes separately", () => {
  // profileWriteLimiter caps writes at 30 per 15 min (rateLimiters.js) —
  // 40 rapid requests must trip it before the end.
  it("PATCH /me: eventually 429s under a burst well past the write limiter's cap", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user);

    const statuses = [];
    for (let i = 0; i < 40; i++) {
      const res = await request(app)
        .patch("/api/profiles/me")
        .set("Cookie", cookies)
        .set(csrfHeader)
        .send({ displayName: `spam-${i}` });
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  });

  // profileReadLimiter caps reads at 120 per 15 min — looser (reads are
  // normal marketplace-browsing traffic) but still bounded, which is what
  // docs/security-decisions.md's ObjectId-enumeration acceptance now
  // depends on. 130 requests must cross it.
  it("GET /:id: eventually 429s under a burst well past the read limiter's cap", async () => {
    const attacker = await createUser();
    const { cookie } = await createSession(attacker);

    const statuses = [];
    for (let i = 0; i < 130; i++) {
      const fakeId = i.toString().padStart(24, "0");
      const res = await request(app).get(`/api/profiles/${fakeId}`).set("Cookie", cookie);
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  });
});
