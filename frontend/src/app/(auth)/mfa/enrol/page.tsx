"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import QRCode from "react-qr-code";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

interface MfaEnrolResponse {
  otpauthUri: string;
  secret: string;
  recoveryCodes: string[];
}

export default function MfaEnrolPage() {
  const [step, setStep] = useState<"enrol" | "verify" | "done">("enrol");
  const [uri, setUri] = useState("");
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const startEnrol = async () => {
    setSubmitting(true);
    try {
      const data = await api.post<MfaEnrolResponse>("/auth/mfa/enrol");
      setUri(data.otpauthUri);
      setSecret(data.secret);
      // Recovery codes are issued by /mfa/enrol (NOT by /mfa/verify, which
      // returns only { mfaVerified }). Capture them here or they are lost.
      setCodes(data.recoveryCodes ?? []);
      setStep("verify");
    } catch {
      toast.error("Failed to start enrollment");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async () => {
    setSubmitting(true);
    try {
      await api.post<{ mfaVerified: boolean }>("/auth/mfa/verify", { code });
      setStep("done");
      toast.success("MFA enabled!");
    } catch {
      toast.error("Invalid code");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          {step === "enrol" && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Set Up MFA</h1>
              <p className="text-sm text-gray-500 mb-6">Add an extra layer of security to your account.</p>
              <button onClick={startEnrol} disabled={submitting} className="bg-orange-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
                {submitting ? "Starting..." : "Get Started"}
              </button>
            </>
          )}
          {step === "verify" && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Scan QR Code</h1>
              <p className="text-sm text-gray-500 mb-5">Scan with Google Authenticator or Authy, save your recovery codes, then enter the 6-digit code.</p>

              {/* Rendered locally as an SVG — the otpauth URI contains the TOTP
                  secret, so it must never be sent to an external QR service. */}
              {uri && (
                <div className="flex justify-center mb-4">
                  <div className="bg-white p-4 rounded-xl border border-gray-200">
                    <QRCode value={uri} size={168} level="M" />
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 mb-5">
                Can&apos;t scan? Enter this key manually:<br />
                <code className="font-mono text-gray-600 break-all">{secret}</code>
              </p>

              {codes.length > 0 && (
                <div className="mb-5 text-left">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-900">Recovery codes</p>
                    <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Shown once</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-1">
                    {codes.map((c, i) => <div key={i} className="font-mono text-sm text-gray-700">{c}</div>)}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Each code works once if you lose your authenticator. Store them somewhere safe.</p>
                </div>
              )}

              <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none mb-4" />
              <button onClick={verifyCode} disabled={submitting || code.length !== 6} className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
                {submitting ? "Verifying..." : "Verify"}
              </button>
            </>
          )}
          {step === "done" && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">MFA Enabled</h1>
              <p className="text-sm text-gray-500 mb-4">Save these recovery codes somewhere safe.</p>
              <div className="bg-gray-50 rounded-xl p-4 mb-4 text-left">
                {codes.map((c, i) => <div key={i} className="font-mono text-sm text-gray-700 py-1">{c}</div>)}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
