// Health check and root — routed through createAuthzRouter() like every
// other route so the enumeration test has no exemptions to special-case.
import { createAuthzRouter } from "../lib/authzRouter";
import { PUBLIC } from "../middlewares/authz";
import { MetaController } from "../controllers/meta.controller";

const router = createAuthzRouter();
const meta = new MetaController();

router.get("/api/health", PUBLIC, meta.health);
router.get("/", PUBLIC, meta.root);

export default router;
