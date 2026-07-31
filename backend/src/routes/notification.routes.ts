import { createAuthzRouter } from "../lib/authzRouter";
import { requireSession } from "../middlewares/authz";
import { requireCsrfToken } from "../lib/csrf";
import { profileReadLimiter, profileWriteLimiter } from "../middlewares/rate-limiters";
import { validateObjectIdParam } from "../middlewares/validate";
import { NotificationController } from "../controllers/notification.controller";

const router = createAuthzRouter();
const notifications = new NotificationController();

// Private to the session user — every query is scoped to req.user, no IDOR.
router.get("/", [requireSession], profileReadLimiter, notifications.list);
router.post("/read-all", [requireSession], requireCsrfToken, profileWriteLimiter, notifications.markAllRead);
router.post("/:id/read", [requireSession], requireCsrfToken, profileWriteLimiter, validateObjectIdParam("id"), notifications.markRead);

export default router;
