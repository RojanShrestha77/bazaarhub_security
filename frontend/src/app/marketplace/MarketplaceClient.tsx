"use client";

import { useState, useEffect, FormEvent, useCallback, Fragment, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Plus, ShoppingBag, ChevronLeft, ChevronRight, SlidersHorizontal, PackageOpen, Check, X, Shield } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { SearchResult, SerializedListing, Category } from "@/types";
import { formatPrice, buildCategoryTree } from "@/types";

const MAX_PRICE_NPR = 100000;

function CategoryRow({ name, selected, indent, onClick }: { name: string; selected: boolean; indent?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 text-left py-1.5 rounded-lg text-sm transition-colors ${indent ? "pl-6" : "font-medium"} ${selected ? "text-orange-700" : "text-gray-600 hover:text-gray-900"}`}
    >
      <span className={`shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-colors ${selected ? "bg-orange-600 border-orange-600" : "border-gray-300"}`}>
        {selected && <Check className="w-3 h-3 text-white" />}
      </span>
      <span className="truncate">{name}</span>
    </button>
  );
}

function MarketplaceContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialCategoryParam = searchParams.get("category") || "";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [listings, setListings] = useState<SerializedListing[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);

  // Resolve the ?category= param (may be a slug, e.g. from the homepage's
  // category row) against the loaded list so sidebar highlighting and the
  // breadcrumb — both keyed by id — work regardless of which form it came in.
  useEffect(() => {
    api.get<Category[]>("/categories").then((cats) => {
      setCategories(cats);
      if (initialCategoryParam) {
        const match = cats.find((c) => c.id === initialCategoryParam || c.slug === initialCategoryParam);
        if (match) setCategory(match.id);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchListings = useCallback(async (p: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("limit", String(limit));
    if (search) params.set("q", search);
    if (category) params.set("category", category);
    if (maxPrice) params.set("maxPrice", String(Number(maxPrice) * 100));
    try {
      const data = await api.get<SearchResult>(`/listings/search?${params}`);
      setListings(data.listings);
      setTotal(data.total);
      setPage(data.page);
    } catch { setListings([]); setTotal(0); }
    finally { setLoading(false); }
  }, [search, category, maxPrice, limit]);

  useEffect(() => { fetchListings(1); }, [fetchListings]);

  const handleSearch = (e: FormEvent) => { e.preventDefault(); fetchListings(1); };

  const totalPages = Math.ceil(total / limit);
  const activeFilterCount = [category, maxPrice].filter(Boolean).length;
  const selectedCategoryName = categories.find((c) => c.id === category)?.name;

  const clearAll = () => { setCategory(""); setMaxPrice(""); };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Marketplace</h1>
          <nav className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <Link href="/marketplace" className="hover:text-orange-600">Home</Link>
            {selectedCategoryName && (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-gray-900 font-medium">{selectedCategoryName}</span>
              </>
            )}
          </nav>
        </div>
        {user && (
          <Link href="/listings/new" className="inline-flex items-center gap-2 bg-orange-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-all shadow-sm hover:shadow-md active:scale-[0.98]">
            <Plus className="w-4 h-4" /> Create Listing
          </Link>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="lg:w-72 shrink-0">
          <button onClick={() => setShowFilters(!showFilters)} className="lg:hidden w-full mb-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">
            {showFilters ? <X className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
            {showFilters ? "Hide Filters" : "Filters"}
            {activeFilterCount > 0 && <span className="bg-orange-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{activeFilterCount}</span>}
          </button>

          <div className={`bg-white rounded-2xl border border-gray-100 p-5 lg:sticky lg:top-20 ${showFilters ? "block" : "hidden"} lg:block`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">Filters</h2>
              {activeFilterCount > 0 && <button onClick={clearAll} className="text-xs font-medium text-orange-600 hover:text-orange-700">Clear All</button>}
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Category</h3>
              <div className="space-y-0.5 max-h-80 overflow-y-auto pr-1">
                {buildCategoryTree(categories).map((t) => (
                  <Fragment key={t.parent.id}>
                    <CategoryRow name={t.parent.name} selected={category === t.parent.id} onClick={() => setCategory(category === t.parent.id ? "" : t.parent.id)} />
                    {t.children.map((c) => (
                      <CategoryRow key={c.id} name={c.name} indent selected={category === c.id} onClick={() => setCategory(category === c.id ? "" : c.id)} />
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Price Range</h3>
              <input
                type="range"
                min={0}
                max={MAX_PRICE_NPR}
                step={500}
                value={maxPrice || MAX_PRICE_NPR}
                onChange={(e) => setMaxPrice(e.target.value === String(MAX_PRICE_NPR) ? "" : e.target.value)}
                onMouseUp={() => fetchListings(1)}
                onTouchEnd={() => fetchListings(1)}
                className="w-full accent-orange-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>NPR 0</span>
                <span>{maxPrice ? `NPR ${Number(maxPrice).toLocaleString()}` : `NPR ${MAX_PRICE_NPR.toLocaleString()}+`}</span>
              </div>
            </div>

            <div className="rounded-xl bg-orange-600 text-white p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Shield className="w-4 h-4" />
                <p className="font-bold text-sm">Buyer Protection</p>
              </div>
              <p className="text-xs text-orange-100 mb-3">Every purchase on BazaarHub is escrow protected until you confirm delivery.</p>
              <Link href="/about" className="inline-block text-xs font-semibold bg-white text-orange-700 rounded-lg px-3 py-1.5">Learn More</Link>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <p className="text-sm text-gray-500">{loading ? "Loading…" : `Showing ${listings.length} of ${total} result${total !== 1 ? "s" : ""}`}</p>
            <form onSubmit={handleSearch} className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search listings..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm transition-shadow" />
            </form>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
                  <div className="aspect-[4/3] bg-gray-100" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                    <div className="h-5 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && listings.length === 0 && (
            <div className="text-center py-20">
              <PackageOpen className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No listings found</h3>
              <p className="text-sm text-gray-500 mb-6">{search || category || maxPrice ? "Try adjusting your filters" : "Be the first to create a listing"}</p>
              {!user && <Link href="/listings/new" className="inline-flex items-center gap-2 bg-orange-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors"><Plus className="w-4 h-4" /> Create Listing</Link>}
            </div>
          )}

          {/* Listing grid */}
          {!loading && listings.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((item, i) => (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Link href={`/listings/${item.id}`} className="group block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-orange-100 transition-all duration-200">
                      <div className="aspect-[4/3] bg-gradient-to-br from-orange-50 to-red-50 relative overflow-hidden">
                        {item.images.length > 0 ? (
                          <img src={`${API_BASE}/listings/${item.id}/images/${item.images[0]}`} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag className="w-12 h-12 text-orange-200 group-hover:scale-110 transition-transform duration-300" />
                          </div>
                        )}
                        {item.status === "sold" && (
                          <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">Sold</div>
                        )}
                        {item.status === "draft" && (
                          <div className="absolute top-2 left-2 bg-gray-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">Draft</div>
                        )}
                        {item.status === "active" && item.quantity <= 3 && item.quantity > 0 && (
                          <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">Only {item.quantity} left</div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 truncate group-hover:text-orange-600 transition-colors">{item.title}</h3>
                        <p className="text-xs text-gray-400 mt-1 truncate">{item.category || "General"}</p>
                        <div className="flex items-center justify-between mt-2.5">
                          <span className="text-lg font-bold text-gray-900">{formatPrice(item.priceMinorUnits)}</span>
                          {item.quantity > 0 && <span className="text-xs text-gray-400">Qty: {item.quantity}</span>}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-10">
                  <button onClick={() => fetchListings(page - 1)} disabled={page <= 1} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const start = Math.max(1, Math.min(page - 3, totalPages - 6));
                      const p = start + i;
                      if (p > totalPages) return null;
                      return (
                        <button key={p} onClick={() => fetchListings(p)} className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${p === page ? "bg-orange-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => fetchListings(page + 1)} disabled={page >= totalPages} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MarketplaceClient() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-gray-400">Loading...</div>}>
      <MarketplaceContent />
    </Suspense>
  );
}
