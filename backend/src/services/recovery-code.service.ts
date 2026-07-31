import crypto from "node:crypto";
import mongoose from "mongoose";
import { RecoveryCodeModel, IRecoveryCode } from "../models/recovery-code.model";
import { hashPassword, verifyPassword } from "./password.service";

const CODE_COUNT = 10;

function formatCode(): string {
  const raw = crypto.randomBytes(5).toString("hex");
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

// Decision #5: regeneration invalidates the WHOLE old set. Returns the
// plaintext codes so the caller can show them once; only argon2id hashes
// are persisted.
export async function generateRecoveryCodes(userId: mongoose.Types.ObjectId): Promise<string[]> {
  await RecoveryCodeModel.deleteMany({ userId });

  const plainCodes: string[] = [];
  const docs: Array<{ userId: mongoose.Types.ObjectId; codeHash: string }> = [];
  for (let i = 0; i < CODE_COUNT; i++) {
    const plain = formatCode();
    const codeHash = await hashPassword(plain);
    plainCodes.push(plain);
    docs.push({ userId, codeHash });
  }
  await RecoveryCodeModel.insertMany(docs);

  return plainCodes;
}

// argon2id's per-call random salt means codes can't be looked up by hash
// equality, so identifying the matching document needs a read-only verify
// pass first. The STATE CHANGE is still exactly one atomic findOneAndUpdate
// keyed on {_id, used:false} — that's what closes the TOCTOU race.
export async function consumeRecoveryCode(
  userId: mongoose.Types.ObjectId,
  plaintextCode: string,
): Promise<IRecoveryCode | null> {
  const candidates = await RecoveryCodeModel.find({ userId, used: false });

  let matched: IRecoveryCode | null = null;
  for (const candidate of candidates) {
    if (await verifyPassword(candidate.codeHash, plaintextCode)) {
      matched = candidate;
      break;
    }
  }

  if (!matched) return null;

  return RecoveryCodeModel.findOneAndUpdate(
    { _id: matched._id, used: false },
    { $set: { used: true, usedAt: new Date() } },
    { new: true },
  );
}
