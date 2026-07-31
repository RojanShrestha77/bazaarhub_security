import { createAuthzRouter } from "../lib/authzRouter";
import { requireSession } from "../middlewares/authz";
import { requireCsrfToken } from "../lib/csrf";
import { cartReadLimiter, cartWriteLimiter } from "../middlewares/rate-limiters";
import { validateBody, validateObjectIdParam } from "../middlewares/validate";
import { addCartItemSchema, updateCartItemSchema } from "../validators/cart.schema";
import { CartController } from "../controllers/cart.controller";

const router = createAuthzRouter();
const cart = new CartController();

router.get("/", [requireSession], cartReadLimiter, cart.get);
router.post("/items", [requireSession], requireCsrfToken, cartWriteLimiter, validateBody(addCartItemSchema), cart.addItem);
router.patch(
  "/items/:listingId",
  [requireSession],
  requireCsrfToken,
  cartWriteLimiter,
  validateObjectIdParam("listingId"),
  validateBody(updateCartItemSchema),
  cart.updateItem,
);
router.delete("/items/:listingId", [requireSession], requireCsrfToken, cartWriteLimiter, validateObjectIdParam("listingId"), cart.removeItem);
router.post("/checkout", [requireSession], requireCsrfToken, cartWriteLimiter, cart.checkout);

export default router;
