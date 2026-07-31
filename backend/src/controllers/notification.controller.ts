import { Request, Response, NextFunction } from "express";
import { listNotifications, unreadCount, markRead, markAllRead } from "../services/notification.service";
import { INotification } from "../models/notification.model";

function serialize(n: INotification) {
  return { id: n._id, type: n.type, title: n.title, body: n.body, link: n.link, read: Boolean(n.readAt), createdAt: n.createdAt };
}

export class NotificationController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const unreadOnly = req.query.unread === "true";
      const [notifications, unread] = await Promise.all([
        listNotifications(req.user!._id, unreadOnly),
        unreadCount(req.user!._id),
      ]);
      return res.status(200).json({ notifications: notifications.map(serialize), unreadCount: unread });
    } catch (err) {
      next(err);
    }
  };

  markRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await markRead(req.user!._id, req.params.id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  };

  markAllRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await markAllRead(req.user!._id);
      return res.status(200).json({ ok: true, marked: count });
    } catch (err) {
      next(err);
    }
  };
}
