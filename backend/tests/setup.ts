import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Real Mongo semantics (TTL indexes, atomic findOneAndUpdate) matter for
// several tests — an in-memory JS mock would silently pass tests a real race
// would fail. mongodb-memory-server runs an actual mongod binary, so tests
// don't require `docker compose up`.

// Fixed test key for TOTP secret encryption (decision #4), set here so it's
// consistent across all files in the --runInBand worker regardless of order.
process.env.TOTP_ENCRYPTION_KEY_V1 = Buffer.alloc(32, 7).toString("base64");
process.env.TOTP_KEY_VERSION = "1";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-value-at-least-32-chars";

let mongod: MongoMemoryServer;

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
