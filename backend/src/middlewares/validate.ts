import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Validation failed", details: result.error.flatten() });
    }
    req.validatedBody = result.data;
    next();
  };
}

// Query-string equivalent — what actually blocks NoSQL operator injection
// on search/list params: Express's qs parser turns ?category[$gt]= into an
// object, and a zod field typed z.string()/z.coerce.number() fails safeParse
// cleanly on an object input. Services read req.validatedQuery, never
// req.query directly.
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: "Validation failed", details: result.error.flatten() });
    }
    req.validatedQuery = result.data;
    next();
  };
}

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

// Validates the :id SHAPE at the route boundary and responds with the SAME
// 404 body a real "not found" gets, rather than a 400 — collapsing
// "malformed" and "doesn't exist" so neither the shape nor existence of an
// id is observable (reconnaissance parity, same as decision #7).
export function validateObjectIdParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!OBJECT_ID_RE.test(req.params[paramName])) {
      return res.status(404).json({ error: "Not found" });
    }
    next();
  };
}
