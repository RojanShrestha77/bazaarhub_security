import request from "supertest";

// Mock the mail service so we can assert which order notification the
// resolve-dispute ROUTE sends. Regression test for a route-level bug: the
// handler compared `resolution === "release"` but the enum value is
// "released", so a released resolution fell through to the refunded branch.
jest.mock("../../src/services/mail.service", () => {
  const actual = jest.requireActual("../../src/services/mail.service");
  return {
    ...actual,
    sendOrderReleasedNotification: jest.fn(),
    sendOrderRefundedNotification: jest.fn(),
  };
});

import { createApp } from "../../src/app";
import { createUser, createSession, createListing, createOrder } from "../helpers/fixtures";
import * as mail from "../../src/services/mail.service";
import { OrderModel } from "../../src/models/order.model";

const app = createApp();

describe("resolve-dispute route notifications", () => {
  it("sends a RELEASED notification (never a refunded one) when resolution is 'released'", async () => {
    (mail.sendOrderReleasedNotification as jest.Mock).mockClear();
    (mail.sendOrderRefundedNotification as jest.Mock).mockClear();

    const buyer = await createUser({ role: "buyer" });
    const seller = await createUser({ role: "seller", sellerTier: "trusted" });
    const admin = await createUser({ role: "admin" });
    const listing = await createListing(seller, { status: "active" });
    const order = await createOrder(buyer, seller, listing, { status: "disputed" });

    const { cookies, csrfHeader } = await createSession(admin, { mfaVerified: true });

    const res = await request(app)
      .post(`/api/escrow/orders/${order._id}/resolve-dispute`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .send({ resolution: "released" });

    expect(res.status).toBe(200);

    const updated = await OrderModel.findById(order._id);
    expect(updated!.status).toBe("released");

    // let fire-and-forget notifications land
    await new Promise((r) => setTimeout(r, 30));

    // A released resolution must NOT send a refunded notification.
    expect(mail.sendOrderRefundedNotification as jest.Mock).not.toHaveBeenCalled();
    // It must send the released notification.
    expect(mail.sendOrderReleasedNotification as jest.Mock).toHaveBeenCalled();
  });
});
