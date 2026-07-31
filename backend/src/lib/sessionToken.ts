import crypto from "node:crypto";

// Opaque, high-entropy bearer token for the session cookie, hashed before
// it ever touches the DB (see models/session.model.ts). SHA-256 is correct
// here specifically because the input is already uniformly-random,
// machine-generated 256-bit material — this is NOT password hashing, so
// argon2id would be pointless cost for no benefit.
const TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
