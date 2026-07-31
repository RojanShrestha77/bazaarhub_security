"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShoppingBag, ArrowRight, Shield, Star, RotateCcw, Headphones,
  ChevronRight, ChevronLeft, ChevronRight as ChevronRightIcon,
  Smartphone, Cpu, Laptop, Tv, Sofa, Shirt, Sparkles, Baby, Dumbbell, Car, BookOpen, ShoppingBasket, PawPrint, Package,
} from "lucide-react";
import { Hero } from "@/components/Hero";
import { api, API_BASE } from "@/lib/api";
import { formatPrice } from "@/types";
import type { SearchResult, Category } from "@/types";

const CATEGORY_ICONS: Record<string, typeof Package> = {
  "Mobiles & Tablets": Smartphone,
  "Electronics": Cpu,
  "Computers & Accessories": Laptop,
  "TV & Home Appliances": Tv,
  "Home & Living": Sofa,
  "Men's Fashion": Shirt,
  "Women's Fashion": Shirt,
  "Health & Beauty": Sparkles,
  "Babies, Kids & Toys": Baby,
  "Sports & Outdoors": Dumbbell,
  "Automotive & Motorbike": Car,
  "Books, Media & Stationery": BookOpen,
  "Groceries & Everyday": ShoppingBasket,
  "Pet Supplies": PawPrint,
};

const fadeUp = { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0, transition: { duration: 0.5 } } };
const stagger = { animate: { transition: { staggerChildren: 0.08 } } };

const TRUST_ITEMS = [
  { icon: Shield, title: "Escrow Protection", text: "Funds held until delivery" },
  { icon: Star, title: "Verified Sellers", text: "Tiered seller verification" },
  { icon: RotateCcw, title: "Easy Returns", text: "Clear return & refund process" },
  { icon: Headphones, title: "24/7 Support", text: "We're here when you need us" },
];

export default function HomeClient() {
  const [featured, setFeatured] = useState<SearchResult["listings"]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<SearchResult>("/listings/search?limit=8").then((data) => setFeatured(data.listings || [])).catch(() => {}).finally(() => setLoading(false));
    api.get<Category[]>("/categories").then((cats) => setCategories(cats.filter((c) => c.parentId === null))).catch(() => {});
  }, []);

  const scrollCategories = (dir: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  const big = featured[0];
  const smallA = featured[1];
  const smallB = featured[2];
  const hasBento = Boolean(big && smallA && smallB);

  return (
    <div>
      <Hero />

      {/* Categories */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-1">Explore Categories</h2>
              <p className="text-gray-500">Curated collections for every aspect of your life.</p>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={() => scrollCategories(-1)} className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors" aria-label="Scroll categories left">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => scrollCategories(1)} className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors" aria-label="Scroll categories right">
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div ref={scrollerRef} className="flex gap-6 overflow-x-auto pb-2 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.name] ?? Package;
              return (
                <Link key={cat.id} href={`/marketplace?category=${encodeURIComponent(cat.slug)}`} className="flex flex-col items-center gap-2.5 shrink-0 group">
                  <div className="w-20 h-20 rounded-full bg-gray-900 group-hover:bg-orange-600 flex items-center justify-center transition-colors">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <span className="text-sm font-medium text-gray-700 text-center max-w-[6.5rem]">{cat.name}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Trending listings */}
      {!loading && featured.length > 0 && (
        <section className="bg-gray-50 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Trending Now</h2>
              <Link href="/marketplace" className="inline-flex items-center gap-1 text-orange-600 font-medium hover:text-orange-700 text-sm">View All <ChevronRight className="w-4 h-4" /></Link>
            </div>

            {hasBento ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ListingCard item={big} big />
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-2 gap-6">
                    <ListingCard item={smallA} />
                    <ListingCard item={smallB} />
                  </div>
                  <Link href="/marketplace" className="flex-1 rounded-2xl bg-gray-900 text-white p-6 flex flex-col justify-center hover:bg-black transition-colors">
                    <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-orange-400 mb-2">Buyer Protection</span>
                    <h3 className="text-xl font-bold mb-1">Escrow-Protected Payments</h3>
                    <p className="text-sm text-gray-300 mb-3">Funds release only after you confirm delivery.</p>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-400">Browse Marketplace <ArrowRight className="w-4 h-4" /></span>
                  </Link>
                </div>
              </div>
            ) : (
              <motion.div initial="initial" whileInView="animate" viewport={{ once: true }} variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {featured.map((item) => (
                  <motion.div key={item.id} variants={fadeUp}>
                    <ListingCard item={item} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </section>
      )}

      {/* Trust badges */}
      <section className="bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {TRUST_ITEMS.map((item, i) => (
            <div key={item.title} className={`flex items-center gap-3 ${i > 0 ? "md:border-l md:border-gray-100 md:pl-6" : ""}`}>
              <item.icon className="w-6 h-6 text-orange-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-500">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-orange-600 to-red-700 py-16">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="max-w-3xl mx-auto text-center px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Start Selling Today</h2>
          <p className="text-orange-100 mb-8 text-lg">Join our community. Escrow-protected transactions for every sale.</p>
          <Link href="/register" className="inline-flex items-center gap-2 bg-white text-orange-700 px-8 py-3.5 rounded-xl font-semibold hover:bg-orange-50 transition-all shadow-lg hover:shadow-xl active:scale-[0.98]">
            Get Started <ArrowRight className="w-5 h-5" />
          </Link>
        </motion.div>
      </section>
    </div>
  );
}

function ListingCard({ item, big = false }: { item: SearchResult["listings"][number]; big?: boolean }) {
  return (
    <Link href={`/listings/${item.id}`} className={`block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-orange-100 transition-all group ${big ? "h-full" : ""}`}>
      <div className={`bg-gradient-to-br from-orange-50 to-red-50 relative overflow-hidden ${big ? "aspect-[4/3] lg:aspect-auto lg:h-[calc(100%-88px)]" : "aspect-[4/3]"}`}>
        {item.images.length > 0 ? (
          <img src={`${API_BASE}/listings/${item.id}/images/${item.images[0]}`} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className={`text-orange-200 group-hover:scale-110 transition-transform duration-300 ${big ? "w-16 h-16" : "w-10 h-10"}`} />
          </div>
        )}
        {item.status === "active" && item.quantity <= 3 && item.quantity > 0 && (
          <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">Only {item.quantity} left</div>
        )}
      </div>
      <div className="p-4">
        <h3 className={`font-semibold text-gray-900 truncate group-hover:text-orange-600 transition-colors ${big ? "text-lg" : "text-sm"}`}>{item.title}</h3>
        <div className="flex items-center justify-between mt-2">
          <span className={`font-bold text-orange-600 ${big ? "text-xl" : "text-base"}`}>{formatPrice(item.priceMinorUnits)}</span>
          <span className="text-xs text-gray-400 capitalize">{item.status}</span>
        </div>
      </div>
    </Link>
  );
}
