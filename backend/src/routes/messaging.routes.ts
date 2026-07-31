import { createAuthzRouter } from "../lib/authzRouter";
import { requireSession } from "../middlewares/authz";
import { requireEmailVerified } from "../middlewares/session";
import { requireCsrfToken } from "../lib/csrf";
import { messagingReadLimiter, messagingWriteLimiter } from "../middlewares/rate-limiters";
import { validateBody, validateObjectIdParam } from "../middlewares/validate";
import { conversationStartSchema, messageSendSchema } from "../validators/messaging.schema";
import { MessagingController } from "../controllers/messaging.controller";

const router = createAuthzRouter();
const messaging = new MessagingController();

// Sending requires a verified email (spam/harassment reduction), the same gate
// used for checkout/selling. Reading only requires a session. Participant
// authorization is enforced in the service, not by trusting any path id.
router.get("/", [requireSession], messagingReadLimiter, messaging.listConversations);

router.post("/", [requireSession], requireEmailVerified, requireCsrfToken, messagingWriteLimiter, validateBody(conversationStartSchema), messaging.start);

router.get("/:id/messages", [requireSession], messagingReadLimiter, validateObjectIdParam("id"), messaging.listMessages);

router.post("/:id/messages", [requireSession], requireEmailVerified, requireCsrfToken, messagingWriteLimiter, validateObjectIdParam("id"), validateBody(messageSendSchema), messaging.reply);

router.post("/:id/messages/:messageId/report", [requireSession], requireCsrfToken, messagingWriteLimiter, validateObjectIdParam("id"), validateObjectIdParam("messageId"), messaging.report);

export default router;
