import { Types } from "mongoose";
import { ConversationModel, IConversation } from "../models/conversation.model";
import { MessageModel, IMessage } from "../models/message.model";
import { ListingModel } from "../models/listing.model";
import { notifyUser } from "./notification.service";

type IdLike = Types.ObjectId | string;

export class ListingNotFoundError extends Error {
  constructor() {
    super("Listing not found");
    this.name = "ListingNotFoundError";
  }
}
export class CannotMessageSelfError extends Error {
  constructor() {
    super("You cannot start a conversation about your own listing");
    this.name = "CannotMessageSelfError";
  }
}
// Thrown for both "doesn't exist" and "you're not a participant" — the caller
// maps it to 404 so a non-participant can't probe which conversation ids exist.
export class ConversationNotFoundError extends Error {
  constructor() {
    super("Conversation not found");
    this.name = "ConversationNotFoundError";
  }
}
export class MessageNotFoundError extends Error {
  constructor() {
    super("Message not found");
    this.name = "MessageNotFoundError";
  }
}

// Buyer starts (or re-opens) a thread with the seller of a listing. The buyer
// is the initiator; the seller is resolved server-side from the listing, never
// taken from the client.
export async function startOrGetConversation(listingId: IdLike, buyerId: IdLike): Promise<IConversation> {
  const listing = await ListingModel.findById(listingId).select("_id sellerId");
  if (!listing) throw new ListingNotFoundError();
  if (String(listing.sellerId) === String(buyerId)) throw new CannotMessageSelfError();

  return ConversationModel.findOneAndUpdate(
    { buyerId, sellerId: listing.sellerId, listingId: listing._id },
    { $setOnInsert: { buyerId, sellerId: listing.sellerId, listingId: listing._id, lastMessageAt: new Date() } },
    { new: true, upsert: true },
  );
}

// Loads a conversation only if the requester is one of its two participants.
async function requireParticipantConversation(conversationId: IdLike, userId: IdLike): Promise<IConversation> {
  const convo = await ConversationModel.findById(conversationId);
  if (!convo) throw new ConversationNotFoundError();
  if (String(convo.buyerId) !== String(userId) && String(convo.sellerId) !== String(userId)) {
    throw new ConversationNotFoundError(); // 404-parity: never reveal a foreign thread
  }
  return convo;
}

export async function listConversationsForUser(userId: IdLike): Promise<IConversation[]> {
  return ConversationModel.find({ $or: [{ buyerId: userId }, { sellerId: userId }] }).sort({ lastMessageAt: -1 });
}

export async function sendMessage(conversationId: IdLike, senderId: IdLike, body: string): Promise<IMessage> {
  const convo = await requireParticipantConversation(conversationId, senderId);
  const message = await MessageModel.create({ conversationId: convo._id, senderId, body });
  await ConversationModel.updateOne({ _id: convo._id }, { $set: { lastMessageAt: message.createdAt } });
  // Notify the OTHER participant of the new message.
  const recipient = String(convo.buyerId) === String(senderId) ? convo.sellerId : convo.buyerId;
  notifyUser(recipient, { type: "message", title: "New message", body: body.length > 80 ? `${body.slice(0, 80)}…` : body, link: "/messages" });
  return message;
}

export async function getMessages(conversationId: IdLike, userId: IdLike): Promise<IMessage[]> {
  const convo = await requireParticipantConversation(conversationId, userId);
  return MessageModel.find({ conversationId: convo._id }).sort({ createdAt: 1 });
}

// Flag a message for moderation. Only a participant of the message's own
// conversation may report it, and never their own message.
export async function reportMessage(conversationId: IdLike, messageId: IdLike, userId: IdLike): Promise<IMessage> {
  const convo = await requireParticipantConversation(conversationId, userId);
  const message = await MessageModel.findOne({ _id: messageId, conversationId: convo._id });
  if (!message) throw new MessageNotFoundError();
  if (!message.reportedAt) {
    message.reportedAt = new Date();
    await message.save();
  }
  return message;
}
