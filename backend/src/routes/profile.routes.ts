import { createAuthzRouter } from "../lib/authzRouter";
import { requireSession } from "../middlewares/authz";
import { requireCsrfToken } from "../lib/csrf";
import { exportLimiter, profileReadLimiter, profileWriteLimiter, avatarUploadLimiter } from "../middlewares/rate-limiters";
import { validateBody, validateObjectIdParam } from "../middlewares/validate";
import { profileUpdateSchema, accountDeleteSchema } from "../validators/profile.schema";
import { receiveAvatarUpload, validateAndStoreAvatar } from "../middlewares/avatar-upload";
import { ProfileController } from "../controllers/profile.controller";

const router = createAuthzRouter();
const profile = new ProfileController();

// ── Own profile ──
router.get("/me", [requireSession], profileReadLimiter, profile.getMe);
router.patch("/me", [requireSession], requireCsrfToken, profileWriteLimiter, validateBody(profileUpdateSchema), profile.patchMe);
router.post("/me/avatar", [requireSession], requireCsrfToken, avatarUploadLimiter, receiveAvatarUpload, validateAndStoreAvatar, profile.uploadAvatar);
router.get("/me/avatar", [requireSession], profileReadLimiter, profile.getMyAvatar);

// ── Data export / import ──
router.get("/me/export", [requireSession], exportLimiter, profile.exportMe);
router.post("/me/import", [requireSession], requireCsrfToken, profileWriteLimiter, validateBody(profileUpdateSchema), profile.importMe);

// ── Account deletion / erasure (re-confirms password) ──
router.delete("/me", [requireSession], requireCsrfToken, profileWriteLimiter, validateBody(accountDeleteSchema), profile.deleteMe);

// ── Public profile viewing ──
router.get("/:id", [requireSession], profileReadLimiter, validateObjectIdParam("id"), profile.getPublic);
router.get("/:id/avatar", [requireSession], profileReadLimiter, validateObjectIdParam("id"), profile.getPublicAvatar);

export default router;
