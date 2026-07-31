// Listing image upload — same hardening as avatar upload (sniff real bytes,
// cap size, server-generated filenames, no traversal, outside webroot), plus
// every image is re-encoded through sharp, which strips EXIF/IPTC/XMP. Seller
// phone photos commonly embed GPS coordinates — a location leak specific to a
// marketplace with in-person pickup.
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import multer from "multer";
import sharp, { FormatEnum } from "sharp";
import { fromBuffer as fileTypeFromBuffer } from "file-type";
import { Request, Response, NextFunction } from "express";

export const UPLOAD_DIR = path.resolve(process.cwd(), "var", "uploads", "listings");
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_LISTING = 6;

const EXT_BY_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_LISTING } });
const imagesField = upload.array("images", MAX_IMAGES_PER_LISTING);

async function detectMime(buffer: Buffer): Promise<string | null> {
  const detected = await fileTypeFromBuffer(buffer);
  return detected ? detected.mime : null;
}

export function receiveListingImages(req: Request, res: Response, next: NextFunction) {
  imagesField(req, res, (err: unknown) => {
    if (err) {
      const code = (err as { code?: string }).code;
      if (code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "An image exceeds the maximum allowed size" });
      }
      if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ error: `A listing can have at most ${MAX_IMAGES_PER_LISTING} images` });
      }
      return res.status(400).json({ error: "Invalid upload" });
    }
    next();
  });
}

// req.listing must already be set (route resolves it via requireOwnership
// before this runs) — enforces the per-listing cap across multiple requests.
export async function validateAndStoreListingImages(req: Request, res: Response, next: NextFunction) {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return res.status(400).json({ error: "At least one image is required" });
    }

    const existingCount = req.listing!.images.length;
    if (existingCount + files.length > MAX_IMAGES_PER_LISTING) {
      return res.status(400).json({
        error: `A listing can have at most ${MAX_IMAGES_PER_LISTING} images (${existingCount} already uploaded)`,
      });
    }

    // Sniff every file BEFORE writing any — all-or-nothing batch.
    const mimes: string[] = [];
    for (const file of files) {
      const mime = await detectMime(file.buffer);
      if (!mime || !(mime in EXT_BY_MIME)) {
        return res.status(400).json({ error: "Unsupported or unrecognized image type" });
      }
      mimes.push(mime);
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const filenames: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const ext = EXT_BY_MIME[mimes[i]];
      // rotate() auto-orients from EXIF before it's stripped; resize caps
      // dimensions (decompression-bomb defense); no metadata is retained.
      const reencoded = await sharp(files[i].buffer)
        .rotate()
        .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
        .toFormat((ext === "jpg" ? "jpeg" : ext) as keyof FormatEnum)
        .toBuffer();

      const filename = `${req.listing!._id}-${crypto.randomUUID()}.${ext}`;
      const destPath = path.join(UPLOAD_DIR, filename);

      if (!destPath.startsWith(UPLOAD_DIR + path.sep)) {
        return res.status(400).json({ error: "Invalid upload target" });
      }

      await fs.writeFile(destPath, reencoded);
      filenames.push(filename);
    }

    req.uploadedImageFilenames = filenames;
    next();
  } catch (err) {
    next(err);
  }
}

export function resolveListingImagePath(filename?: string | null): string | null {
  if (!filename) return null;
  const resolved = path.join(UPLOAD_DIR, filename);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) return null;
  return resolved;
}
