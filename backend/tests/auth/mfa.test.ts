import request from "supertest";
import { authenticator } from "otplib";

import { createApp } from "../../src/app";
import { UserModel as User } from "../../src/models/user.model";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

describe("MFA enrolment + verify", () => {
  it("enrols, then confirms with a valid code and flips mfaEnabled", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });

    const enrolRes = await request(app)
      .post("/api/auth/mfa/enrol")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({});
    expect(enrolRes.status).toBe(200);
    expect(enrolRes.body.secret).toBeTruthy();
    expect(enrolRes.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(enrolRes.body.recoveryCodes).toHaveLength(10);

    const stillDisabled = await User.findById(user._id);
    expect(stillDisabled.mfaEnabled).toBe(false);

    const code = authenticator.generate(enrolRes.body.secret);
    const verifyRes = await request(app)
      .post("/api/auth/mfa/verify")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ code });
    expect(verifyRes.status).toBe(200);

    const enabled = await User.findById(user._id);
    expect(enabled.mfaEnabled).toBe(true);
  });

  it("rejects an invalid code", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });

    await request(app).post("/api/auth/mfa/enrol").set("Cookie", cookies).set(csrfHeader).send({});
    const res = await request(app)
      .post("/api/auth/mfa/verify")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ code: "000000" });
    expect(res.status).toBe(401);
  });

  it("rejects replay of an already-used code", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });

    const enrolRes = await request(app)
      .post("/api/auth/mfa/enrol")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({});
    const code = authenticator.generate(enrolRes.body.secret);

    const first = await request(app)
      .post("/api/auth/mfa/verify")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ code });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/auth/mfa/verify")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ code });
    expect(second.status).toBe(401);
  });

  it("400s if verify is attempted before enrolment", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: true });

    const res = await request(app)
      .post("/api/auth/mfa/verify")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ code: "123456" });
    expect(res.status).toBe(400);
  });

  it("rejects enrolment with a valid session but a missing CSRF token", async () => {
    const user = await createUser();
    const { cookies } = await createSession(user, { mfaVerified: true });

    const res = await request(app).post("/api/auth/mfa/enrol").set("Cookie", cookies).send({});
    expect(res.status).toBe(403);
  });

  // ── Re-enrolment hijack defence ──
  // A stolen pre-MFA session (mfaVerified=false) must not be able to overwrite
  // an MFA-enabled account's TOTP secret and recovery codes.
  describe("re-enrolment requires an MFA-verified session", () => {
    // Each test uses a distinct forwarded IP so the in-process mfaEnrolLimiter
    // (max 5 / 15 min, keyed by req.ip; trust proxy=1 honours X-Forwarded-For)
    // gives it a fresh bucket instead of bleeding across the file's enrol calls.
    it("blocks re-enrolment from a pre-MFA session and leaves the secret intact", async () => {
      const ip = "203.0.113.10";
      const user = await createUser({ mfaEnabled: true });
      // First enrol to give the account a real secret to protect.
      const bootstrap = await createSession(user, { mfaVerified: true });
      const enrolRes = await request(app)
        .post("/api/auth/mfa/enrol")
        .set("X-Forwarded-For", ip)
        .set("Cookie", bootstrap.cookies)
        .set(bootstrap.csrfHeader)
        .send({});
      expect(enrolRes.status).toBe(200);
      const originalSecret = await User.findById(user._id).then((u) => u.totpSecret);
      expect(originalSecret).toBeTruthy();

      // Attacker rides a session that has NOT cleared the MFA step.
      const attacker = await createSession(user, { mfaVerified: false });
      const res = await request(app)
        .post("/api/auth/mfa/enrol")
        .set("X-Forwarded-For", ip)
        .set("Cookie", attacker.cookies)
        .set(attacker.csrfHeader)
        .send({});
      expect(res.status).toBe(403);

      const after = await User.findById(user._id);
      expect(after.totpSecret.ciphertext).toBe(originalSecret.ciphertext);
    });

    it("allows re-enrolment once the session is MFA-verified", async () => {
      const ip = "203.0.113.20";
      const user = await createUser({ mfaEnabled: true });
      const first = await createSession(user, { mfaVerified: true });
      const firstEnrol = await request(app)
        .post("/api/auth/mfa/enrol")
        .set("X-Forwarded-For", ip)
        .set("Cookie", first.cookies)
        .set(first.csrfHeader)
        .send({});
      const originalCiphertext = firstEnrol.body.secret;

      const second = await createSession(user, { mfaVerified: true });
      const res = await request(app)
        .post("/api/auth/mfa/enrol")
        .set("X-Forwarded-For", ip)
        .set("Cookie", second.cookies)
        .set(second.csrfHeader)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.secret).toBeTruthy();
      expect(res.body.secret).not.toBe(originalCiphertext);
    });
  });
});
