"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Package, ChevronRight, Clock, CheckCircle, Truck, AlertTriangle, Ban } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Order } from "@/types";
import { formatPrice } from "@/types";

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  created: { label: "Pending Payment", color: "bg-yellow-50 text-yellow-700 border-yellow-100", icon: Clock },
  payment_held: { label: "Payment Held", color: "bg-blue-50 text-blue-700 border-blue-100", icon: Package },
  shipped: { label: "Shipped", color: "bg-red-50 text-red-700 border-red-100", icon: Truck },
  delivered: { label: "Delivered", color: "bg-green-50 text-green-700 border-green-100", icon: CheckCircle },
  disputed: { label: "Disputed", color: "bg-red-50 text-red-700 border-red-100", icon: AlertTriangle },
  released: { label: "Completed", color: "bg-gray-50 text-gray-700 border-gray-100", icon: CheckCircle },
  refunded: { label: "Refunded", color: "bg-gray-50 text-gray-700 border-gray-100", icon: Ban },
};

export default function OrdersPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    api.get<Order[]>("/escrow/orders").then(setOrders).catch(() => {}).finally(() => setLoading(false));
  }, [user, router]);

  if (!user) return null;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading...</span></div></div>;

  if (orders.length === 0) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <Package className="w-20 h-20 text-gray-200" />
      <h2 className="text-xl font-semibold text-gray-900">No orders yet</h2>
      <p className="text-gray-500">Place your first order from the marketplace.</p>
      <Link href="/marketplace" className="bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm">Browse Marketplace</Link>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
        <p className="text-sm text-gray-500 mt-0.5">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
      </div>
      <div className="space-y-3">
        {orders.map((order, i) => {
          const cfg = statusConfig[order.status] || { label: order.status, color: "bg-gray-50 text-gray-600 border-gray-100", icon: Package };
          const Icon = cfg.icon;
          return (
            <motion.div key={order._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link href={`/orders/${order._id}`} className="block bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md hover:border-orange-100 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-50 to-red-50 rounded-xl flex items-center justify-center flex-shrink-0"><Package className="w-6 h-6 text-orange-400" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{order.listingSnapshot?.title || "Order"}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="font-medium">{formatPrice(order.totalMinorUnits)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${cfg.color}`}><Icon className="w-3 h-3" />{cfg.label}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
