import { z } from "zod";

const messageBody = z.string().trim().min(1, "Message cannot be empty").max(2000);

export const conversationStartSchema = z
  .object({
    listingId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid listing ID"),
    body: messageBody,
  })
  .strict();

export const messageSendSchema = z.object({ body: messageBody }).strict();

export type ConversationStartDto = z.infer<typeof conversationStartSchema>;
export type MessageSendDto = z.infer<typeof messageSendSchema>;
