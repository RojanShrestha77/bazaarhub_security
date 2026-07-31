import fs from "node:fs";
import path from "node:path";
import request from "supertest";

import { createApp } from "../../src/app";
import { ProfileModel as Profile } from "../../src/models/profile.model";
import { UPLOAD_DIR, MAX_AVATAR_BYTES } from "../../src/middlewares/avatar-upload";
import { createUser, createSession } from "../helpers/fixtures";

const app = createApp();

// Minimal well-formed 1x1 PNG (real magic bytes) — file-type sniffs this
// correctly as image/png regardless of what Content-Type/filename a
// request claims.
const REAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

afterAll(() => {
  // Test-created files aren't Mongo state, so tests/setup.js's afterEach
  // collection-clear doesn't touch them — clean up what this file wrote.
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const entry of fs.readdirSync(UPLOAD_DIR)) {
      fs.unlinkSync(path.join(UPLOAD_DIR, entry));
    }
  }
});

describe("avatar upload — content sniffing", () => {
  it("accepts a real PNG and stores it under a server-generated filename", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user);

    const res = await request(app)
      .post("/api/profiles/me/avatar")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("avatar", REAL_PNG, { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.hasAvatar).toBe(true);

    const profile = await Profile.findOne({ userId: user._id });
    expect(profile.avatarPath).toMatch(new RegExp(`^${user._id}-[0-9a-f-]+\\.png$`));
    expect(fs.existsSync(path.join(UPLOAD_DIR, profile.avatarPath))).toBe(true);
  });

  it("rejects a plain-text file that claims an image Content-Type and a .png filename", async () => {
    // Not a webshell/exploit payload — deliberately just inert bytes that
    // don't match any image magic number, so the point of the test (byte
    // sniffing beats a spoofed Content-Type/filename) doesn't need
    // anything that looks like malicious content on disk.
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user);

    const notAnImage = Buffer.from("this is a plain text file pretending to be a PNG");

    const res = await request(app)
      .post("/api/profiles/me/avatar")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("avatar", notAnImage, { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(400);

    const profile = await Profile.findOne({ userId: user._id });
    expect(profile?.avatarPath ?? null).toBeNull();
  });

  it("rejects a file over the size cap", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user);

    const oversized = Buffer.concat([REAL_PNG, Buffer.alloc(MAX_AVATAR_BYTES + 1)]);

    const res = await request(app)
      .post("/api/profiles/me/avatar")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("avatar", oversized, { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(413);
  });

  it("ignores a path-traversal filename entirely — storage path is always server-generated", async () => {
    const user = await createUser();
    const { cookies, csrfHeader } = await createSession(user);

    const res = await request(app)
      .post("/api/profiles/me/avatar")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("avatar", REAL_PNG, { filename: "../../../../etc/passwd", contentType: "image/png" });

    expect(res.status).toBe(200);

    const profile = await Profile.findOne({ userId: user._id });
    expect(profile.avatarPath).not.toMatch(/\.\./);
    expect(profile.avatarPath).toMatch(new RegExp(`^${user._id}-[0-9a-f-]+\\.png$`));

    const resolved = path.resolve(UPLOAD_DIR, profile.avatarPath);
    expect(resolved.startsWith(UPLOAD_DIR)).toBe(true);
  });
});

describe("avatar retrieval", () => {
  it("another authenticated user can view a public avatar via GET /:id/avatar", async () => {
    const owner = await createUser();
    const { cookies, csrfHeader } = await createSession(owner);
    await request(app)
      .post("/api/profiles/me/avatar")
      .set("Cookie", cookies)
      .set(csrfHeader)
      .attach("avatar", REAL_PNG, { filename: "avatar.png", contentType: "image/png" });

    const viewer = await createUser();
    const { cookie: viewerCookie } = await createSession(viewer);

    const res = await request(app).get(`/api/profiles/${owner._id}/avatar`).set("Cookie", viewerCookie);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
  });

  it("returns 404 when no avatar has been set", async () => {
    const user = await createUser();
    const { cookie } = await createSession(user);

    const res = await request(app).get("/api/profiles/me/avatar").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });
});
