import { authenticator } from "otplib";

import {
  generateTotpSecret,
  buildOtpAuthUri,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyAndConsumeTotp,
} from "../../src/services/totp.service";

describe("totpService", () => {
  it("encrypts and decrypts a secret round-trip", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);

    expect(encrypted.keyVersion).toBe(1);
    expect(encrypted.ciphertext).not.toBe(secret);

    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("builds a valid otpauth URI", () => {
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(secret, "user@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(secret);
  });

  it("verifies a genuinely current code and rejects garbage", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);

    const step = verifyAndConsumeTotp(secret, code, null);
    expect(step).not.toBeNull();

    const rejected = verifyAndConsumeTotp(secret, "000000", null);
    expect(rejected).toBeNull();
  });

  it("rejects replay of an already-consumed step", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);

    const firstStep = verifyAndConsumeTotp(secret, code, null);
    expect(firstStep).not.toBeNull();

    // Same code, same step, presented again — must be rejected because
    // lastUsedStep is now firstStep.
    const replay = verifyAndConsumeTotp(secret, code, firstStep);
    expect(replay).toBeNull();
  });

  it("rejects a code for a step at or before lastUsedStep even if numerically valid", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    const step = verifyAndConsumeTotp(secret, code, null);

    // Pretend a LATER step was already consumed (e.g. clock skew replay
    // attempt) — this exact code must still be rejected.
    const replay = verifyAndConsumeTotp(secret, code, step + 5);
    expect(replay).toBeNull();
  });
});
