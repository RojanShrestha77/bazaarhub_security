import { z } from "zod";

// Mirrors the enums on the User  exactly — zod is the outer gate, the
// schema enum is the inner one; neither alone is sufficient.
export const roleChangeSchema = z.object({ role: z.enum(["buyer", "seller", "admin"]) }).strict();

export const tierChangeSchema = z.object({ sellerTier: z.enum(["unverified", "verified", "trusted"]) }).strict();

export const payoutSchema = z
  .object({
    amountMinorUnits: z.coerce.number().int().min(1, "Amount must be a positive integer"),
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export type RoleChangeDto = z.infer<typeof roleChangeSchema>;
export type TierChangeDto = z.infer<typeof tierChangeSchema>;
export type PayoutDto = z.infer<typeof payoutSchema>;
