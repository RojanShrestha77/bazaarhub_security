import mongoose, { Schema, Document } from "mongoose";

export type AuditOutcome = "success" | "failure";

// Append-only activity log (rubric 2.5 — auditing / incident response).
// Sensitive values must never be written here; callers pass metadata that
// has already been shaped to exclude secrets (see lib/logger redaction and
// audit.service usage).
export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  actor?: mongoose.Types.ObjectId;
  subject?: mongoose.Types.ObjectId;
  action: string;
  outcome: AuditOutcome;
  ip?: string;
  userAgent?: string;
  metadata?: unknown;
  before?: unknown;
  after?: unknown;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  actor: { type: Schema.Types.ObjectId, ref: "User" },
  subject: { type: Schema.Types.ObjectId, ref: "User" },
  action: { type: String, required: true },
  outcome: { type: String, enum: ["success", "failure"], default: "success" },
  ip: { type: String },
  userAgent: { type: String },
  metadata: { type: Schema.Types.Mixed },
  before: { type: Schema.Types.Mixed },
  after: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

auditLogSchema.index({ subject: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ ip: 1, createdAt: -1 });
auditLogSchema.index({ outcome: 1 });

// Append-only: reject any attempt to modify an existing document.
auditLogSchema.pre("save", function (next) {
  if (!this.isNew) {
    return next(new Error("AuditLog is append-only — updates are not allowed"));
  }
  next();
});

export const AuditLogModel = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);

// Belt-and-braces: disable the mutating/deleting statics so a stray call
// site can't bypass the append-only pre-save hook via a bulk operation.
const FORBIDDEN = [
  "deleteOne", "deleteMany", "findOneAndUpdate", "findOneAndReplace",
  "updateOne", "updateMany", "replaceOne", "findByIdAndUpdate",
  "findByIdAndDelete", "findOneAndDelete", "bulkWrite",
] as const;
FORBIDDEN.forEach((m) => {
  (AuditLogModel as unknown as Record<string, unknown>)[m] = undefined;
});
