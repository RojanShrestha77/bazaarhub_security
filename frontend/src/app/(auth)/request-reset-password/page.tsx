"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

export default function RequestResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/auth/password/reset/request", { email });
      setSent(true);
      toast.success("Reset link sent!");
    } catch {
      toast.error("Failed to send reset link");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {sent ? (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
              <p className="text-sm text-gray-500 mb-6">If an account with that email exists, we sent a reset link.</p>
              <Link href="/login" className="text-sm text-orange-600 hover:text-orange-700 font-medium">Back to login</Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Forgot Password</h1>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none" placeholder="you@example.com" required />
                <button type="submit" disabled={submitting} className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
                  {submitting ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
              <p className="mt-6 text-center text-sm text-gray-400"><Link href="/login" className="text-orange-600 hover:text-orange-700 font-medium">Back to login</Link></p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
