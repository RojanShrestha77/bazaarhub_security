import request from "supertest";
import { createApp } from "../../src/app";
import { UserModel as User } from "../../src/models/user.model";
import { createUser } from "../helpers/fixtures";

// Decision #6: per-account exponential backoff, NOT a hard lock, and not
// self-reinforcing. A legitimate user retrying their CORRECT password while
// backoff is active should still be denied but not keep extending it.
const app = createApp();
const REAL_PASSWORD = "correct horse battery staple";

describe("login backoff", () => {
  it("denies a correct password while backoff is active, without extending it", async () => {
    const user = await createUser({ email: "backoff@example.com", password: REAL_PASSWORD });

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "loginFailure.count": 3,
          "loginFailure.lastAttemptAt": new Date(),
          "loginFailure.nextAttemptAllowedAt": new Date(Date.now() + 60_000),
        },
      },
    );

    const first = await request(app).post("/api/auth/login").send({ email: user.email, password: REAL_PASSWORD });
    expect(first.status).toBe(401);

    const afterFirst = await User.findById(user._id);
    expect(afterFirst.loginFailure.count).toBe(3);

    const second = await request(app).post("/api/auth/login").send({ email: user.email, password: REAL_PASSWORD });
    expect(second.status).toBe(401);

    const afterSecond = await User.findById(user._id);
    expect(afterSecond.loginFailure.count).toBe(3);
    expect(afterSecond.loginFailure.nextAttemptAllowedAt.getTime()).toBe(afterFirst.loginFailure.nextAttemptAllowedAt.getTime());
  });

  it("still extends backoff on an actually wrong password", async () => {
    const user = await createUser({ email: "wrongpw@example.com", password: REAL_PASSWORD });

    await request(app).post("/api/auth/login").send({ email: user.email, password: "nope" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const after = await User.findById(user._id);
    expect(after.loginFailure.count).toBe(1);
  });
});
