import { createAuthzRouter } from "../lib/authzRouter";
import { PUBLIC } from "../middlewares/authz";
import { CategoryController } from "../controllers/category.controller";

const router = createAuthzRouter();
const category = new CategoryController();

// Browsing is open marketplace metadata, so PUBLIC like the health check.
router.get("/", PUBLIC, category.list);

export default router;
