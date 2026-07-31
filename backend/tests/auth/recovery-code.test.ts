import request from "supertest";

import { createApp } from "../../src/app";
import { RecoveryCodeModel as RecoveryCode } from "../../src/models/recovery-code.model";
import { createUser, createSession, createRecoveryCode } from "../helpers/fixtures";

// Decision #5: single-use enforcement must be one atomic findOneAndUpdate,
// not look-up-then-write — a naive implementation lets two concurrent
// submissions of the SAME code both succeed (TOCTOU). This test fires two
// concurrent requests with the same plaintext code and checks the DB ends
// up with exactly one consumed code, not zero and not two.
//
// Passes against the real implementation (services/recoveryCodeService.js)
// as of Slice 4 — see the comment there for the documented fork from the
// original "atomic findOneAndUpdate on {hash, used:false}" plan text:
// argon2id's random salt makes that literal phrasing impossible, but the
// atomicity property this test actually checks is preserved via a
// findOneAndUpdate keyed on {_id, used:false} instead.

const app = createApp();

describe("recovery code — concurrent submission (TOCTOU)", () => {
  it("accepts the same code from exactly one of two concurrent requests", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: false });
    const { plaintext } = await createRecoveryCode(user);

    const [first, second] = await Promise.all([
      request(app)
        .post("/api/auth/mfa/recovery-code/verify")
        .set("Cookie", cookies)
        .set(csrfHeader)
        .send({ code: plaintext }),
      request(app)
        .post("/api/auth/mfa/recovery-code/verify")
        .set("Cookie", cookies)
        .set(csrfHeader)
        .send({ code: plaintext }),
    ]);

    const successes = [first, second].filter((r) => r.status === 200);
    expect(successes).toHaveLength(1);

    const consumed = await RecoveryCode.find({ userId: user._id, used: true });
    expect(consumed).toHaveLength(1);
  });

  it("rejects the same code on a second, sequential submission", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: false });
    const { plaintext } = await createRecoveryCode(user);

    const firstRes = await request(app)
      .post("/api/auth/mfa/recovery-code/verify")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ code: plaintext });
    const secondRes = await request(app)
      .post("/api/auth/mfa/recovery-code/verify")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ code: plaintext });

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(400);
  });
});
