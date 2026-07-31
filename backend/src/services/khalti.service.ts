import { KHALTI_SECRET_KEY, KHALTI_BASE_URL, FRONTEND_URL } from "../configs";

// Khalti e-payment integration (Nepali gateway), adapted from the HardwareHub
// reference. Amounts are in paisa — our order.totalMinorUnits already is.
// The buyer is redirected to payment_url; on return we verify by pidx.

export class KhaltiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KhaltiError";
  }
}

interface InitiateArgs {
  orderId: string;
  amountPaisa: number;
  purchaseName: string;
  customerName: string;
  customerPhone: string;
}

export async function initiateKhaltiPayment(args: InitiateArgs): Promise<{ pidx: string; payment_url: string }> {
  if (!KHALTI_SECRET_KEY) throw new KhaltiError("Khalti is not configured (KHALTI_SECRET_KEY missing)");

  const res = await fetch(`${KHALTI_BASE_URL}/epayment/initiate/`, {
    method: "POST",
    headers: { Authorization: `Key ${KHALTI_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      return_url: `${FRONTEND_URL}/payment/verify`,
      website_url: FRONTEND_URL,
      amount: args.amountPaisa,
      purchase_order_id: args.orderId,
      purchase_order_name: args.purchaseName,
      customer_info: { name: args.customerName || "BazaarHub Buyer", phone: args.customerPhone || "9800000000", email: "" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new KhaltiError(`Khalti initiate failed: ${err}`);
  }
  const data = (await res.json()) as { pidx: string; payment_url: string };
  return { pidx: data.pidx, payment_url: data.payment_url };
}

// Looks up a payment by pidx. Returns the Khalti status ("Completed",
// "Pending", "Expired", …) and the order id it was created for.
export async function lookupKhaltiPayment(pidx: string): Promise<{ status: string; purchaseOrderId: string }> {
  if (!KHALTI_SECRET_KEY) throw new KhaltiError("Khalti is not configured");

  const res = await fetch(`${KHALTI_BASE_URL}/epayment/lookup/`, {
    method: "POST",
    headers: { Authorization: `Key ${KHALTI_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pidx }),
  });
  if (!res.ok) throw new KhaltiError("Khalti lookup failed");
  const data = (await res.json()) as { status: string; purchase_order_id: string };
  return { status: data.status, purchaseOrderId: data.purchase_order_id };
}
