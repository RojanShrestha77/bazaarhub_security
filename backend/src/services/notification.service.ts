import { Types } from "mongoose";
import { NotificationModel, INotification, NotificationType } from "../models/notification.model";

type IdLike = Types.ObjectId | string;

interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

// Fire-and-forget creation. Callers MUST NOT await this in a way that can fail
// the triggering action — errors are swallowed and logged, same contract as
// the transactional email helpers.
export function notifyUser(userId: IdLike | null | undefined, input: NotifyInput): void {
  if (!userId) return;
  NotificationModel.create({
    userId,
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    link: input.link,
  }).catch((err: Error) => {
    console.error("notifyUser failed:", err.message);
  });
}

export async function listNotifications(userId: IdLike, unreadOnly = false): Promise<INotification[]> {
  const filter: Record<string, unknown> = { userId };
  if (unreadOnly) filter.readAt = { $exists: false };
  return NotificationModel.find(filter).sort({ createdAt: -1 }).limit(100);
}

export async function unreadCount(userId: IdLike): Promise<number> {
  return NotificationModel.countDocuments({ userId, readAt: { $exists: false } });
}

// Ownership is enforced by scoping the update to {_id, userId} — a foreign id
// simply doesn't match. Returns true if a notification was marked, false if not
// found (already read or not owned).
export async function markRead(userId: IdLike, notificationId: IdLike): Promise<boolean> {
  const res = await NotificationModel.updateOne(
    { _id: notificationId, userId, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  );
  return res.modifiedCount === 1;
}

export async function markAllRead(userId: IdLike): Promise<number> {
  const res = await NotificationModel.updateMany(
    { userId, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  );
  return res.modifiedCount;
}
