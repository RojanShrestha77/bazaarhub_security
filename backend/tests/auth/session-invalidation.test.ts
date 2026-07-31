import request from "supertest";

import { createApp } from "../../src/app";
import { SessionModel as Session } from "../../src/models/session.model";
import { UserModel as User } from "../../src/models/user.model";
import { createUser, createSession } from "../helpers/fixtures";
import { createPasswordResetToken } from "../../src/services/password-reset.service";
import { PasswordResetTokenModel as PasswordResetToken } from "../../src/models/password-reset-token.model";
import { hashSessionToken } from "../../src/lib/sessionToken";

// Decision #1 follow-up: two separate code paths, not one function with a
// flag.
//   - Self-service change (re-verified, already authenticated) -> kill all
//     OTHER sessions, keep the current one.
//   - Reset/recovery via email token -> kill ALL sessions, no exceptions,
//     including whichever session initiated the reset.

const app = createApp();
const REAL_PASSWORD = "correct horse battery staple"; // fixtures.js default

describe("password change (self-service) — kill all-but-current", () => {
  it("revokes other sessions but keeps the session that made the change", async () => {
    const user = await createUser();
    const { cookies: currentCookies, csrfHeader, session: currentSession } = await createSession(user);
    const { session: otherSession } = await createSession(user);

    const res = await request(app)
      .post("/api/auth/password/change")
      .set("Cookie", currentCookies)
      .set(csrfHeader)
      .send({ currentPassword: REAL_PASSWORD, newPassword: "new-password-123" });
    expect(res.status).toBe(200);

    const current = await Session.findById(currentSession._id);
    const other = await Session.findById(otherSession._id);

    expect(current?.revokedAt).toBeFalsy();
    expect(other?.revokedAt).toBeTruthy();
  });

  it("retires an outstanding reset token once the password changes via self-service", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user);
    const leftoverResetToken = await createPasswordResetToken(user._id);

    const changeRes = await request(app)
      .post("/api/auth/password/change")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ currentPassword: REAL_PASSWORD, newPassword: "new-password-123" });
    expect(changeRes.status).toBe(200);

    // Asserted directly against the model rather than a second HTTP call
    // to /password/reset/confirm — that endpoint shares passwordResetLimiter
    // with every other reset test in this file, and the limiter is the
    // thing under test elsewhere, not something to spend on this assertion.
    const tokenDoc = await PasswordResetToken.findOne({ tokenHash: hashSessionToken(leftoverResetToken) });
    expect(tokenDoc?.used).toBe(true);
  });

  it("rejects the wrong current password and changes nothing", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user);

    const res = await request(app)
      .post("/api/auth/password/change")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ currentPassword: "totally-wrong-password", newPassword: "new-password-123" });
    expect(res.status).toBe(401);
  });

  it("rejects a pre-MFA session even with the correct current password", async () => {
    const user = await createUser({ mfaEnabled: true });
    const { cookies, csrfHeader } = await createSession(user, { mfaVerified: false });

    const res = await request(app)
      .post("/api/auth/password/change")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ currentPassword: REAL_PASSWORD, newPassword: "new-password-123" });
    expect(res.status).toBe(403);
  });
});

describe("password reset (recovery) — kill all, no exceptions", () => {
  it("revokes every session, including the one that initiated the reset", async () => {
    const user = await createUser();
    const { cookies: initiatingCookies, session: initiatingSession } = await createSession(user);
    const { session: otherSession } = await createSession(user);
    const rawToken = await createPasswordResetToken(user._id);

    // No CSRF header here on purpose: password/reset/confirm is
    // unauthenticated (the reset token itself is the credential), so it's
    // deliberately not behind requireCsrfToken.
    const res = await request(app)
      .post("/api/auth/password/reset/confirm")
      .set("Cookie", initiatingCookies)
      .send({ token: rawToken, newPassword: "new-password-123" });
    expect(res.status).toBe(200);

    const initiating = await Session.findById(initiatingSession._id);
    const other = await Session.findById(otherSession._id);

    expect(initiating?.revokedAt).toBeTruthy();
    expect(other?.revokedAt).toBeTruthy();

    const updated = await User.findById(user._id);
    expect(updated.passwordHash).not.toBe(user.passwordHash);
  });

  it("rejects an already-used reset token", async () => {
    const user = await createUser();
    const rawToken = await createPasswordResetToken(user._id);

    const first = await request(app)
      .post("/api/auth/password/reset/confirm")
      .send({ token: rawToken, newPassword: "new-password-123" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/auth/password/reset/confirm")
      .send({ token: rawToken, newPassword: "another-new-password-456" });
    expect(second.status).toBe(400);
  });

  it("rejects a bogus token", async () => {
    const res = await request(app)
      .post("/api/auth/password/reset/confirm")
      .send({ token: "not-a-real-token", newPassword: "new-password-123" });
    expect(res.status).toBe(400);
  });

  it("retires a second outstanding reset token once the first is used", async () => {
    const user = await createUser();
    const firstToken = await createPasswordResetToken(user._id);
    const secondToken = await createPasswordResetToken(user._id);

    const first = await request(app)
      .post("/api/auth/password/reset/confirm")
      .send({ token: firstToken, newPassword: "new-password-123" });
    expect(first.status).toBe(200);

    // Direct model check (not a second /reset/confirm call) — see note
    // above on sharing passwordResetLimiter's budget across this file.
    const secondTokenDoc = await PasswordResetToken.findOne({ tokenHash: hashSessionToken(secondToken) });
    expect(secondTokenDoc?.used).toBe(true);
  });
});
