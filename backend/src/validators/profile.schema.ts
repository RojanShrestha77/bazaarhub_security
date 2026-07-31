import { z } from "zod";

// Exactly the user-settable fields on Profile — kept in sync deliberately.
// .strict() rejects unknown keys (role, sellerTier, mfaEnabled bounce as
// 400) — defense in depth on top of those fields not existing on Profile.
export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().max(60).optional(),
    bio: z.string().trim().max(500).optional(),
    location: z.string().trim().max(120).optional(),
  })
  .strict();

export type ProfileUpdateDto = z.infer<typeof profileUpdateSchema>;

// Account deletion re-confirms the current password: an irreversible action
// must not be triggerable by a hijacked session alone.
export const accountDeleteSchema = z.object({ currentPassword: z.string().min(1) }).strict();

export type AccountDeleteDto = z.infer<typeof accountDeleteSchema>;
