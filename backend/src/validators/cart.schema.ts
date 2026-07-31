import { z } from "zod";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// Quantity validated for SHAPE here; the business cap (min(10, stock)) is
// enforced in cart.service since it depends on live listing state.
const quantity = z.coerce.number().int().min(1);

export const addCartItemSchema = z
  .object({ listingId: z.string().regex(OBJECT_ID, "Invalid listing id"), quantity })
  .strict();

export const updateCartItemSchema = z.object({ quantity }).strict();

export type AddCartItemDto = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemDto = z.infer<typeof updateCartItemSchema>;
