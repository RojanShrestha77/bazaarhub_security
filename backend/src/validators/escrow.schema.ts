import { z } from "zod";

export const checkoutSchema = z.object({
  listingId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid listing ID"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  paymentMethod: z.enum(["cod", "khalti", "stripe"]).optional(),
});

export const khaltiVerifySchema = z.object({
  pidx: z.string().min(1, "pidx is required").max(200),
});

export const resolveDisputeSchema = z.object({
  resolution: z.enum(["refunded", "released"]),
});

// Both fields optional — a seller may ship without a tracking number.
export const shipSchema = z
  .object({
    carrier: z.string().trim().max(60).optional(),
    trackingNumber: z.string().trim().max(100).optional(),
  })
  .strict();

// Tracking update requires at least one field to change.
export const trackingUpdateSchema = shipSchema.refine(
  (o) => o.carrier !== undefined || o.trackingNumber !== undefined,
  { message: "Provide a carrier or tracking number" },
);

export type CheckoutDto = z.infer<typeof checkoutSchema>;
export type ResolveDisputeDto = z.infer<typeof resolveDisputeSchema>;
export type ShipDto = z.infer<typeof shipSchema>;
export type KhaltiVerifyDto = z.infer<typeof khaltiVerifySchema>;
