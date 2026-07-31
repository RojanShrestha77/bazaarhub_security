import supertest from "supertest";
import { createApp } from "../../src/app";
import { VerificationRequestModel as VerificationRequest } from "../../src/models/verification-request.model";
import { UserModel as User } from "../../src/models/user.model";
import { createUser, createSession, createVerificationRequest } from "../helpers/fixtures";

let app;

beforeAll(() => {
  app = createApp();
});

const DETAILS = {
  fullName: "Ram Bahadur",
  idType: "citizenship",
  idNumber: "12-34-56-78901",
  businessName: "Ram Hardware",
  phone: "9800000000",
  address: "Baneshwor, Kathmandu",
};

// ── Submit (KYC details, no file upload) ──
describe("POST /api/verification/submit", () => {
  test("seller submits verification details", async () => {
    const seller = await createUser({ role: "seller" });
    const session = await createSession(seller);

    const res = await supertest(app)
      .post("/api/verification/submit")
      .set("Cookie", session.cookies)
      .set(session.csrfHeader)
      .send(DETAILS);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");

    const request = await VerificationRequest.findById(res.body.id);
    expect(request).not.toBeNull();
    expect(String(request.sellerId)).toBe(String(seller._id));
    expect(request.details.fullName).toBe("Ram Bahadur");
    expect(request.details.idType).toBe("citizenship");
  });

  test("rejects a non-seller", async () => {
    const buyer = await createUser({ role: "buyer" });
    const session = await createSession(buyer);
    const res = await supertest(app)
      .post("/api/verification/submit")
      .set("Cookie", session.cookies).set(session.csrfHeader)
      .send(DETAILS);
    expect(res.status).toBe(403);
  });

  test("rejects incomplete details (400)", async () => {
    const seller = await createUser({ role: "seller" });
    const session = await createSession(seller);
    const res = await supertest(app)
      .post("/api/verification/submit")
      .set("Cookie", session.cookies).set(session.csrfHeader)
      .send({ fullName: "Only a name" });
    expect(res.status).toBe(400);
  });

  test("rejects an invalid idType (400)", async () => {
    const seller = await createUser({ role: "seller" });
    const session = await createSession(seller);
    const res = await supertest(app)
      .post("/api/verification/submit")
      .set("Cookie", session.cookies).set(session.csrfHeader)
      .send({ ...DETAILS, idType: "national_secret_id" });
    expect(res.status).toBe(400);
  });

  test("rejects a duplicate pending submission (409)", async () => {
    const seller = await createUser({ role: "seller" });
    const session = await createSession(seller);
    await supertest(app).post("/api/verification/submit").set("Cookie", session.cookies).set(session.csrfHeader).send(DETAILS);
    const res = await supertest(app).post("/api/verification/submit").set("Cookie", session.cookies).set(session.csrfHeader).send(DETAILS);
    expect(res.status).toBe(409);
  });
});

// ── Status ──
describe("GET /api/verification/status", () => {
  test("returns the seller's latest request status", async () => {
    const seller = await createUser({ role: "seller" });
    const session = await createSession(seller);
    await createVerificationRequest(seller);
    const res = await supertest(app).get("/api/verification/status").set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
  });

  test("returns null when no request exists", async () => {
    const seller = await createUser({ role: "seller" });
    const session = await createSession(seller);
    const res = await supertest(app).get("/api/verification/status").set("Cookie", session.cookies);
    expect(res.status).toBe(200);
    expect(res.body.status).toBeNull();
  });
});

// ── Admin review ──
describe("Admin review", () => {
  let seller, admin, sessionAdmin, sessionSeller;

  beforeEach(async () => {
    seller = await createUser({ role: "seller", sellerTier: "unverified" });
    admin = await createUser({ role: "admin" });
    sessionAdmin = await createSession(admin);
    sessionSeller = await createSession(seller);
  });

  test("approve upgrades seller tier to verified", async () => {
    const req = await createVerificationRequest(seller);
    const res = await supertest(app)
      .post("/api/verification/requests/" + req._id + "/approve")
      .set("Cookie", sessionAdmin.cookies).set(sessionAdmin.csrfHeader);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect((await User.findById(seller._id)).sellerTier).toBe("verified");
  });

  test("reject records the reason", async () => {
    const req = await createVerificationRequest(seller);
    const res = await supertest(app)
      .post("/api/verification/requests/" + req._id + "/reject")
      .set("Cookie", sessionAdmin.cookies).set(sessionAdmin.csrfHeader)
      .send({ reason: "Details do not match records" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.rejectionReason).toBe("Details do not match records");
  });

  test("a non-admin cannot approve (403)", async () => {
    const req = await createVerificationRequest(seller);
    const res = await supertest(app)
      .post("/api/verification/requests/" + req._id + "/approve")
      .set("Cookie", sessionSeller.cookies).set(sessionSeller.csrfHeader);
    expect(res.status).toBe(403);
  });

  test("approve without MFA is rejected (403)", async () => {
    const noMfaSession = await createSession(admin, { mfaVerified: false });
    const req = await createVerificationRequest(seller);
    const res = await supertest(app)
      .post("/api/verification/requests/" + req._id + "/approve")
      .set("Cookie", noMfaSession.cookies).set(noMfaSession.csrfHeader);
    expect(res.status).toBe(403);
  });
});

// ── Tier gate enforcement ──
describe("Tier gate enforcement", () => {
  test("listing limit enforced for unverified sellers", async () => {
    const { createCategory } = await import("../helpers/fixtures");
    const seller = await createUser({ role: "seller", sellerTier: "unverified" });
    const session = await createSession(seller);
    const category = await createCategory();

    for (let i = 0; i < 3; i++) {
      const res = await supertest(app)
        .post("/api/listings")
        .set("Cookie", session.cookies).set(session.csrfHeader)
        .send({ title: "Listing " + i, priceMinorUnits: 1000, category: String(category._id) });
      expect(res.status).toBe(201);
    }

    const res = await supertest(app)
      .post("/api/listings")
      .set("Cookie", session.cookies).set(session.csrfHeader)
      .send({ title: "Too many", priceMinorUnits: 1000, category: String(category._id) });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/limit/i);
  });

  test("escrow hold duration varies by tier", async () => {
    const { HOLD_DURATION_MS } = await import("../../src/services/escrow.service");
    expect(HOLD_DURATION_MS.trusted).toBeLessThan(HOLD_DURATION_MS.verified);
    expect(HOLD_DURATION_MS.verified).toBeLessThan(HOLD_DURATION_MS.unverified);
  });
});
