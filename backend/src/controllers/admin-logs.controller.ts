import { Request, Response, NextFunction } from "express";
import { AuditLogModel } from "../models/audit-log.model";

export class AdminLogsController {
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { action, actor, subject, outcome, ip, limit = 100, skip = 0, since, until } = req.query;
      const filter: Record<string, unknown> = {};
      if (action) filter.action = action;
      if (actor) filter.actor = actor;
      if (subject) filter.subject = subject;
      if (outcome) filter.outcome = outcome;
      if (ip) filter.ip = ip;
      if (since || until) {
        const createdAt: Record<string, Date> = {};
        if (since) createdAt.$gte = new Date(since as string);
        if (until) createdAt.$lte = new Date(until as string);
        filter.createdAt = createdAt;
      }
      const cappedLimit = Math.min(Number(limit), 1000);
      const [logs, total] = await Promise.all([
        AuditLogModel.find(filter)
          .sort({ createdAt: -1 })
          .skip(Number(skip))
          .limit(cappedLimit)
          .populate("actor", "email role")
          .populate("subject", "email role")
          .lean(),
        AuditLogModel.countDocuments(filter),
      ]);
      return res.status(200).json({ logs, total, skip: Number(skip), limit: cappedLimit });
    } catch (err) {
      next(err);
    }
  };

  stats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const since = req.query.since || new Date(Date.now() - 86400000);
      const stats = await AuditLogModel.aggregate([
        { $match: { createdAt: { $gte: new Date(since as string) } } },
        { $group: { _id: { action: "$action", outcome: "$outcome" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
      return res.status(200).json({ since, stats });
    } catch (err) {
      next(err);
    }
  };
}
