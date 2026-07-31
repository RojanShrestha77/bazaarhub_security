import request from "supertest";
import { createApp } from "../../src/app";
import { NotificationModel } from "../../src/models/notification.model";
import * as escrowService from "../../src/services/escrow.service";
import * as stripeService from "../../src/services/stripe.service";
import { createUser, createSession, createListing } from "../helpers/fixtures";

const app = createApp();

describe("in-app notifications", () => {
  let user, cookies, csrfHeader;

  beforeEach(async () => {
    user = await createUser({ role: "buyer" });
    ({ cookies, csrfHeader } = await createSession(user, { mfaVerified: true }));
  });

  async function seed(count: number) {
    for (let i = 0; i < count; i++) {
      await NotificationModel.create({ userId: user._id, type: "order_update", title: `N${i}`, body: "x" });
    }
  }

  it("lists notifications with an unread count", async () => {
    await seed(3);
    const res = await request(app).get("/api/notifications").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(3);
    expect(res.body.unreadCount).toBe(3);
    expect(res.body.notifications[0].read).toBe(false);
  });

  it("marks a single notification read", async () => {
    await seed(2);
    const list = await request(app).get("/api/notifications").set("Cookie", cookies);
    const id = list.body.notifications[0].id;
    const res = await request(app).post(`/api/notifications/${id}/read`).set("Cookie", cookies).set(csrfHeader).send();
    expect(res.status).toBe(200);

    const after = await request(app).get("/api/notifications").set("Cookie", cookies);
    expect(after.body.unreadCount).toBe(1);
  });

  it("marks all notifications read", async () => {
    await seed(4);
    const res = await request(app).post("/api/notifications/read-all").set("Cookie", cookies).set(csrfHeader).send();
    expect(res.status).toBe(200);
    expect(res.body.marked).toBe(4);
    const after = await request(app).get("/api/notifications?unread=true").set("Cookie", cookies);
    expect(after.body.notifications).toHaveLength(0);
  });

  it("only returns the requester's own notifications (no IDOR)", async () => {
    await seed(2);
    const other = await createSession(await createUser({ role: "buyer" }), { mfaVerified: true });
    const res = await request(app).get("/api/notifications").set("Cookie", other.cookies);
    expect(res.body.notifications).toHaveLength(0);
    expect(res.body.unreadCount).toBe(0);
  });

  it("requires a session", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("creates an order notification as a side effect of a domain event", async () => {
    stripeService._setStripeInstance({
      paymentIntents: { create: async () => ({ id: `pi_${Date.now()}`, client_secret: "cs" }), capture: async () => ({}), cancel: async () => ({}) },
    });
    const seller = await createUser({ role: "seller", sellerTier: "trusted" });
    const listing = await createListing(seller, { status: "active" });
    const { order } = await escrowService.checkout(listing._id, 1, user._id);

    await escrowService.handlePaymentSucceeded(order.stripePaymentIntentId, "evt_notif_1");
    // notifyUser is fire-and-forget (not awaited), so poll until the async
    // writes flush rather than asserting immediately.
    const waitForCount = async (userId: unknown, want: number) => {
      for (let i = 0; i < 50; i++) {
        if ((await NotificationModel.countDocuments({ userId, type: "order_update" })) >= want) return;
        await new Promise((r) => setTimeout(r, 20));
      }
    };
    // buyer (payment confirmed) + seller (payment received) each get one.
    await waitForCount(user._id, 1);
    await waitForCount(seller._id, 1);
    expect(await NotificationModel.countDocuments({ userId: user._id, type: "order_update" })).toBe(1);
    expect(await NotificationModel.countDocuments({ userId: seller._id, type: "order_update" })).toBe(1);
  });
});
