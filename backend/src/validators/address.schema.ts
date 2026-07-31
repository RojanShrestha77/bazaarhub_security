import { z } from "zod";

const fields = {
  label: z.string().trim().max(40).optional(),
  recipientName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(1).max(20),
  line1: z.string().trim().min(1).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1).max(60),
  district: z.string().trim().max(60).optional(),
  province: z.string().trim().max(60).optional(),
  postalCode: z.string().trim().max(12).optional(),
  isDefault: z.boolean().optional(),
};

export const addressCreateSchema = z.object(fields).strict();

// Update: every field optional, but reject an empty payload so a no-op PATCH
// is a clear 400 rather than a silent success.
export const addressUpdateSchema = z
  .object({
    label: fields.label,
    recipientName: fields.recipientName.optional(),
    phone: fields.phone.optional(),
    line1: fields.line1.optional(),
    line2: fields.line2,
    city: fields.city.optional(),
    district: fields.district,
    province: fields.province,
    postalCode: fields.postalCode,
    isDefault: fields.isDefault,
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "No fields to update" });

export type AddressCreateDto = z.infer<typeof addressCreateSchema>;
export type AddressUpdateDto = z.infer<typeof addressUpdateSchema>;
