import mongoose, { Schema, Document } from "mongoose";

// A single message within a conversation. senderId is always one of the two
// conversation participants (enforced in the service). reportedAt flags a
// message for moderation without deleting it.
export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  body: string;
  reportedAt?: Date;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>({
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
  senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  reportedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ conversationId: 1, createdAt: 1 });

export const MessageModel = mongoose.model<IMessage>("Message", messageSchema);
