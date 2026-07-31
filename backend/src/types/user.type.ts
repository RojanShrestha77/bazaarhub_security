import mongoose from "mongoose";

export type UserRole = "buyer" | "seller" | "admin";
export type SellerTier = "unverified" | "verified" | "trusted";

// Self-service seller onboarding. A buyer can REQUEST seller status
// ("pending"); only an admin can grant it (which flips role → "seller" and
// sets this to "approved"). The field is never client-settable to any value
// other than requesting — same mass-assignment reasoning as role/tier.
export type SellerApplicationStatus = "none" | "pending" | "approved" | "rejected";

// AES-256-GCM envelope for the TOTP secret at rest (decision #4). keyVersion
// lets the encryption key rotate without forcing MFA re-enrolment.
export interface TotpSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

// Per-account exponential backoff state (decision #6). NOT a hard lock.
export interface LoginFailure {
  count: number;
  lastAttemptAt?: Date;
  nextAttemptAllowedAt?: Date;
}
