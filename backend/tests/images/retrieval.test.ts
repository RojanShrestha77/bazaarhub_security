import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import sharp from "sharp";

import { createApp } from "../../src/app";
import { UPLOAD_DIR } from "../../src/middlewares/listing-image-upload";
import { createUser, createSession, createListing } from "../helpers/fixtures";

// Split from tests/images/upload.test.js — separate app instance means a
// separate listingImageUploadLimiter budget, so this file's own (small
// number of) uploads aren't starved by upload.test.js's cap-enforcement
// test making ~10 calls in one file.
const app = createApp();

afterAll(() => {
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const entry of fs.readdirSync(UPLOAD_DIR)) {
      fs.unlinkSync(path.join(UPLOAD_DIR, entry));
    }
  }
});

describe("listing image retrieval", () => {
  it("streams an uploaded image to any authenticated user", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller, { status: "active" });
    const { cookies, csrfHeader } = await createSession(seller);
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "yellow" } })
      .jpeg()
      .toBuffer();

    const upload = await request(app)
      .post(`/api/listings/${listing._id}/images`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("images", jpeg, { filename: "a.jpg", contentType: "image/jpeg" });
    expect(upload.status).toBe(200);

    const viewer = await createUser();
    const { cookie: viewerCookie } = await createSession(viewer);

    const res = await request(app)
      .get(`/api/listings/${listing._id}/images/${upload.body.images[0]}`)
      .set("Cookie", viewerCookie);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/jpeg/);
  });

  it("404s for a filename that isn't actually attached to that listing", async () => {
    const seller = await createUser({ role: "seller" });
    const listingA = await createListing(seller);
    const listingB = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(seller);
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "purple" } })
      .jpeg()
      .toBuffer();

    const upload = await request(app)
      .post(`/api/listings/${listingA._id}/images`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("images", jpeg, { filename: "a.jpg", contentType: "image/jpeg" });
    expect(upload.status).toBe(200);

    const res = await request(app)
      .get(`/api/listings/${listingB._id}/images/${upload.body.images[0]}`)
      .set("Cookie", cookies);

    expect(res.status).toBe(404);
  });

  it("404s for a nonexistent filename", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookie } = await createSession(seller);

    const res = await request(app)
      .get(`/api/listings/${listing._id}/images/${listing._id}-nonexistent.jpg`)
      .set("Cookie", cookie);

    expect(res.status).toBe(404);
  });
});
