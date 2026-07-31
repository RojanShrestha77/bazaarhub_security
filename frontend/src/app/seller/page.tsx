"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PlusCircle, Package, FileText, ShoppingBag, Shield, BarChart3, Pencil, Send, CheckCircle, Trash2, Truck, Wallet, TrendingUp } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatPrice } from "@/types";
import toast from "react-hot-toast";

interface SellerAnalytics { grossRevenueMinorUnits: number; pendingRevenueMinorUnits: number; orderCount: number; }
interface PayoutSummary { availableMinorUnits: number; paidOutMinorUnits: number; netEarningsMinorUnits: number; commissionRate: number; }

export default function SellerDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<"listings" | "orders">("listings");
  const [data, setData] = useState<any>(null);
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [payouts, setPayouts] = useState<PayoutSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchSeller = useCallback(async () => {
    try {
      const [listingsRes, orders, analyticsRes, payoutsRes] = await Promise.all([
        api.get<{ listings: any[] }>("/listings/mine").catch(() => ({ listings: [] })),
        api.get<any[]>("/escrow/orders?role=seller").catch(() => []),
        api.get<SellerAnalytics>("/seller/analytics").catch(() => null),
        api.get<{ summary: PayoutSummary }>("/seller/payouts").catch(() => null),
      ]);
      setData({ listings: listingsRes.listings ?? [], orders: Array.isArray(orders) ? orders : [] });
      setAnalytics(analyticsRes);
      setPayouts(payoutsRes?.summary ?? null);
    } catch { setData({ listings: [], orders: [] }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    if (user.role !== "seller") { router.push("/profile"); return; }
    fetchSeller();
  }, [user, router, fetchSeller]);

  const changeStatus = async (id: string, status: string, label: string) => {
    setBusyId(id);
    try {
      await api.patch(`/listings/${id}`, { status });
      toast.success(label);
      await fetchSeller();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Action failed");
    } finally { setBusyId(null); }
  };

  const withdrawListing = async (id: string) => {
    if (!confirm("Withdraw this listing? Buyers will no longer see it.")) return;
    setBusyId(id);
    try {
      await api.delete(`/listings/${id}`);
      toast.success("Listing withdrawn");
      await fetchSeller();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Action failed");
    } finally { setBusyId(null); }
  };

  const markShipped = async (orderId: string) => {
    setBusyId(orderId);
    try {
      await api.post(`/escrow/orders/${orderId}/ship`, {});
      toast.success("Marked as shipped");
      await fetchSeller();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Action failed");
    } finally { setBusyId(null); }
  };

  if (!user) return null;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading...</span></div></div>;
  if (!data) return null;

  const activeListings = data.listings.filter((l: any) => l.status === "active").length;
  const soldListings = data.listings.filter((l: any) => l.status === "sold").length;
  const pendingOrders = data.orders.filter((o: any) => o.status === "payment_held" || o.status === "shipped").length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Seller Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage your listings and orders</p>
          </div>
          <div className="flex gap-3">
            <Link href="/seller/verification" className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
              <Shield className="w-4 h-4" /> Verification
            </Link>
            <Link href="/listings/new" className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-all active:scale-[0.98] shadow-sm text-sm">
              <PlusCircle className="w-4 h-4" /> New Listing
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center"><Package className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-2xl font-bold text-gray-900">{activeListings}</p><p className="text-xs text-gray-500">Active Listings</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-2xl font-bold text-gray-900">{soldListings}</p><p className="text-xs text-gray-500">Sold</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center"><BarChart3 className="w-5 h-5 text-red-600" /></div>
              <div><p className="text-2xl font-bold text-gray-900">{pendingOrders}</p><p className="text-xs text-gray-500">Pending Orders</p></div>
            </div>
          </div>
        </div>

        {/* Revenue & payouts */}
        {(analytics || payouts) && (
          <div className="bg-gradient-to-br from-orange-600 to-red-600 rounded-2xl p-6 shadow-sm mb-6 text-white">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4" />
              <h2 className="font-semibold">Revenue &amp; Payouts</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-orange-100">Released revenue</p>
                <p className="text-xl font-bold mt-0.5">{formatPrice(analytics?.grossRevenueMinorUnits ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-orange-100">In escrow (pending)</p>
                <p className="text-xl font-bold mt-0.5">{formatPrice(analytics?.pendingRevenueMinorUnits ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-orange-100">Available payout</p>
                <p className="text-xl font-bold mt-0.5">{formatPrice(payouts?.availableMinorUnits ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-orange-100 flex items-center gap-1"><Wallet className="w-3 h-3" /> Paid out</p>
                <p className="text-xl font-bold mt-0.5">{formatPrice(payouts?.paidOutMinorUnits ?? 0)}</p>
              </div>
            </div>
            {payouts && <p className="text-[11px] text-orange-200 mt-3">Net of {Math.round(payouts.commissionRate * 100)}% platform commission. Payouts are disbursed by the platform.</p>}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-50 rounded-xl p-1">
          {(["listings", "orders"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? "bg-white text-orange-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {t === "listings" ? <><Package className="w-4 h-4 inline mr-1.5" />My Listings ({data.listings.length})</> : <><FileText className="w-4 h-4 inline mr-1.5" />Orders ({data.orders.length})</>}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "listings" && (data.listings.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Package className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No listings yet</h3>
            <p className="text-sm text-gray-500 mb-6">Create your first listing to start selling.</p>
            <Link href="/listings/new" className="inline-flex items-center gap-2 bg-orange-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors"><PlusCircle className="w-4 h-4" /> Create Listing</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {data.listings.map((l: any) => {
              const id = l.id || l._id;
              const badge: Record<string, string> = { draft: "bg-gray-100 text-gray-600", active: "bg-green-100 text-green-700", sold: "bg-blue-100 text-blue-700", withdrawn: "bg-red-100 text-red-600" };
              const busy = busyId === id;
              return (
                <div key={id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/listings/${id}`} className="flex-1 min-w-0 group">
                      <p className="font-medium text-gray-900 truncate group-hover:text-orange-600 transition-colors">{l.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full capitalize font-medium ${badge[l.status] || "bg-gray-100 text-gray-600"}`}>{l.status}</span>
                        {new Date(l.createdAt).toLocaleDateString()}
                      </p>
                    </Link>
                    <span className="text-sm font-medium text-orange-600 whitespace-nowrap">{l.priceMinorUnits !== undefined ? `NPR ${(l.priceMinorUnits / 100).toLocaleString()}` : ""}</span>
                  </div>
                  {(l.status === "draft" || l.status === "active") && (
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                      <Link href={`/listings/${id}/edit`} className="inline-flex items-center gap-1.5 text-xs border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"><Pencil className="w-3.5 h-3.5" />Edit</Link>
                      {l.status === "draft" && <button disabled={busy} onClick={() => changeStatus(id, "active", "Listing published")} className="inline-flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"><Send className="w-3.5 h-3.5" />Publish</button>}
                      {l.status === "active" && <button disabled={busy} onClick={() => changeStatus(id, "sold", "Marked as sold")} className="inline-flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"><CheckCircle className="w-3.5 h-3.5" />Mark Sold</button>}
                      <button disabled={busy} onClick={() => withdrawListing(id)} className="inline-flex items-center gap-1.5 text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"><Trash2 className="w-3.5 h-3.5" />Withdraw</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {tab === "orders" && (data.orders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <FileText className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500">No orders received yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.orders.map((o: any) => {
              const busy = busyId === o._id;
              return (
                <div key={o._id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/orders/${o._id}`} className="flex-1 min-w-0 group">
                      <p className="font-medium text-gray-900 truncate group-hover:text-orange-600 transition-colors">{o.listingSnapshot?.title || "Order"}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{o.status.replace("_", " ")}</p>
                    </Link>
                    <div className="flex items-center gap-3">
                      {o.status === "payment_held" && <button disabled={busy} onClick={() => markShipped(o._id)} className="inline-flex items-center gap-1.5 text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"><Truck className="w-3.5 h-3.5" />Mark Shipped</button>}
                      <span className="text-sm text-gray-400 whitespace-nowrap">{new Date(o.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
