import { performance } from "node:perf_hooks";
import request from "supertest";

import { createApp } from "../../src/app.js";
import { createUser } from "../helpers/fixtures.js";

// Decision #7: the timing gap between "hash a real stored value" and "skip
// hashing because the user doesn't exist" is the sneaky enumeration leak —
// identical response bodies don't save you if one branch is measurably
// faster. This is a COARSE regression guard, not a statistical proof: it
// catches the gross case (dummy-hash path skipped entirely, e.g. an early
// return before any hashing happens). It will NOT reliably catch a subtle
// leak — that needs a real sample distribution under load. Use
// tests/timing/login-timing.js for that; run it against a live server,
// not this suite.

const app = createApp();
const SAMPLES = 8;
// Generous on purpose — this is a smoke check for "did someone skip the
// dummy-hash path entirely", not a precise statistical bound. A real
// argon2id-vs-no-op gap is typically hundreds of ms; anything failing this
// loose a bound is almost certainly the gross case, not noise.
const MAX_MEAN_DELTA_MS = 50;

async function timeRequest(email) {
  const start = performance.now();
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "definitely-wrong" });
  const elapsed = performance.now() - start;
  // Fails now (route is an unimplemented 501 stub) — also asserting status
  // here so a regression that skips hashing AND returns the wrong status
  // shows up as an obvious status failure rather than an easy-to-miss
  // "timing happened to line up" false pass.
  expect(res.status).toBe(401);
  return elapsed;
}

function mean(samples) {
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

describe("login timing parity (coarse smoke check)", () => {
  it("takes roughly the same time for an existing user (wrong password) and a non-existent user", async () => {
    const user = await createUser({ email: "timing-existing@example.com" });

    // Block design, not interleaved (existing, nonexistent, existing, ...).
    // An earlier version of this test alternated branches per-iteration and
    // intermittently failed with a ~55-65ms gap that looked like a real
    // leak. It wasn't: a diagnostic run comparing block vs. interleaved
    // sampling at the same sample size showed the gap only appears under
    // strict alternation (delta ~55-65ms) and disappears under block
    // sampling (delta ~8ms) — consistent with a per-call-position artifact
    // (plausibly GC/allocator behavior from repeatedly allocating and
    // freeing argon2's 64MiB working buffer), not the route actually
    // taking a different path. Block design avoids confounding branch
    // identity with call position.
    const existingTimes = [];
    for (let i = 0; i < SAMPLES; i++) {
      existingTimes.push(await timeRequest(user.email));
    }
    const nonexistentTimes = [];
    for (let i = 0; i < SAMPLES; i++) {
      nonexistentTimes.push(await timeRequest(`nobody-${i}@example.com`));
    }

    const delta = Math.abs(mean(existingTimes) - mean(nonexistentTimes));
    expect(delta).toBeLessThan(MAX_MEAN_DELTA_MS);
  });
});
