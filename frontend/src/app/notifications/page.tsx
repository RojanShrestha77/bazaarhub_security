"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, Package, MessageSquare, Star, CheckCheck, BadgeCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Notification } from "@/types";

const iconFor: Record<Notification["type"], typeof Bell> = {
  order_update: Package,
  message: MessageSquare,
  review: Star,
  seller_application: BadgeCheck,
  verification: BadgeCheck,
};

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get<{ notifications: Notification[] }>("/notifications").then((d) => setItems(d.notifications)).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    load();
  }, [user, authLoading, router]);

  const open = async (n: Notification) => {
    if (!n.read) { try { await api.post(`/notifications/${n.id}/read`); } catch {} setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))); }
    if (n.link) router.push(n.link);
  };

  const markAll = async () => {
    try { await api.post("/notifications/read-all"); setItems((prev) => prev.map((x) => ({ ...x, read: true }))); } catch {}
  };

  if (!user) return null;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading…</span></div></div>;

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-orange-600" />
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unread > 0 && <span className="text-xs bg-red-500 text-white font-bold px-2 py-0.5 rounded-full">{unread}</span>}
        </div>
        {unread > 0 && (
          <button onClick={markAll} className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 font-medium">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <Bell className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500">You&apos;re all caught up.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n, i) => {
            const Icon = iconFor[n.type] || Bell;
            return (
              <motion.button
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => open(n)}
                className={`w-full text-left flex items-start gap-3 p-4 rounded-2xl border shadow-sm transition-colors ${n.read ? "bg-white border-gray-100 hover:bg-gray-50" : "bg-orange-50/60 border-orange-100 hover:bg-orange-50"}`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${n.read ? "bg-gray-100 text-gray-400" : "bg-orange-100 text-orange-600"}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm truncate ${n.read ? "font-medium text-gray-700" : "font-semibold text-gray-900"}`}>{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />}
                  </div>
                  {n.body && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
