import { createAuthzRouter } from "../lib/authzRouter";
import { requireSession } from "../middlewares/authz";
import { requireCsrfToken } from "../lib/csrf";
import { cartReadLimiter, cartWriteLimiter } from "../middlewares/rate-limiters";
import { validateObjectIdParam } from "../middlewares/validate";
import { WishlistController } from "../controllers/wishlist.controller";

const router = createAuthzRouter();
const wishlist = new WishlistController();

// All wishlist routes are private to the session user — the userId always comes
// from req.user, never from the path/body, so there's no IDOR surface here.
router.get("/", [requireSession], cartReadLimiter, wishlist.list);
router.put("/:listingId", [requireSession], requireCsrfToken, cartWriteLimiter, validateObjectIdParam("listingId"), wishlist.add);
router.delete("/:listingId", [requireSession], requireCsrfToken, cartWriteLimiter, validateObjectIdParam("listingId"), wishlist.remove);

export default router;
