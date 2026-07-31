import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

import { createAuthzRouter } from "../../src/lib/authzRouter";
import {
  PUBLIC,
  requireSession,
  requireRole,
  requireTier,
  requireOwnership,
  requireMfaVerified,
} from "../../src/middlewares/authz";
import { UserModel as User } from "../../src/models/user.model";
import { createUser, createSession } from "../helpers/fixtures";

function buildTestApp() {
  const app = express();
  app.use(cookieParser());

  const router = createAuthzRouter();
  router.get("/public", PUBLIC, (_req, res) => res.json({ ok: true }));
  router.get("/session-only", [requireSession], (_req, res) => res.json({ ok: true }));
  router.get("/admin-only", [requireRole("admin")], (_req, res) => res.json({ ok: true }));
  router.get("/admin-mfa", [requireRole("admin"), requireMfaVerified], (_req, res) => res.json({ ok: true }));
  router.get("/verified-seller", [requireTier("verified")], (_req, res) => res.json({ ok: true }));
  router.get(
    "/owned/:id",
    [
      requireOwnership(async (req) => {
        const target = await User.findById(req.params.id);
        return target?._id;
      }),
    ],
    (_req, res) => res.json({ ok: true }),
  );
  app.use("/", router);

  return app;
}

describe("createAuthzRouter — structural enforcement", () => {
  it("throws at registration time if a route omits an authz declaration", () => {
    const router = createAuthzRouter();
    expect(() => router.get("/oops", (req, res) => res.end())).toThrow(/authz declaration/);
  });

  it("throws if the declaration array is empty", () => {
    const router = createAuthzRouter();
    expect(() => router.get("/oops", [], (req, res) => res.end())).toThrow(/authz declaration/);
  });

  it("throws if the declaration contains an untagged function", () => {
    const router = createAuthzRouter();
    expect(() => router.get("/oops", [(req, res, next) => next()], (req, res) => res.end())).toThrow(
      /authz declaration/,
    );
  });
});

describe("requireRole / requireSession / PUBLIC", () => {
  const app = buildTestApp();

  it("PUBLIC allows an anonymous request", async () => {
    const res = await request(app).get("/public");
    expect(res.status).toBe(200);
  });

  it("requireSession rejects an anonymous request", async () => {
    const res = await request(app).get("/session-only");
    expect(res.status).toBe(401);
  });

  it("requireRole rejects a buyer on an admin-only route", async () => {
    const buyer = await createUser({ role: "buyer" });
    const { cookie } = await createSession(buyer);
    const res = await request(app).get("/admin-only").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("requireRole allows an admin", async () => {
    const admin = await createUser({ role: "admin" });
    const { cookie } = await createSession(admin);
    const res = await request(app).get("/admin-only").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});

describe("requireRole + requireMfaVerified composition", () => {
  const app = buildTestApp();

  it("rejects an admin whose session hasn't completed MFA", async () => {
    const admin = await createUser({ role: "admin" });
    const { cookie } = await createSession(admin, { mfaVerified: false });
    const res = await request(app).get("/admin-mfa").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("allows an admin with an MFA-verified session", async () => {
    const admin = await createUser({ role: "admin" });
    const { cookie } = await createSession(admin, { mfaVerified: true });
    const res = await request(app).get("/admin-mfa").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("rejects a non-admin even with an MFA-verified session", async () => {
    const buyer = await createUser({ role: "buyer" });
    const { cookie } = await createSession(buyer, { mfaVerified: true });
    const res = await request(app).get("/admin-mfa").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });
});

describe("requireTier", () => {
  const app = buildTestApp();

  it("rejects a buyer regardless of sellerTier", async () => {
    const buyer = await createUser({ role: "buyer" });
    const { cookie } = await createSession(buyer);
    const res = await request(app).get("/verified-seller").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("rejects an unverified seller", async () => {
    const seller = await createUser({ role: "seller" });
    const { cookie } = await createSession(seller);
    const res = await request(app).get("/verified-seller").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("allows a verified seller", async () => {
    const seller = await createUser({ role: "seller" });
    seller.sellerTier = "verified";
    await seller.save();
    const { cookie } = await createSession(seller);
    const res = await request(app).get("/verified-seller").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });

  it("allows a trusted seller on a route that requires only verified (rank is >=)", async () => {
    const seller = await createUser({ role: "seller" });
    seller.sellerTier = "trusted";
    await seller.save();
    const { cookie } = await createSession(seller);
    const res = await request(app).get("/verified-seller").set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});

describe("requireOwnership", () => {
  const app = buildTestApp();

  it("returns 404 (not 403) when the resource belongs to someone else", async () => {
    const owner = await createUser();
    const requester = await createUser();
    const { cookie } = await createSession(requester);

    const res = await request(app).get(`/owned/${owner._id}`).set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the resource doesn't exist at all — same status as a mismatch", async () => {
    const requester = await createUser();
    const { cookie } = await createSession(requester);

    const res = await request(app).get("/owned/000000000000000000000000").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("allows the actual owner", async () => {
    const owner = await createUser();
    const { cookie } = await createSession(owner);

    const res = await request(app).get(`/owned/${owner._id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
  });
});
