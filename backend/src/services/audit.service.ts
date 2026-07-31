import { Types } from "mongoose";
import { AuditLogModel, IAuditLog, AuditOutcome } from "../models/audit-log.model";
import { runDetectionRules } from "./monitor.service";

interface LogEventArgs {
  actor?: Types.ObjectId;
  subject?: Types.ObjectId;
  action: string;
  outcome?: AuditOutcome;
  ip?: string;
  userAgent?: string;
  metadata?: unknown;
  before?: unknown;
  after?: unknown;
}

export async function logEvent({
  actor,
  subject,
  action,
  outcome = "success",
  ip,
  userAgent,
  metadata,
  before,
  after,
}: LogEventArgs): Promise<IAuditLog> {
  const entry = await AuditLogModel.create({ actor, subject, action, outcome, ip, userAgent, metadata, before, after });
  runDetectionRules(entry).catch(() => {});
  return entry;
}

interface LogAuthzFailureArgs {
  actor?: Types.ObjectId;
  action: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuthzFailure({ actor, action, ip, userAgent, metadata }: LogAuthzFailureArgs): Promise<IAuditLog> {
  return logEvent({
    actor,
    action,
    outcome: "failure",
    ip,
    userAgent,
    metadata: { ...metadata, reason: "authorization_failure" },
  });
}
