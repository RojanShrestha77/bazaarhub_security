import { z } from "zod";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const title = z.string().trim().min(1).max(120);
const description = z.string().trim().max(4000).optional();
const priceMinorUnits = z.coerce.number().int().min(0);
const category = z.string().regex(OBJECT_ID, "Invalid category id");
const quantity = z.coerce.number().int().min(1);
const status = z.enum(["draft", "active", "sold", "withdrawn"]);

export const listingCreateSchema = z
  .object({ title, description, priceMinorUnits, category, quantity: quantity.optional() })
  .strict();

// At least one field — an empty PATCH body isn't a meaningful request.
export const listingUpdateSchema = z
  .object({
    title: title.optional(),
    description,
    priceMinorUnits: priceMinorUnits.optional(),
    category: category.optional(),
    quantity: quantity.optional(),
    status: status.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: "No fields to update" });

// Every field is a plain string/number type — no z.any()/z.record() — which
// is what makes NoSQL operator injection (?category[$gt]=) fail validation
// rather than reach a Mongo filter (qs parses that into an object; none of
// these accept an object). limit capped here AND clamped in the service.
export const searchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(120).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

export type ListingCreateDto = z.infer<typeof listingCreateSchema>;
export type ListingUpdateDto = z.infer<typeof listingUpdateSchema>;
export type SearchQueryDto = z.infer<typeof searchQuerySchema>;
