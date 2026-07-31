"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Shield, Send } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";

const EMPTY = { fullName: "", idType: "", idNumber: "", businessName: "", phone: "", address: "" };

export default function VerificationPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [status, setStatus] = useState<{ status: string | null; createdAt?: string } | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    api.get<{ status: string | null; createdAt?: string }>("/verification/status").then(setStatus).catch(() => setStatus(null));
  }, [user, router]);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form, businessName: form.businessName || undefined };
      const result = await api.post<{ status: string; createdAt: string }>("/verification/submit", payload);
      setStatus(result);
      toast.success("Verification details submitted");
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-orange-600" />
          <h1 className="text-3xl font-bold text-gray-900">Seller Verification</h1>
        </div>
        {status?.status === "approved" ? (
          <div className="bg-green-50 rounded-2xl p-6 text-center border border-green-100">
            <Shield className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-green-800">Verified</p>
            <p className="text-sm text-green-600 mt-1">Your seller details have been verified. You now have a verified seller badge.</p>
          </div>
        ) : status?.status === "pending" ? (
          <div className="bg-yellow-50 rounded-2xl p-6 text-center border border-yellow-100">
            <p className="text-lg font-semibold text-yellow-800">Pending Review</p>
            <p className="text-sm text-yellow-600 mt-1">Submitted {status.createdAt ? new Date(status.createdAt).toLocaleDateString() : "recently"}. An admin will review your details.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
            <p className="text-sm text-gray-600">Fill in your seller identity details to get verified. An admin reviews and approves them{status?.status === "rejected" ? " — your previous submission was rejected, please resubmit." : "."}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full legal name *" value={form.fullName} onChange={(v) => set("fullName", v)} required />
              <div>
                <label htmlFor="v-idtype" className="block text-sm font-medium text-gray-700 mb-1">ID Type *</label>
                <select id="v-idtype" value={form.idType} onChange={(e) => set("idType", e.target.value)} required className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white">
                  <option value="">Select…</option>
                  <option value="citizenship">Citizenship</option>
                  <option value="passport">Passport</option>
                  <option value="driving_license">Driving License</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="ID number *" value={form.idNumber} onChange={(v) => set("idNumber", v)} required />
              <Field label="Phone *" value={form.phone} onChange={(v) => set("phone", v)} required />
            </div>
            <Field label="Business / store name" value={form.businessName} onChange={(v) => set("businessName", v)} />
            <Field label="Address *" value={form.address} onChange={(v) => set("address", v)} required />
            <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-sm">
              <Send className="w-4 h-4" />{submitting ? "Submitting…" : "Submit for Verification"}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} required={required} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" />
    </div>
  );
}
