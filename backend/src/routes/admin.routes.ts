import { createAuthzRouter } from "../lib/authzRouter";
import { requireRole, requireMfaVerified } from "../middlewares/authz";
import { requireCsrfToken } from "../lib/csrf";
import { adminActionLimiter } from "../middlewares/rate-limiters";
import { validateBody, validateObjectIdParam } from "../middlewares/validate";
import { roleChangeSchema, tierChangeSchema, payoutSchema } from "../validators/admin.schema";
import { AdminController } from "../controllers/admin.controller";

const router = createAuthzRouter();
const admin = new AdminController();

// Admin actions require an MFA-verified session, not just the admin role —
// requireRole("admin") alone would let a stolen pre-MFA admin session reach
// these routes.
const ADMIN_MFA = [requireRole("admin"), requireMfaVerified];

router.get("/users", ADMIN_MFA, adminActionLimiter, admin.list);

// Seller applications — self-service requests an admin grants or denies.
// Approving is the only self-service path to the seller role and is still
// admin-gated + MFA-verified + CSRF.
router.get("/seller-applications", ADMIN_MFA, adminActionLimiter, admin.listSellerApplications);
router.post("/seller-applications/:id/approve", ADMIN_MFA, requireCsrfToken, adminActionLimiter, validateObjectIdParam("id"), admin.approveSellerApplication);
router.post("/seller-applications/:id/reject", ADMIN_MFA, requireCsrfToken, adminActionLimiter, validateObjectIdParam("id"), admin.rejectSellerApplication);

// Seller payouts — record a disbursement, or read a seller's payout summary.
router.get("/sellers/:id/payouts", ADMIN_MFA, adminActionLimiter, validateObjectIdParam("id"), admin.sellerPayoutSummary);
router.post("/sellers/:id/payouts", ADMIN_MFA, requireCsrfToken, adminActionLimiter, validateObjectIdParam("id"), validateBody(payoutSchema), admin.recordSellerPayout);

router.patch("/users/:id/role", ADMIN_MFA, requireCsrfToken, adminActionLimiter, validateObjectIdParam("id"), validateBody(roleChangeSchema), admin.changeRole);
router.patch("/users/:id/tier", ADMIN_MFA, requireCsrfToken, adminActionLimiter, validateObjectIdParam("id"), validateBody(tierChangeSchema), admin.changeTier);

export default router;
