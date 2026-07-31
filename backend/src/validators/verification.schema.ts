import { z } from "zod";
import { ID_TYPES } from "../models/verification-request.model";

export const rejectVerificationSchema = z.object({
  reason: z.string().min(1, "Rejection reason is required").max(500, "Rejection reason too long"),
});

// Seller KYC  (replaces document upload for this build).
export const verificationSubmitSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required").max(120),
    idType: z.enum(ID_TYPES),
    idNumber: z.string().trim().min(1, "ID number is required").max(60),
    businessName: z.string().trim().max(120).optional(),
    phone: z.string().trim().min(1, "Phone is required").max(20),
    address: z.string().trim().min(1, "Address is required").max(200),
  })
  .strict();

export type RejectVerificationDto = z.infer<typeof rejectVerificationSchema>;
export type VerificationSubmitDto = z.infer<typeof verificationSubmitSchema>;
