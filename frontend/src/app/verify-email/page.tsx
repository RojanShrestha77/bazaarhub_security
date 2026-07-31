"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Mail } from "lucide-react";
import { api, ApiError } from "@/lib/api";

function Spinner() {
  return (
    <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status">
      <span className="sr-only">Verifying…</span>
    </div>
  );
}

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This link is missing its verification token.");
      return;
    }
    api
      .post("/auth/email/verify", { token })
      .then(() => setState("success"))
      .catch((err) => {
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Verification failed. The link may have expired.");
      });
  }, [token]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-sm bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
        {state === "loading" && (
          <>
            <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-5"><Mail className="w-8 h-8 text-orange-400" /></div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Verifying your email…</h1>
            <div className="flex justify-center mt-4"><Spinner /></div>
          </>
        )}
        {state === "success" && (
          <>
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5"><CheckCircle className="w-8 h-8 text-green-500" /></div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Email verified!</h1>
            <p className="text-sm text-gray-500 mb-6">Your email is confirmed. You can now buy, sell, and message on BazaarHub.</p>
            <Link href="/login" className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm">Continue to login</Link>
          </>
        )}
        {state === "error" && (
          <>
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5"><XCircle className="w-8 h-8 text-red-500" /></div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Verification failed</h1>
            <p className="text-sm text-gray-500 mb-6">{message}</p>
            <p className="text-xs text-gray-400 mb-6">If your link expired, sign in and use “Resend verification email” from your profile.</p>
            <Link href="/login" className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm">Go to login</Link>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center"><Spinner /></div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
