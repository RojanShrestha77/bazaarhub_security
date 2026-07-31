import request from "supertest";
import { createApp } from "../../src/app";
import { AddressModel } from "../../src/models/address.model";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

const VALID = {
  recipientName: "Ram Bahadur",
  phone: "9800000000",
  line1: "Ward 5, Baneshwor",
  city: "Kathmandu",
  district: "Kathmandu",
  province: "Bagmati",
  postalCode: "44600",
};

describe("address book", () => {
  let user, cookies, csrfHeader;

  beforeEach(async () => {
    user = await createUser({ role: "buyer" });
    ({ cookies, csrfHeader } = await createSession(user, { mfaVerified: true }));
  });

  const post = (body) => request(app).post("/api/addresses").set("Cookie", cookies).set(csrfHeader).send(body);

  it("creates an address and lists it back", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(res.body.recipientName).toBe("Ram Bahadur");

    const list = await request(app).get("/api/addresses").set("Cookie", cookies);
    expect(list.body.addresses).toHaveLength(1);
  });

  it("makes the first saved address the default automatically", async () => {
    const res = await post(VALID);
    expect(res.body.isDefault).toBe(true);
  });

  it("keeps at most one default when a new default is set", async () => {
    await post(VALID); // first -> default
    const second = await post({ ...VALID, isDefault: true });
    expect(second.body.isDefault).toBe(true);

    const defaults = await AddressModel.countDocuments({ userId: user._id, isDefault: true });
    expect(defaults).toBe(1);
  });

  it("updates an address the user owns", async () => {
    const created = await post(VALID);
    const res = await request(app)
      .patch(`/api/addresses/${created.body.id}`)
      .set("Cookie", cookies).set(csrfHeader)
      .send({ city: "Lalitpur" });
    expect(res.status).toBe(200);
    expect(res.body.city).toBe("Lalitpur");
  });

  it("deletes an address and promotes a remaining one to default", async () => {
    const first = await post(VALID); // default
    await post({ ...VALID, recipientName: "Sita" }); // non-default

    const del = await request(app).delete(`/api/addresses/${first.body.id}`).set("Cookie", cookies).set(csrfHeader).send();
    expect(del.status).toBe(204);

    const remaining = await AddressModel.find({ userId: user._id });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isDefault).toBe(true); // promoted
  });

  it("cannot read, update, or delete another user's address (404-parity, no IDOR)", async () => {
    const created = await post(VALID);
    const attacker = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });

    const list = await request(app).get("/api/addresses").set("Cookie", attacker.cookies);
    expect(list.body.addresses).toHaveLength(0);

    const upd = await request(app).patch(`/api/addresses/${created.body.id}`).set("Cookie", attacker.cookies).set(attacker.csrfHeader).send({ city: "Hacked" });
    expect(upd.status).toBe(404);

    const del = await request(app).delete(`/api/addresses/${created.body.id}`).set("Cookie", attacker.cookies).set(attacker.csrfHeader).send();
    expect(del.status).toBe(404);

    // original is untouched
    expect((await AddressModel.findById(created.body.id))!.city).toBe("Kathmandu");
  });

  it("rejects a create missing required fields (400)", async () => {
    const res = await post({ phone: "9800000000" });
    expect(res.status).toBe(400);
  });

  it("rejects an empty update payload (400)", async () => {
    const created = await post(VALID);
    const res = await request(app).patch(`/api/addresses/${created.body.id}`).set("Cookie", cookies).set(csrfHeader).send({});
    expect(res.status).toBe(400);
  });

  it("requires a session", async () => {
    const res = await request(app).get("/api/addresses");
    expect(res.status).toBe(401);
  });
});
