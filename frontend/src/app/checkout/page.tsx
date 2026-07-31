"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield, ChevronLeft, CreditCard, Package } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Cart, CheckoutResult } from "@/types";
import { formatPrice } from "@/types";
import toast from "react-hot-toast";

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"review" | "processing" | "done">("review");
  const [orders, setOrders] = useState<CheckoutResult[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "khalti">("cod");

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    api.get<Cart>("/cart").then(setCart).catch(() => router.push("/cart")).finally(() => setLoading(false));
  }, [user, router]);

  if (!user) return null;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading...</span></div></div>;

  const availableItems = cart?.items.filter((i) => i.available) || [];
  const totalMinorUnits = availableItems.reduce((sum, i) => sum + (i.lineTotalMinorUnits || 0), 0);

  const handleCheckout = async () => {
    setSubmitting(true);
    setStep("processing");
    try {
      const results: CheckoutResult[] = [];
      for (const item of availableItems) {
        const result = await api.post<CheckoutResult>("/escrow/checkout", { listingId: item.listingId, quantity: item.quantity, paymentMethod });
        results.push(result);
      }

      if (paymentMethod === "khalti") {
        // Redirect to Khalti to pay for the first order. (Multi-item Khalti
        // carts are paid one order at a time.)
        const payable = results.find((r) => r.paymentUrl);
        if (payable?.paymentUrl) {
          window.location.href = payable.paymentUrl;
          return;
        }
        throw new Error("Khalti did not return a payment link");
      }

      // COD — orders are placed immediately.
      window.dispatchEvent(new Event("cart-updated"));
      setOrders(results);
      setStep("done");
      toast.success(`${results.length} order${results.length !== 1 ? "s" : ""} placed!`);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Checkout failed");
      setStep("review");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done") return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"><Package className="w-10 h-10 text-green-600" /></div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Placed!</h1>
      <p className="text-gray-500 mb-2">{orders.length} order{orders.length !== 1 ? "s" : ""} placed successfully.</p>
      <p className="text-xs text-gray-400 mb-8">Cash on delivery — pay when your order arrives. Track it from your Orders page.</p>
      <div className="flex gap-3 justify-center">
        <Link href="/orders" className="bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm">View Orders</Link>
        <Link href="/marketplace" className="border border-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors">Continue Shopping</Link>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/cart" className="text-gray-400 hover:text-gray-600 transition-colors"><ChevronLeft className="w-5 h-5" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          {/* Payment method card */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <CreditCard className="w-5 h-5 text-orange-600" />
              <h2 className="font-semibold text-gray-900">Payment Method</h2>
            </div>
            <div className="space-y-2">
              <button type="button" onClick={() => setPaymentMethod("cod")} className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${paymentMethod === "cod" ? "border-orange-500 bg-orange-50/50" : "border-gray-100 hover:border-gray-200"}`}>
                <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${paymentMethod === "cod" ? "border-orange-600 bg-orange-600 ring-2 ring-orange-200" : "border-gray-300"}`} />
                <div><p className="text-sm font-medium text-gray-900">Cash on Delivery</p><p className="text-xs text-gray-500">Pay in cash when your order is delivered.</p></div>
              </button>
              <button type="button" onClick={() => setPaymentMethod("khalti")} className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${paymentMethod === "khalti" ? "border-red-500 bg-red-50/50" : "border-gray-100 hover:border-gray-200"}`}>
                <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${paymentMethod === "khalti" ? "border-red-600 bg-red-600 ring-2 ring-red-200" : "border-gray-300"}`} />
                <div><p className="text-sm font-medium text-gray-900">Khalti</p><p className="text-xs text-gray-500">Pay online via Khalti. You&apos;ll be redirected to complete payment.</p></div>
              </button>
            </div>
          </div>

          {/* Order items */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-3">Items</h2>
            <div className="space-y-2">
              {availableItems.map((item) => (
                <div key={item.listingId} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0"><span className="text-gray-900 truncate block">{item.title}</span><span className="text-xs text-gray-400">Qty: {item.quantity}</span></div>
                  <span className="font-medium text-gray-900 ml-4">{formatPrice(item.lineTotalMinorUnits || 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Escrow notice */}
          <div className="bg-orange-50 rounded-xl p-4 flex items-start gap-3">
            <Shield className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div><p className="text-sm font-medium text-orange-900">Escrow Protection</p><p className="text-xs text-orange-700 mt-0.5">Your payment is held securely until you confirm delivery. Disputes are mediated within 14 days.</p></div>
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm sticky top-24">
            <h2 className="font-semibold text-gray-900 mb-4">Summary</h2>
            <div className="space-y-2 text-sm">
              {availableItems.map((item) => (
                <div key={item.listingId} className="flex justify-between"><span className="text-gray-500 truncate">{item.title} × {item.quantity}</span><span className="font-medium">{formatPrice(item.lineTotalMinorUnits || 0)}</span></div>
              ))}
            </div>
            <hr className="my-3 border-gray-100" />
            <div className="flex justify-between text-base mb-1"><span className="font-semibold text-gray-900">Total</span><span className="font-bold text-orange-600">{formatPrice(totalMinorUnits)}</span></div>
            <p className="text-xs text-gray-400 mb-4">Including escrow fee</p>
            <button onClick={handleCheckout} disabled={submitting || availableItems.length === 0} className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm">
              {submitting ? "Processing…" : paymentMethod === "cod" ? `Place Order — ${formatPrice(totalMinorUnits)}` : `Pay with Khalti — ${formatPrice(totalMinorUnits)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
