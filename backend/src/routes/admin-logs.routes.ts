import { createAuthzRouter } from "../lib/authzRouter";
import { requireSession, requireRole, requireMfaVerified } from "../middlewares/authz";
import { adminActionLimiter } from "../middlewares/rate-limiters";
import { AdminLogsController } from "../controllers/admin-logs.controller";

const router = createAuthzRouter();
const logs = new AdminLogsController();
const ADMIN_MFA = [requireSession, requireRole("admin"), requireMfaVerified];

router.get("/logs", ADMIN_MFA, adminActionLimiter, logs.list);
router.get("/logs/stats", ADMIN_MFA, adminActionLimiter, logs.stats);

export default router;
