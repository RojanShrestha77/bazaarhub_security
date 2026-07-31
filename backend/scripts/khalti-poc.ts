// Proof-of-concept for "Insufficient Payment Amount Verification in Khalti
// Payment Confirmation". Runs the REAL confirmKhaltiPayment from
// escrow.service.ts, with lookupKhaltiPayment monkey-patched to simulate
// Khalti reporting "Completed" — exactly what the real function returns
// today (status + purchase_order_id only, no amount). No real Khalti API
// call is made; this isolates and proves the app-side logic gap.
// Temporary — delete after running (not part of the app).
import "dotenv/config";
import mongoose from "mongoose";
import { MONGODB_URI } from "../src/configs";
import * as khaltiService from "../src/services/khalti.service";
import { OrderModel } from "../src/models/order.model";

const ORDER_ID = process.argv[2];

async function run() {
  await mongoose.connect(MONGODB_URI);

  const before = await OrderModel.findById(ORDER_ID);
  console.log("BEFORE — order status:", before!.status, "| totalMinorUnits:", before!.totalMinorUnits);

  // Monkey-patch the real module's export. Both this script and
  // escrow.service.ts require() the same cached module instance (CommonJS),
  // so this changes what confirmKhaltiPayment actually calls.
  (khaltiService as unknown as { lookupKhaltiPayment: unknown }).lookupKhaltiPayment = async (_pidx: string) => {
    console.log(">>> Simulated Khalti API response: { status: 'Completed', purchase_order_id: '" + ORDER_ID + "' } — no amount field, because the real code never asks for one.");
    return { status: "Completed", purchaseOrderId: ORDER_ID };
  };

  // Import AFTER the patch so escrow.service.ts's own require("./khalti.service")
  // resolves to the already-patched module object.
  const { confirmKhaltiPayment } = require("../src/services/escrow.service");

  const result = await confirmKhaltiPayment(before!.khaltiPidx, before!.buyerId);
  console.log("\nconfirmKhaltiPayment() returned:", { paid: result.paid, status: result.status, orderStatus: result.order.status });

  const after = await OrderModel.findById(ORDER_ID);
  console.log("\nAFTER — order status:", after!.status, "| totalMinorUnits:", after!.totalMinorUnits);
  console.log("\n>>> Order was marked fully paid for its full original amount, purely because status === 'Completed'.");
  console.log(">>> At no point was any paid amount checked against totalMinorUnits — because the code never asks Khalti for one.");

  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
