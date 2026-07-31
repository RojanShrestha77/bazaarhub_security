"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Category } from "@/types";
import { buildCategoryTree } from "@/types";
import toast from "react-hot-toast";

export default function NewListingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [parentCat, setParentCat] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [categories, setCategories] = useState<Category[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const tree = buildCategoryTree(categories);
  const selectedParent = tree.find((t) => t.parent.id === parentCat);
  const subOptions = selectedParent?.children ?? [];

  // Build (and clean up) object URLs for local image previews.
  useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  useEffect(() => {
    api.get<Category[]>("/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/login"); return; }
    if (user.role !== "seller") { router.push("/profile"); return; }
  }, [user, loading, router]);

  if (loading || !user || user.role !== "seller") return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Use the subcategory when the parent has children; otherwise the parent
    // itself (e.g. "Other" has no subcategories).
    const effectiveCategory = subOptions.length > 0 ? category : parentCat;
    if (!effectiveCategory) {
      toast.error("Please choose a category");
      return;
    }
    setSubmitting(true);
    try {
      const priceMinorUnits = Math.round(parseFloat(price) * 100);
      const data = await api.post<{ id: string }>("/listings", {
        title, description, priceMinorUnits, category: effectiveCategory, quantity: parseInt(quantity),
      });
      if (images.length > 0) {
        const form = new FormData();
        for (const img of images) form.append("images", img);
        await api.upload(`/listings/${data.id}/images`, form);
      }
      toast.success("Listing created!");
      router.push(`/listings/${data.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Create Listing</h1>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-8 space-y-6 shadow-sm">
          <div>
            <label htmlFor="l-title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input id="l-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" required />
          </div>
          <div>
            <label htmlFor="l-desc" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea id="l-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="l-price" className="block text-sm font-medium text-gray-700 mb-1">Price (NPR)</label>
              <input id="l-price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" required />
            </div>
            <div>
              <label htmlFor="l-qty" className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input id="l-qty" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none" required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="l-cat" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select id="l-cat" value={parentCat} onChange={(e) => { setParentCat(e.target.value); setCategory(""); }} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white" required>
                <option value="">Select…</option>
                {tree.map((t) => <option key={t.parent.id} value={t.parent.id}>{t.parent.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="l-subcat" className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
              <select id="l-subcat" value={category} onChange={(e) => setCategory(e.target.value)} disabled={subOptions.length === 0} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400" required={subOptions.length > 0}>
                <option value="">{subOptions.length === 0 ? (parentCat ? "— none —" : "Select a category first") : "Select…"}</option>
                {subOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="l-images" className="block text-sm font-medium text-gray-700 mb-1">Images (up to 6)</label>
            <input id="l-images" type="file" multiple accept="image/*" onChange={(e) => setImages(Array.from(e.target.files || []).slice(0, 6))} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100" />
            {previews.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-2">Preview ({previews.length} image{previews.length !== 1 ? "s" : ""})</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage(i)} aria-label="Remove image" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70">✕</button>
                      {i === 0 && <span className="absolute bottom-1 left-1 bg-orange-600 text-white text-[10px] px-1.5 py-0.5 rounded">Cover</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button type="submit" disabled={submitting} className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-sm">
            {submitting ? "Creating..." : "Create Listing"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
