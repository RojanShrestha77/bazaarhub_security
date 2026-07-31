import Stripe from "stripe";
import { createAuthzRouter } from "../lib/authzRouter";
import { PUBLIC } from "../middlewares/authz";
import { webhookLimiter } from "../middlewares/rate-limiters";
import * as escrowService from "../services/escrow.service";
import * as stripeService from "../services/stripe.service";

const router = createAuthzRouter();

// Signature-verified Stripe webhook. Mounted with express.raw() in app.ts so
// the raw body is available for signature verification (express.json would
// consume it). PUBLIC because Stripe can't present a session — the signature
// IS the authentication here.
router.post("/", [PUBLIC], webhookLimiter, async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(401).json({ error: "Missing stripe-signature header" });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: "Webhook secret not configured" });

  let event: Stripe.Event;
  try {
    event = stripeService.constructEvent(req.body, Array.isArray(sig) ? sig[0] : sig, secret);
  } catch (err) {
    return res.status(401).json({ error: `Webhook signature verification failed: ${(err as Error).message}` });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      await escrowService.handlePaymentSucceeded(pi.id, event.id);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
