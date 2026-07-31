import { z } from "zod";

export const reviewCreateSchema = z
  .object({
    rating: z.coerce.number().int().min(1, "Rating must be 1–5").max(5, "Rating must be 1–5"),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict();

export type ReviewCreateDto = z.infer<typeof reviewCreateSchema>;
