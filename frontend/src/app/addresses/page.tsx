"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, Plus, Trash2, Star, ChevronLeft } from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Address } from "@/types";

const EMPTY = { label: "", recipientName: "", phone: "", line1: "", line2: "", city: "", district: "", province: "", postalCode: "" };

export default function AddressesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api.get<{ addresses: Address[] }>("/addresses").then((d) => setAddresses(d.addresses)).catch(() => {}).finally(() => setLoading(false));
  }, [user, authLoading, router]);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""));
      const created = await api.post<Address>("/addresses", { ...payload, isDefault: makeDefault });
      // Re-fetch so the default flag is consistent across the list.
      const { addresses: fresh } = await api.get<{ addresses: Address[] }>("/addresses");
      setAddresses(fresh);
      void created;
      setForm(EMPTY); setMakeDefault(false); setShowForm(false);
      toast.success("Address saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save address");
    } finally {
      setSaving(false);
    }
  };

  const makeDefaultAddr = async (id: string) => {
    try {
      await api.patch(`/addresses/${id}`, { isDefault: true });
      const { addresses: fresh } = await api.get<{ addresses: Address[] }>("/addresses");
      setAddresses(fresh);
    } catch { toast.error("Could not set default"); }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/addresses/${id}`);
      const { addresses: fresh } = await api.get<{ addresses: Address[] }>("/addresses");
      setAddresses(fresh);
      toast.success("Address removed");
    } catch { toast.error("Could not remove address"); }
  };

  if (!user) return null;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading…</span></div></div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/profile" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-orange-600 mb-6"><ChevronLeft className="w-4 h-4" /> Back to profile</Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-orange-600" />
          <h1 className="text-2xl font-bold text-gray-900">Shipping Addresses</h1>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-700 transition-colors">
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
      </div>

      {showForm && (
        <motion.form initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Recipient name *" value={form.recipientName} onChange={(v) => set("recipientName", v)} required />
            <Field label="Phone *" value={form.phone} onChange={(v) => set("phone", v)} required />
          </div>
          <Field label="Address line 1 *" value={form.line1} onChange={(v) => set("line1", v)} required />
          <Field label="Address line 2" value={form.line2} onChange={(v) => set("line2", v)} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="City *" value={form.city} onChange={(v) => set("city", v)} required />
            <Field label="District" value={form.district} onChange={(v) => set("district", v)} />
            <Field label="Province" value={form.province} onChange={(v) => set("province", v)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Postal code" value={form.postalCode} onChange={(v) => set("postalCode", v)} />
            <Field label="Label (e.g. Home)" value={form.label} onChange={(v) => set("label", v)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
            Set as default
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY); }} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="bg-orange-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50">{saving ? "Saving…" : "Save address"}</button>
          </div>
        </motion.form>
      )}

      {addresses.length === 0 && !showForm ? (
        <div className="text-center py-16">
          <MapPin className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500">No saved addresses yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((a) => (
            <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{a.recipientName}</p>
                  {a.label && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{a.label}</span>}
                  {a.isDefault && <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium"><Star className="w-3 h-3 fill-current" /> Default</span>}
                </div>
                <p className="text-sm text-gray-600 mt-1">{[a.line1, a.line2, a.city, a.district, a.province, a.postalCode].filter(Boolean).join(", ")}</p>
                <p className="text-sm text-gray-400 mt-0.5">{a.phone}</p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {!a.isDefault && <button onClick={() => makeDefaultAddr(a.id)} className="text-xs text-orange-600 hover:text-orange-700 font-medium">Set default</button>}
                <button onClick={() => remove(a.id)} aria-label="Remove address" className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} required={required} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none" />
    </label>
  );
}
