// Avatar upload: content-type validated by sniffing the actual bytes (never
// the Content-Type header or client filename), size-capped, filename
// entirely server-generated (no path traversal), stored outside anything
// Express serves statically — retrieval is always a dedicated authenticated
// route that streams the file itself.
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import multer from "multer";
import { fromBuffer as fileTypeFromBuffer } from "file-type";
import { Request, Response, NextFunction } from "express";

export const UPLOAD_DIR = path.resolve(process.cwd(), "var", "uploads", "avatars");
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// Memory storage — multer never touches the filesystem, so the write path is
// entirely ours to control (not multer's client-influenced default).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });
const singleAvatarField = upload.single("avatar");

// Sniff the real bytes (magic numbers), never the client's header/filename.
async function detectMime(buffer: Buffer): Promise<string | null> {
  const detected = await fileTypeFromBuffer(buffer);
  return detected ? detected.mime : null;
}

export function receiveAvatarUpload(req: Request, res: Response, next: NextFunction) {
  singleAvatarField(req, res, (err: unknown) => {
    if (err) {
      if ((err as { code?: string }).code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "Avatar exceeds the maximum allowed size" });
      }
      return res.status(400).json({ error: "Invalid upload" });
    }
    next();
  });
}

export async function validateAndStoreAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "avatar file is required" });
    }

    const mime = await detectMime(req.file.buffer);
    if (!mime || !(mime in EXT_BY_MIME)) {
      return res.status(400).json({ error: "Unsupported or unrecognized image type" });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    // Filename entirely server-generated: owner id + random UUID + sniffed ext.
    const filename = `${req.user!._id}-${crypto.randomUUID()}.${EXT_BY_MIME[mime]}`;
    const destPath = path.join(UPLOAD_DIR, filename);

    // Defense in depth: can't traverse by construction, re-verify anyway.
    if (!destPath.startsWith(UPLOAD_DIR + path.sep)) {
      return res.status(400).json({ error: "Invalid upload target" });
    }

    await fs.writeFile(destPath, req.file.buffer);

    req.avatarFilename = filename;
    req.avatarMime = mime;
    next();
  } catch (err) {
    next(err);
  }
}

// Resolves a stored filename to a safe on-disk path, or null if it would
// escape UPLOAD_DIR.
export function resolveAvatarPath(filename?: string | null): string | null {
  if (!filename) return null;
  const resolved = path.join(UPLOAD_DIR, filename);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) return null;
  return resolved;
}
