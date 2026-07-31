"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { RotateCcw, Check, X, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ReturnRequest } from "@/types";

const statusStyle: Record<ReturnRequest["status"], string> = {
  requested: "bg-yellow-50 text-yellow-700 border-yellow-100",
  approved: "bg-green-50 text-green-700 border-green-100",
  rejected: "bg-gray-50 text-gray-600 border-gray-100",
};

export default function ReturnsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.get<{ returns: ReturnRequest[] }>("/returns").then((d) => setReturns(d.returns)).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    load();
  }, [user, authLoading, router]);

  const resolve = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    try {
      await api.post(`/returns/${id}/${action}`);
      toast.success(action === "approve" ? "Return approved and refunded" : "Return rejected");
      await load();
    } catch {
      toast.error("Could not update return");
    } finally {
      setBusy(null);
    }
  };

  const canResolve = user && (user.role === "seller" || user.role === "admin");

  if (!user) return null;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading…</span></div></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <RotateCcw className="w-5 h-5 text-orange-600" />
        <h1 className="text-2xl font-bold text-gray-900">Returns</h1>
      </div>

      {returns.length === 0 ? (
        <div className="text-center py-20">
          <RotateCcw className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500">No return requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {returns.map((r, i) => {
            const mineAsSeller = canResolve && String(r.sellerId) === String(user.id);
            const showActions = r.status === "requested" && (mineAsSeller || user.role === "admin");
            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${statusStyle[r.status]}`}>{r.status}</span>
                      <Link href={`/orders/${r.orderId}`} className="text-xs text-orange-600 hover:text-orange-700 inline-flex items-center gap-1">Order <ExternalLink className="w-3 h-3" /></Link>
                    </div>
                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.reason}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{new Date(r.createdAt).toLocaleString()}</p>
                  </div>
                  {showActions && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => resolve(r.id, "approve")} disabled={busy === r.id} className="inline-flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"><Check className="w-3.5 h-3.5" /> Approve</button>
                      <button onClick={() => resolve(r.id, "reject")} disabled={busy === r.id} className="inline-flex items-center gap-1 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"><X className="w-3.5 h-3.5" /> Reject</button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
