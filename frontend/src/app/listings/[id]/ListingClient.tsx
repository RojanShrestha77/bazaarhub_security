"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShoppingBag, Minus, Plus, ChevronLeft, Share2, Clock, Shield, Package, AlertCircle, Heart, Star, MessageCircle } from "lucide-react";
import { api, API_BASE, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { SerializedListing, Review, ReviewsResponse } from "@/types";
import { formatPrice } from "@/types";
import toast from "react-hot-toast";

function Stars({ value, className = "w-4 h-4" }: { value: number; className?: string }) {
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
      ))}
    </div>
  );
}

export default function ListingClient() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuth();
  const [listing, setListing] = useState<SerializedListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [tab, setTab] = useState<"description" | "details">("description");

  // Wishlist
  const [wishlisted, setWishlisted] = useState(false);
  const [wishBusy, setWishBusy] = useState(false);

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<{ average: number; count: number }>({ average: 0, count: 0 });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Contact seller
  const [contactOpen, setContactOpen] = useState(false);
  const [contactMsg, setContactMsg] = useState("");
  const [contacting, setContacting] = useState(false);

  useEffect(() => {
    api.get<SerializedListing>(`/listings/${id}`).then(setListing).catch(() => {}).finally(() => setLoading(false));
    api.get<ReviewsResponse>(`/listings/${id}/reviews`).then((d) => { setReviews(d.reviews); setSummary(d.summary); }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!user) { setWishlisted(false); return; }
    api.get<{ items: SerializedListing[] }>("/wishlist")
      .then((d) => setWishlisted(d.items.some((l) => l.id === id)))
      .catch(() => {});
  }, [user, id]);

  const toggleWishlist = async () => {
    if (!user) { router.push("/login"); return; }
    setWishBusy(true);
    const next = !wishlisted;
    setWishlisted(next); // optimistic
    try {
      if (next) await api.put(`/wishlist/${id}`);
      else await api.delete(`/wishlist/${id}`);
    } catch {
      setWishlisted(!next); // revert
      toast.error("Could not update wishlist");
    } finally {
      setWishBusy(false);
    }
  };

  const startConversation = async () => {
    if (!user) { router.push("/login"); return; }
    if (!contactMsg.trim()) return;
    setContacting(true);
    try {
      await api.post("/conversations", { listingId: id, body: contactMsg.trim() });
      toast.success("Message sent to seller");
      setContactOpen(false); setContactMsg("");
      router.push("/messages");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) toast.error("Verify your email before messaging");
      else if (err instanceof ApiError && err.status === 400) toast.error("You can't message yourself about your own listing");
      else toast.error("Could not send message");
    } finally {
      setContacting(false);
    }
  };

  const submitReview = async () => {
    if (!user) { router.push("/login"); return; }
    setSubmitting(true);
    try {
      const created = await api.post<Review>(`/listings/${id}/reviews`, { rating, comment: comment.trim() || undefined });
      setReviews((prev) => [created, ...prev]);
      const total = summary.average * summary.count + created.rating;
      setSummary({ count: summary.count + 1, average: Math.round((total / (summary.count + 1)) * 10) / 10 });
      setComment("");
      toast.success("Review posted");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) toast.error("Only buyers who received this item can review it");
      else if (err instanceof ApiError && err.status === 409) toast.error("You've already reviewed this item");
      else toast.error("Could not post review");
    } finally {
      setSubmitting(false);
    }
  };

  const addToCart = async () => {
    if (!user) { router.push("/login"); return; }
    setAdding(true);
    try {
      await api.post("/cart/items", { listingId: id, quantity });
      window.dispatchEvent(new Event("cart-updated"));
      toast.success("Added to cart!");
    } catch (err: unknown) {
      toast.error("Failed to add to cart");
    } finally {
      setAdding(false);
    }
  };

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="animate-pulse">
        <div className="h-4 w-24 bg-gray-100 rounded mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="aspect-square bg-gray-100 rounded-2xl" />
          <div className="space-y-4">
            <div className="h-8 bg-gray-100 rounded w-3/4" />
            <div className="h-6 bg-gray-100 rounded w-1/4" />
            <div className="h-20 bg-gray-100 rounded" />
            <div className="h-12 bg-gray-100 rounded w-1/3" />
          </div>
        </div>
      </div>
    </div>
  );

  if (!listing) return (
    <div className="max-w-6xl mx-auto px-4 py-20 text-center">
      <AlertCircle className="w-16 h-16 text-gray-200 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Listing not found</h2>
      <p className="text-gray-500 mb-6">This listing may have been removed or doesn&apos;t exist.</p>
      <Link href="/marketplace" className="inline-flex items-center gap-2 text-orange-600 font-medium hover:text-orange-700"><ChevronLeft className="w-4 h-4" /> Back to Marketplace</Link>
    </div>
  );

  const images = listing.images.length > 0 ? listing.images : null;
  const isSold = listing.status === "sold";
  const isDraft = listing.status === "draft";
  const canAddToCart = listing.status === "active" && listing.quantity > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/marketplace" className="hover:text-orange-600 transition-colors">Marketplace</Link>
        <span>/</span>
        <span className="text-gray-600 truncate">{listing.title}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Image gallery */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 shadow-sm relative group">
            {images ? (
              <img src={`${API_BASE}/listings/${id}/images/${images[activeImage]}`} crossOrigin="use-credentials" alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50">
                <ShoppingBag className="w-24 h-24 text-orange-200" />
              </div>
            )}
            {isSold && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="text-white text-2xl font-bold bg-red-500 px-6 py-2 rounded-xl">Sold</span></div>}
            {isDraft && <div className="absolute top-3 left-3 bg-gray-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow">Draft</div>}
          </div>
          {images && images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button key={i} onClick={() => setActiveImage(i)} className={`w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden border-2 bg-gray-50 transition-all ${i === activeImage ? "border-orange-500 ring-1 ring-orange-500" : "border-gray-100 hover:border-gray-200"}`}>
                  <img src={`${API_BASE}/listings/${id}/images/${img}`} crossOrigin="use-credentials" alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Listing info */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{listing.title}</h1>
              <p className="text-sm text-gray-400 mt-1">{listing.category || "General"}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggleWishlist} disabled={wishBusy} aria-pressed={wishlisted} className={`p-2 rounded-lg transition-colors ${wishlisted ? "text-pink-500 bg-pink-50 hover:bg-pink-100" : "text-gray-400 hover:text-pink-500 hover:bg-pink-50"}`} title={wishlisted ? "Remove from wishlist" : "Save to wishlist"}>
                <Heart className={`w-5 h-5 ${wishlisted ? "fill-current" : ""}`} />
              </button>
              <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied!"); }} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="Share">
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-gray-900">{formatPrice(listing.priceMinorUnits)}</span>
            <span className="text-sm text-gray-400">NPR</span>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${listing.status === "active" ? "bg-green-50 text-green-700" : listing.status === "sold" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"}`}>
              <Package className="w-3 h-3" />
              {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
            </span>
            {canAddToCart && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-blue-50 text-blue-700">
                <Clock className="w-3 h-3" />
                {listing.quantity > 1 ? `${listing.quantity} available` : "Last one!"}
              </span>
            )}
          </div>

          <hr className="my-6 border-gray-100" />

          {/* Tabs: Description / Details */}
          <div className="flex gap-0 border-b border-gray-100 mb-4">
            {(["description", "details"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-orange-600 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {t === "description" ? "Description" : "Details"}
              </button>
            ))}
          </div>
          <div className="min-h-[100px]">
            {tab === "description" ? (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{listing.description || "No description provided."}</p>
            ) : (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Category</dt><dd className="font-medium text-gray-900">{listing.category || "General"}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Quantity</dt><dd className="font-medium text-gray-900">{listing.quantity}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd className="font-medium text-gray-900 capitalize">{listing.status}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Listed</dt><dd className="font-medium text-gray-900">{new Date(listing.createdAt).toLocaleDateString()}</dd></div>
              </dl>
            )}
          </div>

          <hr className="my-6 border-gray-100" />

          {/* Add to cart */}
          {canAddToCart ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Quantity:</span>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center font-medium text-gray-900">{quantity}</span>
                  <button onClick={() => setQuantity(Math.min(listing.quantity, quantity + 1))} disabled={quantity >= listing.quantity} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={addToCart} disabled={adding} className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm">
                  {adding ? "Adding..." : `Add to Cart — ${formatPrice(listing.priceMinorUnits * quantity)}`}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Shield className="w-3.5 h-3.5 text-orange-400" />
                <span>Escrow-protected payment. You only pay when you confirm delivery.</span>
              </div>
            </div>
          ) : isSold ? (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700 font-medium text-center">This item has been sold.</div>
          ) : isDraft ? (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-500 font-medium text-center">This listing is not yet published.</div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700 font-medium text-center">This item is currently unavailable.</div>
          )}
          {/* Contact seller */}
          {user && listing.sellerId !== user.id && (
            <div className="mt-6">
              {!contactOpen ? (
                <button onClick={() => setContactOpen(true)} className="inline-flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700">
                  <MessageCircle className="w-4 h-4" /> Contact seller
                </button>
              ) : (
                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                  <p className="text-sm font-medium text-gray-700 mb-2">Message the seller</p>
                  <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} maxLength={2000} rows={3} placeholder="Ask a question about this item…" className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none resize-none" />
                  <div className="mt-2 flex justify-end gap-2">
                    <button onClick={() => { setContactOpen(false); setContactMsg(""); }} className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={startConversation} disabled={contacting || !contactMsg.trim()} className="bg-orange-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50">{contacting ? "Sending…" : "Send"}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Reviews */}
      <section className="mt-12 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Reviews</h2>
          {summary.count > 0 && (
            <div className="flex items-center gap-2">
              <Stars value={summary.average} />
              <span className="text-sm font-medium text-gray-700">{summary.average.toFixed(1)}</span>
              <span className="text-sm text-gray-400">({summary.count})</span>
            </div>
          )}
        </div>

        {user && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Write a review</p>
            <div className="flex items-center gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} className="p-0.5">
                  <Star className={`w-6 h-6 transition-colors ${n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200 hover:text-amber-200"}`} />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Share your experience with this item (optional)…"
              className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-800 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none resize-none"
            />
            <div className="mt-3 flex justify-end">
              <button onClick={submitReview} disabled={submitting} className="bg-orange-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition-colors">
                {submitting ? "Posting…" : "Post review"}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">Only buyers who received this item can post a review.</p>
          </div>
        )}

        {reviews.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No reviews yet. Be the first once you&apos;ve received your order.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <Stars value={r.rating} />
                  <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
