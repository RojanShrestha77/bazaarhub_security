import mongoose from "mongoose";
import { MONGODB_URI } from "../configs";
import { logger } from "../lib/logger";

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info("Connected to MongoDB");
  } catch (e) {
    logger.error("MongoDB connection error", { error: (e as Error).message });
    process.exit(1);
  }
};
