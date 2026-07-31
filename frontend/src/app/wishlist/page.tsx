"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Heart, Trash2, Package } from "lucide-react";
import toast from "react-hot-toast";
import { api, API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { SerializedListing } from "@/types";
import { formatPrice } from "@/types";

export default function WishlistPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<SerializedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api.get<{ items: SerializedListing[] }>("/wishlist")
      .then((d) => setItems(d.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await api.delete(`/wishlist/${id}`);
      setItems((prev) => prev.filter((l) => l.id !== id));
      toast.success("Removed from wishlist");
    } catch {
      toast.error("Could not remove item");
    } finally {
      setRemoving(null);
    }
  };

  if (!user) return null;
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading…</span></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-sm">
          <div className="w-24 h-24 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Heart className="w-12 h-12 text-pink-300" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your wishlist is empty</h2>
          <p className="text-gray-500 mb-8">Save items you love and find them here.</p>
          <Link href="/marketplace" className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm">
            Browse Marketplace
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center gap-3">
        <Heart className="w-6 h-6 text-pink-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wishlist</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} saved item{items.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="group bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all"
          >
            <Link href={`/listings/${item.id}`} className="block">
              <div className="aspect-[4/3] bg-gray-50 overflow-hidden">
                {item.images.length > 0 ? (
                  <img src={`${API_BASE}/listings/${item.id}/images/${item.images[0]}`} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-200" /></div>
                )}
              </div>
            </Link>
            <div className="p-4">
              <Link href={`/listings/${item.id}`}>
                <h3 className="font-semibold text-gray-900 truncate hover:text-orange-600 transition-colors">{item.title}</h3>
              </Link>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-bold text-orange-600">{formatPrice(item.priceMinorUnits)}</span>
                <button
                  onClick={() => remove(item.id)}
                  disabled={removing === item.id}
                  aria-label="Remove from wishlist"
                  className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
