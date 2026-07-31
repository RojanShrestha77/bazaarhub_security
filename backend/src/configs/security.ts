import argon2 from "argon2";

// ── Argon2id parameters (decision #3) ────────────────────────────────────
// Measured on host (Windows, Node v22), NOT inside the Alpine container —
// re-run tests/bench once Docker is reachable and update. 64 MiB trades
// hash time (~178ms measured) for concurrency safety under the 512m
// container cap; 120 MiB hit the 250ms target but left too little memory
// headroom under concurrent load.
export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

// ── Session (decision #1 / #2) ───────────────────────────────────────────
export const SESSION_COOKIE_NAME = "__Host-bazaarhub-session";
export const SESSION_SLIDING_WINDOW_MS = 30 * 60 * 1000; // 30 min inactivity -> expired
export const SESSION_ABSOLUTE_CAP_MS = 7 * 24 * 60 * 60 * 1000; // 7 days hard cap

// ── Per-account exponential backoff (decision #6) — NOT a hard lock ───────
export const LOGIN_BACKOFF_BASE_MS = 1000;
export const LOGIN_BACKOFF_FACTOR = 2;
export const LOGIN_BACKOFF_MAX_MS = 5 * 60 * 1000;
export const LOGIN_BACKOFF_RESET_AFTER_MS = 60 * 60 * 1000;

// ── TOTP (decision #4) ───────────────────────────────────────────────────
export const TOTP_STEP_SECONDS = 30;
export const TOTP_WINDOW_STEPS = 1; // ±1 step for clock skew
export const TOTP_ISSUER = process.env.TOTP_ISSUER || "BazaarHub";

// ── CSRF (double-submit cookie) ──────────────────────────────────────────
export const CSRF_COOKIE_NAME = "__Host-bazaarhub-csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

// ── Password policy (ASVS V2.1: length over composition) ─────────────────
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_HISTORY_LIMIT = 5; // reuse prevention: last N hashes
