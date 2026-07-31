import request from "supertest";

import { createApp } from "../../src/app";
import { UserModel as User } from "../../src/models/user.model";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

describe("profile update — mass assignment", () => {
  it("rejects role/sellerTier/mfaEnabled/emailVerified-shaped keys outright (strict schema)", async () => {
    const user = await createUser({ role: "buyer" });
    const { cookies, csrfHeader } = await createSession(user);

    const res = await request(app)
      .patch("/api/profiles/me")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({
        displayName: "Legit Name",
        role: "admin",
        sellerTier: "trusted",
        mfaEnabled: true,
        emailVerified: true,
      });

    expect(res.status).toBe(400);

    const reloaded = await User.findById(user._id);
    expect(reloaded.role).toBe("buyer");
    expect(reloaded.sellerTier).toBe("unverified");
    expect(reloaded.mfaEnabled).toBe(false);
  });

  it("a legitimate patch with only allowlisted fields succeeds and leaves identity fields untouched", async () => {
    const user = await createUser({ role: "seller", sellerTier: "unverified" });
    const { cookies, csrfHeader } = await createSession(user);

    const res = await request(app)
      .patch("/api/profiles/me")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ displayName: "Storefront Name", bio: "Selling things.", location: "Kathmandu" });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Storefront Name");
    expect(res.body.role).toBe("seller");
    expect(res.body.sellerTier).toBe("unverified");

    const reloaded = await User.findById(user._id);
    expect(reloaded.role).toBe("seller");
    expect(reloaded.sellerTier).toBe("unverified");
  });
});

describe("profile viewing — public vs private projection", () => {
  it("own profile (GET /me) includes email/role/sellerTier", async () => {
    const user = await createUser({ role: "seller", sellerTier: "verified" });
    const { cookie } = await createSession(user);

    const res = await request(app).get("/api/profiles/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.role).toBe("seller");
    expect(res.body.sellerTier).toBe("verified");
  });

  it("someone else's profile (GET /:id) never includes email/role/sellerTier/mfaEnabled", async () => {
    const owner = await createUser({ role: "seller", sellerTier: "trusted" });
    const viewer = await createUser({ role: "buyer" });
    const { cookie } = await createSession(viewer);

    const res = await request(app).get(`/api/profiles/${owner._id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBeUndefined();
    expect(res.body.role).toBeUndefined();
    expect(res.body.sellerTier).toBeUndefined();
    expect(res.body.mfaEnabled).toBeUndefined();
  });
});
