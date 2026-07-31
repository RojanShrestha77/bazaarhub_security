import mongoose, { Schema, Document } from "mongoose";
import { UserRole, SellerTier, SellerApplicationStatus, TotpSecret, LoginFailure } from "../types/user.type";

// TOTP secret is never stored in plaintext (decision #4) — AES-256-GCM
// ciphertext + IV + auth tag, encrypted/decrypted by the service layer
// using TOTP_ENCRYPTION_KEY_V{keyVersion}. keyVersion lets the key rotate
// without forcing mass MFA re-enrolment.
const totpSecretSchema = new Schema<TotpSecret>(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: Number, required: true },
  },
  { _id: false },
);

// Per-account exponential backoff state (decision #6). This is NOT a binary
// lock — a hard lock is an attacker-triggerable DoS button against a seller.
const loginFailureSchema = new Schema<LoginFailure>(
  {
    count: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    nextAttemptAllowedAt: { type: Date },
  },
  { _id: false },
);

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  passwordChangedAt?: Date;
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  role: UserRole;
  sellerTier: SellerTier;
  sellerApplicationStatus: SellerApplicationStatus;
  mfaEnabled: boolean;
  totpSecret?: TotpSecret;
  mfaEnrolledAt?: Date;
  totpLastUsedStep?: number;
  loginFailure: LoginFailure;
  passwordHistory: string[];
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },

    // argon2id hash (decision #3) — see services/password.service.ts.
    passwordHash: { type: String, required: true },

    // Set whenever the password changes by EITHER flow (self-service and
    // reset both touch this, but revoke sessions differently).
    passwordChangedAt: { type: Date },

    // Email ownership confirmation. Never client-settable — flipped true only
    // by consuming a verification token (email-verification.service). Sensitive
    // actions (checkout, seller apply, listing create) are gated on this.
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },

    // Mass-assignment targets (threat model, Tampering) — role and tier
    // must NEVER be settable from a request body. Enforced at two layers:
    // (1) zod DTOs whitelist only the allowed fields, (2) every create/
    // update call site builds an explicit field list rather than spreading
    // the request body. Neither layer is optional.
    role: { type: String, enum: ["buyer", "seller", "admin"], default: "buyer" },

    // Seller verification tier — same mass-assignment reasoning as role.
    // Only an admin-only, MFA-verified code path can ever change this.
    sellerTier: { type: String, enum: ["unverified", "verified", "trusted"], default: "unverified" },

    // Seller onboarding request state. A buyer may only ever move this to
    // "pending" (via register intent or POST /seller/apply). "approved" is
    // reachable ONLY through the admin approval code path, which also sets
    // role → "seller". Never settable from a request body.
    sellerApplicationStatus: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },

    mfaEnabled: { type: Boolean, default: false },
    totpSecret: { type: totpSecretSchema, default: undefined },
    mfaEnrolledAt: { type: Date },

    // TOTP replay prevention: absolute step number of the last consumed
    // code. Not secret — just a counter — so no encryption needed.
    totpLastUsedStep: { type: Number },

    loginFailure: { type: loginFailureSchema, default: () => ({}) },

    // Reuse prevention: hashes of the last N passwords, rotated on change.
    passwordHistory: { type: [String], default: [] },

    // Soft-delete / erasure marker. Set when a user deletes their account: PII
    // is scrubbed and the email tombstoned, but the row is retained so orders,
    // escrow events, and audit logs keep referential integrity. A non-null
    // value means the account is closed and can never authenticate again.
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export const UserModel = mongoose.model<IUser>("User", userSchema);
