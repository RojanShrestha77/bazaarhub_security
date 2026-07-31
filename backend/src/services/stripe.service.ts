import Stripe from "stripe";

// Lazy singleton so importing this module doesn't require STRIPE_SECRET_KEY
// at boot (only payment operations do). Tests inject a mock via
// _setStripeInstance.
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is required for payment operations");
    }
    _stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" } as unknown as Stripe.StripeConfig);
  }
  return _stripe;
}

export function resetStripeInstance(): void {
  _stripe = null;
}

export async function createPaymentIntent(
  amount: number,
  currency: string | undefined,
  metadata: Record<string, string>,
): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.create({
    amount,
    currency: currency || "npr",
    metadata,
    capture_method: "manual",
    automatic_payment_methods: { enabled: true },
  });
}

export async function capturePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.capture(paymentIntentId);
}

export async function cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.cancel(paymentIntentId);
}

export function constructEvent(rawBody: Buffer | string, signature: string, secret: string): Stripe.Event {
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

// Used by tests to inject a mock stripe instance.
export function _setStripeInstance(mock: unknown): void {
  _stripe = mock as Stripe;
}
