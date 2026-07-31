"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

export default function MagicLinkPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/auth/magic-link/request", { email });
      setSent(true);
      toast.success("Magic link sent!");
    } catch {
      toast.error("Failed to send magic link");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-orange-600" />
          </div>
          {sent ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
              <p className="text-sm text-gray-500 mb-6">We sent a magic sign-in link to <strong>{email}</strong>. It expires in 15 minutes.</p>
              <Link href="/login" className="text-sm text-orange-600 hover:text-orange-700 font-medium">Back to login</Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Magic Link Sign-In</h1>
              <p className="text-sm text-gray-500 mb-6">No password needed — we will email you a sign-in link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none" placeholder="you@example.com" required />
                <button type="submit" disabled={submitting} className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
                  {submitting ? "Sending..." : "Send Magic Link"}
                </button>
              </form>
              <p className="mt-6 text-sm text-gray-400"><Link href="/login" className="text-orange-600 hover:text-orange-700 font-medium">Back to login</Link></p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
