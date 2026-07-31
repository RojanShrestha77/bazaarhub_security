"use client";

import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-sm">
        <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-12 h-12 text-red-300" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-500 mb-8">You don&apos;t have permission to view this page. If you believe this is a mistake, contact support.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm"><ArrowLeft className="w-4 h-4" /> Go Home</Link>
          <Link href="/contact" className="inline-flex items-center gap-2 border border-gray-200 text-gray-700 px-6 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors">Contact Support</Link>
        </div>
      </motion.div>
    </div>
  );
}
