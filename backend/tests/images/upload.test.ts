import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import sharp from "sharp";

import { createApp } from "../../src/app";
import { ListingModel as Listing } from "../../src/models/listing.model";
import { UPLOAD_DIR, MAX_IMAGES_PER_LISTING } from "../../src/middlewares/listing-image-upload";
import { createUser, createSession, createListing } from "../helpers/fixtures";

// Split from a single combined file (was tests/images/listing-images.test.js)
// because listingImageUploadLimiter's budget (10/15min, rateLimiters.js) is
// shared across every test in a file that imports one `app` instance —
// this file alone makes ~10 upload calls to exercise the per-listing cap,
// which would starve a shared retrieval-test file's own uploads. Same
// crosstalk Phase 2's Finding 1 fix ran into; same fix (separate files).
const app = createApp();

async function buildJpegWithGps() {
  return sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 200, g: 0, b: 0 } } })
    .jpeg()
    .withMetadata({
      exif: {
        IFD0: { Make: "TestCam" },
        GPS: {
          GPSLatitude: "27/1 41/1 0/1",
          GPSLatitudeRef: "N",
          GPSLongitude: "85/1 19/1 0/1",
          GPSLongitudeRef: "E",
        },
      },
    })
    .toBuffer();
}

afterAll(() => {
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const entry of fs.readdirSync(UPLOAD_DIR)) {
      fs.unlinkSync(path.join(UPLOAD_DIR, entry));
    }
  }
});

describe("listing image upload — EXIF stripping (privacy)", () => {
  it("strips GPS/EXIF metadata from an uploaded photo", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(seller);
    const jpegWithGps = await buildJpegWithGps();

    // Sanity: the source file really does carry EXIF before upload.
    const sourceMeta = await sharp(jpegWithGps).metadata();
    expect(sourceMeta.exif).toBeDefined();

    const res = await request(app)
      .post(`/api/listings/${listing._id}/images`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("images", jpegWithGps, { filename: "photo.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(1);

    const storedPath = path.join(UPLOAD_DIR, res.body.images[0]);
    const storedMeta = await sharp(storedPath).metadata();
    expect(storedMeta.exif).toBeUndefined();
  });
});

describe("listing image upload — access control and validation", () => {
  it("rejects a non-owner's upload attempt with 404", async () => {
    const seller = await createUser({ role: "seller" });
    const attacker = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(attacker);
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
      .jpeg()
      .toBuffer();

    const res = await request(app)
      .post(`/api/listings/${listing._id}/images`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("images", jpeg, { filename: "a.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(404);
  });

  it("rejects a non-image file regardless of claimed content-type", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(seller);

    const res = await request(app)
      .post(`/api/listings/${listing._id}/images`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("images", Buffer.from("not an image"), { filename: "a.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
  });

  it("enforces the per-listing image cap across multiple requests", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(seller);
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "blue" } })
      .jpeg()
      .toBuffer();

    for (let i = 0; i < MAX_IMAGES_PER_LISTING; i++) {
      const res = await request(app)
        .post(`/api/listings/${listing._id}/images`)
        .set("Cookie", cookies)
        .set(csrfHeader)
        .attach("images", jpeg, { filename: `${i}.jpg`, contentType: "image/jpeg" });
      expect(res.status).toBe(200);
    }

    const overCap = await request(app)
      .post(`/api/listings/${listing._id}/images`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("images", jpeg, { filename: "one-too-many.jpg", contentType: "image/jpeg" });

    expect(overCap.status).toBe(400);

    const reloaded = await Listing.findById(listing._id);
    expect(reloaded.images).toHaveLength(MAX_IMAGES_PER_LISTING);
  });

  it("path-traversal filename in the multipart field has no effect on storage path", async () => {
    const seller = await createUser({ role: "seller" });
    const listing = await createListing(seller);
    const { cookies, csrfHeader } = await createSession(seller);
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "green" } })
      .jpeg()
      .toBuffer();

    const res = await request(app)
      .post(`/api/listings/${listing._id}/images`)
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("images", jpeg, { filename: "../../../../etc/passwd", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body.images[0]).not.toMatch(/\.\./);
    expect(res.body.images[0]).toMatch(new RegExp(`^${listing._id}-[0-9a-f-]+\\.jpg$`));
  });
});
