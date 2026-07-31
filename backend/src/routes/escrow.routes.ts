import { createAuthzRouter } from "../lib/authzRouter";
import { requireSession, requireRole, requireMfaVerified } from "../middlewares/authz";
import { requireEmailVerified } from "../middlewares/session";
import { requireCsrfToken } from "../lib/csrf";
import { escrowReadLimiter, escrowWriteLimiter } from "../middlewares/rate-limiters";
import { validateBody, validateObjectIdParam } from "../middlewares/validate";
import { checkoutSchema, resolveDisputeSchema, shipSchema, trackingUpdateSchema, khaltiVerifySchema } from "../validators/escrow.schema";
import { EscrowController } from "../controllers/escrow.controller";

const router = createAuthzRouter();
const escrow = new EscrowController();

router.post("/checkout", [requireSession], requireEmailVerified, requireCsrfToken, escrowWriteLimiter, validateBody(checkoutSchema), escrow.checkout);

// Khalti payment verification after the buyer returns from the gateway.
router.post("/khalti/verify", [requireSession], requireCsrfToken, escrowWriteLimiter, validateBody(khaltiVerifySchema), escrow.verifyKhalti);

router.get("/orders", [requireSession], escrowReadLimiter, escrow.listOrders);

router.get("/orders/:orderId", [requireSession], escrowReadLimiter, validateObjectIdParam("orderId"), escrow.getOrder);

router.get("/orders/:orderId/events", [requireSession], escrowReadLimiter, validateObjectIdParam("orderId"), escrow.getOrderEvents);

router.post("/orders/:orderId/ship", [requireSession, requireRole("seller")], requireCsrfToken, escrowWriteLimiter, validateObjectIdParam("orderId"), validateBody(shipSchema), escrow.markShipped);

router.patch("/orders/:orderId/tracking", [requireSession, requireRole("seller")], requireCsrfToken, escrowWriteLimiter, validateObjectIdParam("orderId"), validateBody(trackingUpdateSchema), escrow.updateTracking);

router.post("/orders/:orderId/confirm-delivery", [requireSession], requireCsrfToken, escrowWriteLimiter, validateObjectIdParam("orderId"), escrow.confirmDelivery);

router.post("/orders/:orderId/dispute", [requireSession], requireCsrfToken, escrowWriteLimiter, validateObjectIdParam("orderId"), escrow.openDispute);

router.post("/orders/:orderId/cancel", [requireSession], requireCsrfToken, escrowWriteLimiter, validateObjectIdParam("orderId"), escrow.cancelOrder);

router.post("/orders/:orderId/resolve-dispute", [requireSession, requireRole("admin"), requireMfaVerified], requireCsrfToken, escrowWriteLimiter, validateObjectIdParam("orderId"), validateBody(resolveDisputeSchema), escrow.resolveDispute);

router.post("/orders/:orderId/release", [requireSession, requireRole("admin"), requireMfaVerified], requireCsrfToken, escrowWriteLimiter, validateObjectIdParam("orderId"), escrow.adminRelease);

export default router;
