import { Request, Response, NextFunction } from "express";
import {
  startOrGetConversation,
  listConversationsForUser,
  sendMessage,
  getMessages,
  reportMessage,
  ListingNotFoundError,
  CannotMessageSelfError,
  ConversationNotFoundError,
  MessageNotFoundError,
  CannotReportOwnMessageError,
} from "../services/messaging.service";
import { logEvent } from "../services/audit.service";
import { ConversationStartDto, MessageSendDto } from "../validators/messaging.schema";

function serializeConversation(c: {
  _id: unknown;
  buyerId: unknown;
  sellerId: unknown;
  listingId: unknown;
  lastMessageAt: Date;
}) {
  return { id: c._id, buyerId: c.buyerId, sellerId: c.sellerId, listingId: c.listingId, lastMessageAt: c.lastMessageAt };
}

function serializeMessage(m: { _id: unknown; senderId: unknown; body: string; reportedAt?: Date; createdAt: Date }) {
  return { id: m._id, senderId: m.senderId, body: m.body, reported: Boolean(m.reportedAt), createdAt: m.createdAt };
}

export class MessagingController {
  private handleError(err: unknown, res: Response, next: NextFunction) {
    if (err instanceof ListingNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof ConversationNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof MessageNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof CannotMessageSelfError) return res.status(400).json({ error: err.message });
    if (err instanceof CannotReportOwnMessageError) return res.status(400).json({ error: err.message });
    next(err);
  }

  start = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { listingId, body } = req.validatedBody as ConversationStartDto;
      const convo = await startOrGetConversation(listingId, req.user!._id);
      const message = await sendMessage(convo._id, req.user!._id, body);
      logEvent({ actor: req.user!._id, action: "message_send", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { conversationId: String(convo._id) } }).catch(() => {});
      return res.status(201).json({ conversation: serializeConversation(convo), message: serializeMessage(message) });
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  listConversations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const convos = await listConversationsForUser(req.user!._id);
      return res.status(200).json({ conversations: convos.map(serializeConversation) });
    } catch (err) {
      next(err);
    }
  };

  listMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const messages = await getMessages(req.params.id, req.user!._id);
      return res.status(200).json({ messages: messages.map(serializeMessage) });
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  reply = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { body } = req.validatedBody as MessageSendDto;
      const message = await sendMessage(req.params.id, req.user!._id, body);
      logEvent({ actor: req.user!._id, action: "message_send", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { conversationId: req.params.id } }).catch(() => {});
      return res.status(201).json(serializeMessage(message));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  report = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const message = await reportMessage(req.params.id, req.params.messageId, req.user!._id);
      logEvent({ actor: req.user!._id, action: "message_report", outcome: "success", ip: req.ip, userAgent: req.get("user-agent"), metadata: { conversationId: req.params.id, messageId: req.params.messageId } }).catch(() => {});
      return res.status(200).json(serializeMessage(message));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };
}
