import request from "supertest";
import { createApp } from "../../src/app";
import { UserModel } from "../../src/models/user.model";

const app = createApp();

describe("registration — mass assignment", () => {
  it("ignores role and sellerTier from the request body", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "attacker@example.com",
      password: "a-perfectly-fine-password-123",
      role: "admin",
      sellerTier: "premium",
    });

    expect(res.status).toBe(201);

    const user = await UserModel.findOne({ email: "attacker@example.com" });
    expect(user).not.toBeNull();
    expect(user!.role).toBe("buyer");
    expect(user!.sellerTier).toBe("unverified");
  });
});

describe("registration — concurrent same-email race", () => {
  it("returns 201 for both concurrent registrations of a brand-new email, not a 500", async () => {
    const [first, second] = await Promise.all([
      request(app).post("/api/auth/register").send({ email: "racer@example.com", password: "a-perfectly-fine-password-123" }),
      request(app).post("/api/auth/register").send({ email: "racer@example.com", password: "a-different-fine-password-456" }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const users = await UserModel.find({ email: "racer@example.com" });
    expect(users).toHaveLength(1);
  });
});

describe("registration — happy path", () => {
  it("creates a user with an argon2id hash, not the plaintext password", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "new-user@example.com",
      password: "a-perfectly-fine-password-123",
    });

    expect(res.status).toBe(201);

    const user = await UserModel.findOne({ email: "new-user@example.com" });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe("a-perfectly-fine-password-123");
    expect(user!.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("rejects passwords shorter than the policy minimum", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "short-password@example.com",
      password: "short1",
    });

    expect(res.status).toBe(400);
  });
});
