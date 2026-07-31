import argon2 from "argon2";
import { ARGON2_OPTIONS, PASSWORD_HISTORY_LIMIT } from "../configs/security";
import { IUser } from "../models/user.model";

const PASSWORD_EXPIRY_DAYS = 90;

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}

const DUMMY_PASSWORD_PLAINTEXT = "dummy-password-never-compared-to-anything-real";
let dummyHashPromise: Promise<string> | null = null;

export function ensureDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash(DUMMY_PASSWORD_PLAINTEXT, ARGON2_OPTIONS);
  }
  return dummyHashPromise;
}

export async function verifyAgainstDummyHash(plaintext: string): Promise<void> {
  const dummyHash = await ensureDummyHash();
  // Result is always discarded — this exists purely to spend the same
  // argon2id wall-clock/CPU cost as a real verification.
  await argon2.verify(dummyHash, plaintext).catch(() => false);
}

export async function isPasswordReused(user: IUser, newPassword: string): Promise<boolean> {
  for (const hash of user.passwordHistory || []) {
    if (await argon2.verify(hash, newPassword).catch(() => false)) {
      return true;
    }
  }
  return false;
}

export function addToPasswordHistory(user: IUser, passwordHash: string): void {
  const history = user.passwordHistory || [];
  history.push(passwordHash);
  if (history.length > PASSWORD_HISTORY_LIMIT) {
    history.shift();
  }
  user.passwordHistory = history;
}

export function isPasswordExpired(user: IUser): boolean {
  if (!user.passwordChangedAt) return false;
  const elapsed = Date.now() - user.passwordChangedAt.getTime();
  return elapsed > PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}
