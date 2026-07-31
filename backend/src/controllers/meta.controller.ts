import { Request, Response } from "express";
import mongoose from "mongoose";

export class MetaController {
  health = (_req: Request, res: Response) => {
    const dbState = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.json({ status: "ok", service: "bazaarhub-api", db: dbState });
  };

  root = (_req: Request, res: Response) => {
    res.json({ message: "BazaarHub API" });
  };
}
