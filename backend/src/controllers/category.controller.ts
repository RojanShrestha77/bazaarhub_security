import { Request, Response, NextFunction } from "express";
import { CategoryModel } from "../models/category.model";

export class CategoryController {
  // Categories are seeded, never user-created — no POST/PATCH/DELETE exists.
  list = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await CategoryModel.find().sort({ name: 1 });
      return res.status(200).json(categories.map((c) => ({ id: c._id, name: c.name, slug: c.slug, parentId: c.parentId })));
    } catch (err) {
      next(err);
    }
  };
}
