import { createAuthzRouter } from "../lib/authzRouter";
import { requireSession } from "../middlewares/authz";
import { requireCsrfToken } from "../lib/csrf";
import { escrowReadLimiter, escrowWriteLimiter } from "../middlewares/rate-limiters";
import { validateBody, validateObjectIdParam } from "../middlewares/validate";
import { returnRequestSchema } from "../validators/return.schema";
import { ReturnController } from "../controllers/return.controller";

const router = createAuthzRouter();
const returns = new ReturnController();

// Buyers open returns; sellers/admins resolve them. Fine-grained authorization
// (is this your return? are you an admin?) is enforced in the service with
// 404-parity, not by a coarse route gate.
router.get("/", [requireSession], escrowReadLimiter, returns.list);
router.post("/", [requireSession], requireCsrfToken, escrowWriteLimiter, validateBody(returnRequestSchema), returns.request);
router.post("/:id/approve", [requireSession], requireCsrfToken, escrowWriteLimiter, validateObjectIdParam("id"), returns.approve);
router.post("/:id/reject", [requireSession], requireCsrfToken, escrowWriteLimiter, validateObjectIdParam("id"), returns.reject);

export default router;
