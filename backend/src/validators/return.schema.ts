import { z } from "zod";

export const returnRequestSchema = z
  .object({
    orderId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid order ID"),
    reason: z.string().trim().min(1, "A reason is required").max(1000),
  })
  .strict();

export type ReturnRequestDto = z.infer<typeof returnRequestSchema>;
