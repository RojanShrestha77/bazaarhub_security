"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pidx = params.get("pidx");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!pidx) { setState("error"); setMessage("Missing payment reference."); return; }
    api.post<{ orderId: string; paid: boolean; status: string }>("/escrow/khalti/verify", { pidx })
      .then((d) => {
        setOrderId(d.orderId);
        if (d.paid) {
          setState("success");
          window.dispatchEvent(new Event("cart-updated"));
        } else {
          setState("error");
          setMessage(`Payment not completed (status: ${d.status}).`);
        }
      })
      .catch((err) => {
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Could not verify payment.");
      });
  }, [pidx]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-sm bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
        {state === "loading" && (
          <>
            <Loader2 className="w-10 h-10 text-orange-500 mx-auto mb-4 animate-spin" />
            <h1 className="text-xl font-bold text-gray-900">Verifying your payment…</h1>
          </>
        )}
        {state === "success" && (
          <>
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5"><CheckCircle className="w-8 h-8 text-green-500" /></div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Payment successful!</h1>
            <p className="text-sm text-gray-500 mb-6">Your Khalti payment is confirmed and held in escrow until delivery.</p>
            <button onClick={() => router.push(orderId ? `/orders/${orderId}` : "/orders")} className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm">View Order</button>
          </>
        )}
        {state === "error" && (
          <>
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5"><XCircle className="w-8 h-8 text-red-500" /></div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Payment not completed</h1>
            <p className="text-sm text-gray-500 mb-6">{message}</p>
            <Link href="/cart" className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm">Back to Cart</Link>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function PaymentVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>}>
      <VerifyInner />
    </Suspense>
  );
}
