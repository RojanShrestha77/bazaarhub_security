"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Trash2, ShoppingCart, Minus, Plus, ArrowLeft, Shield } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Cart } from "@/types";
import { formatPrice } from "@/types";
import toast from "react-hot-toast";

export default function CartPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    api.get<Cart>("/cart").then(setCart).catch(() => setCart(null)).finally(() => setLoading(false));
  }, [user, router]);

  const fetchCart = async () => {
    try { setCart(await api.get<Cart>("/cart")); window.dispatchEvent(new Event("cart-updated")); } catch { setCart(null); }
  };

  const updateQty = async (listingId: string, qty: number) => {
    if (qty < 1) return;
    try { await api.patch(`/cart/items/${listingId}`, { quantity: qty }); await fetchCart(); }
    catch { toast.error("Failed to update"); }
  };

  const removeItem = async (listingId: string) => {
    try { await api.delete(`/cart/items/${listingId}`); await fetchCart(); toast.success("Removed"); }
    catch { toast.error("Failed to remove"); }
  };

  if (!user) return null;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading...</span></div></div>;

  const availableItems = cart?.items.filter((i) => i.available) || [];
  const unavailableItems = cart?.items.filter((i) => !i.available) || [];

  if (!cart || (availableItems.length === 0 && unavailableItems.length === 0)) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <ShoppingCart className="w-20 h-20 text-gray-200" />
      <h2 className="text-xl font-semibold text-gray-900">Your cart is empty</h2>
      <p className="text-gray-500">Add items from the marketplace to get started.</p>
      <Link href="/marketplace" className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm">Browse Marketplace</Link>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shopping Cart</h1>
          <p className="text-sm text-gray-500 mt-0.5">{availableItems.length} item{availableItems.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/marketplace" className="text-sm text-orange-600 hover:text-orange-700 font-medium inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Continue Shopping</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-3">
          {unavailableItems.map((item) => (
            <div key={item.listingId} className="bg-red-50 rounded-xl border border-red-100 p-4 flex items-center gap-4">
              <div className="w-14 h-14 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0"><ShoppingCart className="w-6 h-6 text-red-300" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-red-800 text-sm truncate">{item.title || "Unavailable item"}</p>
                <p className="text-xs text-red-600 mt-0.5">{item.reason || "No longer available"}</p>
              </div>
              <button onClick={() => removeItem(item.listingId)} className="p-1.5 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}

          {availableItems.map((item) => (
            <motion.div key={item.listingId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4 shadow-sm">
              <Link href={`/listings/${item.listingId}`} className="w-16 h-16 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-100">
                {item.image ? (
                  <img src={`${API_BASE}/listings/${item.listingId}/images/${item.image}`} alt={item.title || ""} className="w-full h-full object-cover" />
                ) : (
                  <ShoppingCart className="w-7 h-7 text-orange-300" />
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/listings/${item.listingId}`} className="font-medium text-gray-900 hover:text-orange-600 transition-colors text-sm truncate block">{item.title}</Link>
                <p className="text-xs text-gray-400 mt-0.5">{item.unitPriceMinorUnits !== undefined ? formatPrice(item.unitPriceMinorUnits) : ""} each</p>
              </div>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => updateQty(item.listingId, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors" disabled={item.quantity <= 1}><Minus className="w-3 h-3" /></button>
                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                <button onClick={() => updateQty(item.listingId, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"><Plus className="w-3 h-3" /></button>
              </div>
              <div className="text-right min-w-[80px]">
                <p className="font-semibold text-gray-900 text-sm">{item.lineTotalMinorUnits !== undefined ? formatPrice(item.lineTotalMinorUnits) : ""}</p>
              </div>
              <button onClick={() => removeItem(item.listingId)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
            </motion.div>
          ))}
        </div>

        {/* Summary sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm sticky top-24">
            <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-medium">{formatPrice(cart?.totalMinorUnits || 0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Shipping</span><span className="font-medium text-green-600">Free</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Escrow Fee</span><span className="text-gray-400">Included</span></div>
              <hr className="border-gray-100" />
              <div className="flex justify-between text-base"><span className="font-semibold text-gray-900">Total</span><span className="font-bold text-orange-600">{formatPrice(cart?.totalMinorUnits || 0)}</span></div>
            </div>
            <Link href="/checkout" className="mt-5 block w-full bg-orange-600 text-white text-center py-3 rounded-xl font-semibold hover:bg-orange-700 transition-all active:scale-[0.98] shadow-sm">
              Proceed to Checkout
            </Link>
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-400 justify-center">
              <Shield className="w-3.5 h-3.5 text-orange-400" />
              <span>Escrow protected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
