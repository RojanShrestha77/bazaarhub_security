import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Real Mongo semantics (TTL indexes, atomic findOneAndUpdate) matter for
// several of these tests — an in-memory JS mock would silently pass tests
// that a real race condition would fail. mongodb-memory-server runs an
// actual mongod binary, just not the docker-compose one, so tests don't
// require `docker compose up` to run.

// Fixed test key for TOTP secret encryption (decision #4) — set here, not
// ad-hoc inside individual test files. process.env is a single global
// object shared across all test files within the same --runInBand worker
// process (unlike Jest's per-file module registry), so setting it inside
// one test file would leak into others AND depend on file execution
// order. setupFilesAfterEnv runs fresh before every file's tests, so this
// is set consistently regardless of which file runs first.
process.env.TOTP_ENCRYPTION_KEY_V1 = Buffer.alloc(32, 7).toString("base64");
process.env.TOTP_KEY_VERSION = "1";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});
