import { createAuthzRouter } from "../lib/authzRouter";
import { requireSession } from "../middlewares/authz";
import { requireCsrfToken } from "../lib/csrf";
import { profileReadLimiter, profileWriteLimiter } from "../middlewares/rate-limiters";
import { validateBody, validateObjectIdParam } from "../middlewares/validate";
import { addressCreateSchema, addressUpdateSchema } from "../validators/address.schema";
import { AddressController } from "../controllers/address.controller";

const router = createAuthzRouter();
const address = new AddressController();

// Every route is private to the session user. The userId comes from req.user,
// and write/delete queries are scoped to {_id, userId}, so a foreign address id
// yields 404 — no IDOR and no id-existence oracle.
router.get("/", [requireSession], profileReadLimiter, address.list);
router.post("/", [requireSession], requireCsrfToken, profileWriteLimiter, validateBody(addressCreateSchema), address.create);
router.patch("/:id", [requireSession], requireCsrfToken, profileWriteLimiter, validateObjectIdParam("id"), validateBody(addressUpdateSchema), address.update);
router.delete("/:id", [requireSession], requireCsrfToken, profileWriteLimiter, validateObjectIdParam("id"), address.remove);

export default router;
