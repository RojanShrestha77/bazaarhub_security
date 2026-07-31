"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login, verifyMfa, verifyRecoveryCode, mfaRequired } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.push("/marketplace");
  }, [user, loading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfa = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (useRecovery) await verifyRecoveryCode(recoveryCode);
      else await verifyMfa(mfaCode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {mfaRequired ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Two-Factor Authentication</h1>
              <p className="text-sm text-gray-500 mb-6">Enter the code from your authenticator app.</p>
              <form onSubmit={handleMfa} className="space-y-4">
                {useRecovery ? (
                  <div>
                    <label htmlFor="recovery-code" className="block text-sm font-medium text-gray-700 mb-1">Recovery Code</label>
                    <input id="recovery-code" type="text" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" placeholder="XXXX-XXXX-XXXX" required />
                  </div>
                ) : (
                  <div>
                    <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1">Authentication Code</label>
                    <input id="mfa-code" type="text" inputMode="numeric" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))} className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" placeholder="000000" required />
                  </div>
                )}
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                <button type="submit" disabled={submitting} className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
                  {submitting ? "Verifying..." : "Verify"}
                </button>
                <button type="button" onClick={() => { setUseRecovery(!useRecovery); setError(""); }} className="w-full text-sm text-orange-600 hover:text-orange-700">
                  {useRecovery ? "Use authenticator code" : "Use a recovery code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
              <p className="text-sm text-gray-500 mb-6">Sign in to your account</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" placeholder="you@example.com" required autoComplete="email" />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" placeholder="••••••••" required autoComplete="current-password" />
                </div>
                {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                <button type="submit" disabled={submitting} className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
                  {submitting ? "Signing in..." : "Sign In"}
                </button>
              </form>
              <div className="mt-6 space-y-3 text-center text-sm">
                <Link href="/magic-link" className="block text-orange-600 hover:text-orange-700">Sign in with magic link</Link>
                <Link href="/request-reset-password" className="block text-gray-500 hover:text-gray-700">Forgot password?</Link>
                <p className="text-gray-400">Don&apos;t have an account? <Link href="/register" className="text-orange-600 hover:text-orange-700 font-medium">Sign up</Link></p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
