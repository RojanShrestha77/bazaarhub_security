"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Category, SerializedListing } from "@/types";
import { buildCategoryTree } from "@/types";
import toast from "react-hot-toast";

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, loading } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [parentCat, setParentCat] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [categories, setCategories] = useState<Category[]>([]);

  const tree = buildCategoryTree(categories);
  const selectedParent = tree.find((t) => t.parent.id === parentCat);
  const subOptions = selectedParent?.children ?? [];
  const [images, setImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("draft");
  const [fetching, setFetching] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Category[]>("/categories").then(setCategories).catch(() => {});
  }, []);

  // Once both the listing's category and the category list are loaded, derive
  // the parent selection so the two-level picker shows the right pair.
  useEffect(() => {
    if (!category || categories.length === 0 || parentCat) return;
    const cat = categories.find((c) => c.id === category);
    if (!cat) return;
    setParentCat(cat.parentId ? String(cat.parentId) : cat.id);
  }, [category, categories, parentCat]);

  useEffect(() => {
    if (!loading && !user) { router.push("/login"); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (!id) return;
    api.get<SerializedListing>(`/listings/${id}`)
      .then((l) => {
        setTitle(l.title);
        setDescription(l.description || "");
        setPrice((l.priceMinorUnits / 100).toString());
        setCategory(typeof l.category === "string" ? l.category : String(l.category));
        setQuantity(String(l.quantity));
        setStatus(l.status);
        setExistingImages(l.images || []);
      })
      .catch(() => { toast.error("Listing not found"); router.push("/seller"); })
      .finally(() => setFetching(false));
  }, [id, router]);

  if (loading || !user || fetching) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading...</span></div></div>;

  const editable = status === "draft" || status === "active";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editable) { toast.error("Sold or withdrawn listings can't be edited"); return; }
    const effectiveCategory = subOptions.length > 0 ? category : parentCat;
    if (!effectiveCategory) { toast.error("Please choose a category"); return; }
    setSubmitting(true);
    try {
      const priceMinorUnits = Math.round(parseFloat(price) * 100);
      await api.patch(`/listings/${id}`, {
        title, description, priceMinorUnits, category: effectiveCategory, quantity: parseInt(quantity),
      });
      if (images.length > 0) {
        const form = new FormData();
        for (const img of images) form.append("images", img);
        await api.upload(`/listings/${id}/images`, form);
      }
      toast.success("Listing updated");
      router.push("/seller");
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Listing</h1>
        <p className="text-sm text-gray-500 mb-8 capitalize">Status: {status}</p>
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
            <label htmlFor="l-images" className="block text-sm font-medium text-gray-700 mb-1">Add Images {existingImages.length > 0 && <span className="text-gray-400 font-normal">({existingImages.length} already uploaded)</span>}</label>
            <input id="l-images" type="file" multiple accept="image/*" onChange={(e) => setImages(Array.from(e.target.files || []).slice(0, 6))} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-sm">
              {submitting ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={() => router.push("/seller")} className="px-6 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
