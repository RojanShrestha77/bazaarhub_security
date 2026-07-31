"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Search, ShoppingCart, User, Package, Heart, MessageSquare, ChevronDown, LogOut, Shield, Bell, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [cartCount, setCartCount] = useState(0);

  // Poll the unread count while signed in (light, every 60s) so the badge
  // reflects notifications created by order/message/review events.
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    let active = true;
    const load = () => api.get<{ unreadCount: number }>("/notifications").then((d) => { if (active) setUnread(d.unreadCount); }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { active = false; clearInterval(t); };
  }, [user]);

  // Cart badge: total item quantity. Refreshes on mount and whenever a page
  // dispatches a "cart-updated" event (add/update/remove).
  useEffect(() => {
    if (!user) { setCartCount(0); return; }
    let active = true;
    const load = () =>
      api.get<{ items: { quantity: number }[] }>("/cart")
        .then((d) => { if (active) setCartCount((d.items || []).reduce((n, i) => n + (i.quantity || 0), 0)); })
        .catch(() => {});
    load();
    window.addEventListener("cart-updated", load);
    return () => { active = false; window.removeEventListener("cart-updated", load); };
  }, [user]);

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2" aria-label="BazaarHub home">
            {/* alt="" — the adjacent wordmark already names the brand to screen readers */}
            <img src="/logo-icon.png" alt="" width={32} height={32} className="w-8 h-8 object-contain" />
            <span className="text-xl font-bold text-orange-800">BazaarHub</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link href="/marketplace" className="text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors">
              Marketplace
            </Link>
            <Link href="/marketplace" className="text-gray-600 hover:text-orange-600 transition-colors" aria-label="Search products">
              <Search className="w-5 h-5" />
            </Link>
            <Link href="/cart" className="relative text-gray-600 hover:text-orange-600 transition-colors" aria-label={`Cart${cartCount ? ` (${cartCount} item${cartCount !== 1 ? "s" : ""})` : ""}`}>
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{cartCount > 9 ? "9+" : cartCount}</span>
              )}
            </Link>
            {user && (
              <Link href="/notifications" className="relative text-gray-600 hover:text-orange-600 transition-colors" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>
                )}
              </Link>
            )}
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
            ) : user ? (
              <div className="relative">
                <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-orange-600 transition-colors">
                  <User className="w-5 h-5" />
                  <span className="hidden lg:inline">{user.email.split("@")[0]}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50" onMouseLeave={() => setDropdownOpen(false)}>
                    <Link href="/profile" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                      <User className="w-4 h-4" /> Profile
                    </Link>
                    <Link href="/orders" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                      <Package className="w-4 h-4" /> Orders
                    </Link>
                    <Link href="/returns" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                      <RotateCcw className="w-4 h-4" /> Returns
                    </Link>
                    <Link href="/wishlist" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                      <Heart className="w-4 h-4" /> Wishlist
                    </Link>
                    <Link href="/messages" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                      <MessageSquare className="w-4 h-4" /> Messages
                    </Link>
                    <hr className="my-1 border-gray-100" />
                    {user.role === "seller" && (
                      <Link href="/seller" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                        <Package className="w-4 h-4" /> Seller Dashboard
                      </Link>
                    )}
                    {user.role === "admin" && (
                      <Link href="/admin" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors">
                        <Shield className="w-4 h-4" /> Admin Panel
                      </Link>
                    )}
                    <hr className="my-1 border-gray-100" />
                    <button onClick={logout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left">
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors">
                  Login
                </Link>
                <Link href="/register" className="text-sm font-medium bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors">
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          <button className="md:hidden p-2 text-gray-600" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-3">
          <Link href="/marketplace" className="block text-sm font-medium text-gray-700 py-2">Marketplace</Link>
          <Link href="/cart" className="block text-sm font-medium text-gray-700 py-2">Cart</Link>
          {user ? (
            <>
              <Link href="/notifications" className="block text-sm font-medium text-gray-700 py-2">Notifications{unread > 0 ? ` (${unread})` : ""}</Link>
              <Link href="/profile" className="block text-sm font-medium text-gray-700 py-2">Profile</Link>
              <Link href="/orders" className="block text-sm font-medium text-gray-700 py-2">Orders</Link>
              <Link href="/wishlist" className="block text-sm font-medium text-gray-700 py-2">Wishlist</Link>
              <Link href="/messages" className="block text-sm font-medium text-gray-700 py-2">Messages</Link>
              {user.role === "seller" && (
                <Link href="/seller" className="block text-sm font-medium text-gray-700 py-2">Seller Dashboard</Link>
              )}
              {user.role === "admin" && (
                <Link href="/admin" className="block text-sm font-medium text-gray-700 py-2">Admin Panel</Link>
              )}
              <button onClick={logout} className="block text-sm font-medium text-red-600 py-2 w-full text-left">Logout</button>
            </>
          ) : (
            <div className="flex gap-3 pt-2">
              <Link href="/login" className="flex-1 text-center text-sm font-medium text-gray-700 border border-gray-300 rounded-lg py-2">Login</Link>
              <Link href="/register" className="flex-1 text-center text-sm font-medium bg-orange-600 text-white rounded-lg py-2">Sign Up</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
