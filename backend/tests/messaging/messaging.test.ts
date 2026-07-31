import request from "supertest";
import { createApp } from "../../src/app";
import { ConversationModel } from "../../src/models/conversation.model";
import { MessageModel } from "../../src/models/message.model";
import { createUser, createSession, createListing } from "../helpers/fixtures";

const app = createApp();

describe("buyer–seller messaging", () => {
  let buyer, seller, listing, buyerSession, sellerSession;

  beforeEach(async () => {
    buyer = await createUser({ role: "buyer" });
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    listing = await createListing(seller, { status: "active" });
    buyerSession = await createSession(buyer, { mfaVerified: true });
    sellerSession = await createSession(seller, { mfaVerified: true });
  });

  function startThread(session = buyerSession, body = "Is this still available?") {
    return request(app).post("/api/conversations").set("Cookie", session.cookies).set(session.csrfHeader).send({ listingId: String(listing._id), body });
  }

  it("lets a buyer open a thread about a listing with a first message", async () => {
    const res = await startThread();
    expect(res.status).toBe(201);
    expect(res.body.message.body).toBe("Is this still available?");
    expect(await ConversationModel.countDocuments({})).toBe(1);
    expect(await MessageModel.countDocuments({})).toBe(1);
  });

  it("reuses the same thread when the buyer messages the same listing again", async () => {
    await startThread(buyerSession, "first");
    await startThread(buyerSession, "second");
    expect(await ConversationModel.countDocuments({})).toBe(1);
    expect(await MessageModel.countDocuments({})).toBe(2);
  });

  it("forbids a seller messaging about their own listing (400)", async () => {
    const res = await startThread(sellerSession);
    expect(res.status).toBe(400);
  });

  it("lets the seller reply and both parties read the thread", async () => {
    const start = await startThread();
    const convoId = start.body.conversation.id;

    const reply = await request(app).post(`/api/conversations/${convoId}/messages`).set("Cookie", sellerSession.cookies).set(sellerSession.csrfHeader).send({ body: "Yes it is!" });
    expect(reply.status).toBe(201);

    const buyerView = await request(app).get(`/api/conversations/${convoId}/messages`).set("Cookie", buyerSession.cookies);
    expect(buyerView.status).toBe(200);
    expect(buyerView.body.messages).toHaveLength(2);
  });

  it("does not let a non-participant read a conversation (404-parity)", async () => {
    const start = await startThread();
    const convoId = start.body.conversation.id;

    const stranger = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });
    const res = await request(app).get(`/api/conversations/${convoId}/messages`).set("Cookie", stranger.cookies);
    expect(res.status).toBe(404);
  });

  it("does not let a non-participant send into a conversation (404-parity)", async () => {
    const start = await startThread();
    const convoId = start.body.conversation.id;

    const stranger = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });
    const res = await request(app).post(`/api/conversations/${convoId}/messages`).set("Cookie", stranger.cookies).set(stranger.csrfHeader).send({ body: "let me in" });
    expect(res.status).toBe(404);
  });

  it("lists only the requester's own conversations", async () => {
    await startThread();
    const stranger = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });
    const res = await request(app).get("/api/conversations").set("Cookie", stranger.cookies);
    expect(res.body.conversations).toHaveLength(0);

    const mine = await request(app).get("/api/conversations").set("Cookie", buyerSession.cookies);
    expect(mine.body.conversations).toHaveLength(1);
  });

  it("lets a participant report a message for moderation", async () => {
    const start = await startThread();
    const convoId = start.body.conversation.id;
    const messageId = start.body.message.id;

    // Seller reports the buyer's message.
    const res = await request(app).post(`/api/conversations/${convoId}/messages/${messageId}/report`).set("Cookie", sellerSession.cookies).set(sellerSession.csrfHeader).send();
    expect(res.status).toBe(200);
    expect(res.body.reported).toBe(true);
    expect((await MessageModel.findById(messageId))!.reportedAt).toBeTruthy();
  });

  it("rejects an empty message body (400)", async () => {
    const res = await request(app).post("/api/conversations").set("Cookie", buyerSession.cookies).set(buyerSession.csrfHeader).send({ listingId: String(listing._id), body: "   " });
    expect(res.status).toBe(400);
  });

  it("blocks messaging from an unverified email (403)", async () => {
    const unverified = await createUser({ role: "buyer", emailVerified: false });
    const s = await createSession(unverified, { mfaVerified: true });
    const res = await request(app).post("/api/conversations").set("Cookie", s.cookies).set(s.csrfHeader).send({ listingId: String(listing._id), body: "hi" });
    expect(res.status).toBe(403);
  });
});
