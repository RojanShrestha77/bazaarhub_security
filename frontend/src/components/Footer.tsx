"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Shield, Facebook, Instagram, Twitter } from "lucide-react";
import toast from "react-hot-toast";

export default function Footer() {
  const [email, setEmail] = useState("");

  // No newsletter endpoint exists yet — this just acknowledges the signup
  // locally so the form isn't a dead end while that backend piece is pending.
  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    toast.success("Thanks for subscribing!");
    setEmail("");
  };

  return (
    <footer className="bg-gray-50 text-gray-600 mt-auto border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src="/logo-icon.png" alt="" width={32} height={32} className="w-8 h-8 object-contain" />
              <span className="text-lg font-bold text-orange-800">BazaarHub</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">A secure marketplace with escrow payments and tiered seller verification.</p>
            <div className="flex items-center gap-3">
              <a href="#" className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:border-orange-300 hover:text-orange-600 transition-colors" aria-label="Facebook"><Facebook className="w-4 h-4" /></a>
              <a href="#" className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:border-orange-300 hover:text-orange-600 transition-colors" aria-label="Instagram"><Instagram className="w-4 h-4" /></a>
              <a href="#" className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:border-orange-300 hover:text-orange-600 transition-colors" aria-label="Twitter"><Twitter className="w-4 h-4" /></a>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Company</h3>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-sm hover:text-orange-600 transition-colors">About</Link></li>
              <li><Link href="/contact" className="text-sm hover:text-orange-600 transition-colors">Contact</Link></li>
              <li><Link href="/faq" className="text-sm hover:text-orange-600 transition-colors">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Support</h3>
            <ul className="space-y-2">
              <li><Link href="/help" className="text-sm hover:text-orange-600 transition-colors">Help Center</Link></li>
              <li><Link href="/returns-policy" className="text-sm hover:text-orange-600 transition-colors">Returns Policy</Link></li>
              <li><Link href="/privacy-policy" className="text-sm hover:text-orange-600 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms-conditions" className="text-sm hover:text-orange-600 transition-colors">Terms & Conditions</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Stay Updated</h3>
            <p className="text-sm text-gray-500 mb-3">Get updates on new listings and deals.</p>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                className="min-w-0 flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
              <button type="submit" className="shrink-0 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Join
              </button>
            </form>
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-4">
              <Shield className="w-4 h-4 text-orange-600" />
              <span>Escrow Protected</span>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-200 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-400">
          <span>&copy; {new Date().getFullYear()} BazaarHub. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy-policy" className="hover:text-orange-600 transition-colors">Privacy Policy</Link>
            <Link href="/terms-conditions" className="hover:text-orange-600 transition-colors">Terms & Conditions</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
