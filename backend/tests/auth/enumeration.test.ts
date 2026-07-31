import request from "supertest";
import { createApp } from "../../src/app";
import { createUser } from "../helpers/fixtures";

// Decision #7: registration, login, and password reset must not reveal
// whether an account exists — not via status, body, or headers.
const app = createApp();

describe("login — no user-existence signal", () => {
  it("returns identical status/body for a wrong password on an existing user vs a non-existent user", async () => {
    const user = await createUser({ email: "exists@example.com" });

    const existing = await request(app).post("/api/auth/login").send({ email: user.email, password: "definitely-wrong" });
    const nonexistent = await request(app).post("/api/auth/login").send({ email: "no-such-user@example.com", password: "definitely-wrong" });

    expect(existing.status).toBe(401);
    expect(nonexistent.status).toBe(401);
    expect(existing.body).toEqual({ error: "Invalid email or password" });
    expect(nonexistent.body).toEqual({ error: "Invalid email or password" });

    expect(existing.headers["content-type"]).toEqual(nonexistent.headers["content-type"]);
    expect(existing.headers["content-length"]).toEqual(nonexistent.headers["content-length"]);
  });
});

describe("registration — no user-existence signal", () => {
  it("returns identical status/body whether or not the email is already registered", async () => {
    const user = await createUser({ email: "taken@example.com" });

    const takenRes = await request(app).post("/api/auth/register").send({ email: user.email, password: "some-new-password-123" });
    const freeRes = await request(app).post("/api/auth/register").send({ email: "brand-new@example.com", password: "some-new-password-123" });

    expect(takenRes.status).toBe(freeRes.status);
    expect(takenRes.body).toEqual(freeRes.body);
    expect(takenRes.headers["content-length"]).toEqual(freeRes.headers["content-length"]);
  });
});

describe("password reset request — no user-existence signal", () => {
  it("returns identical status/body whether or not the email has an account", async () => {
    const user = await createUser({ email: "reset-me@example.com" });

    const existsRes = await request(app).post("/api/auth/password/reset/request").send({ email: user.email });
    const missingRes = await request(app).post("/api/auth/password/reset/request").send({ email: "never-registered@example.com" });

    expect(existsRes.status).toBe(missingRes.status);
    expect(existsRes.body).toEqual(missingRes.body);
    expect(existsRes.headers["content-length"]).toEqual(missingRes.headers["content-length"]);
  });
});
