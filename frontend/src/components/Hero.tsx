"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, Truck, ShoppingBag, Headphones, Watch, Camera } from "lucide-react";

const TILES = [ShoppingBag, Headphones, Watch, Camera];

export function Hero() {
  return (
    <section className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-800 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <Zap className="w-3.5 h-3.5" /> Limited Summer Sale
          </span>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-5">
            Experience Marketplace
            <br />
            <span className="text-orange-600">Redefined.</span>
          </h1>

          <p className="text-gray-500 text-lg max-w-md mb-8">
            Discover great finds from real sellers, protected by escrow from checkout to delivery.
          </p>

          <div className="flex items-center gap-4">
            <Link href="/marketplace" className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors">
              Shop Now
            </Link>
            <Link href="/about" className="border border-gray-900 text-gray-900 px-6 py-3 rounded-lg font-semibold hover:bg-gray-900 hover:text-white transition-colors">
              Learn More
            </Link>
          </div>
        </motion.div>

        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 aspect-[4/3] shadow-2xl p-6 flex flex-col">
            <div className="flex items-center gap-1.5 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
              <div className="ml-3 flex-1 h-5 rounded-full bg-white/10 text-[10px] text-white/40 flex items-center px-3">bazaarhub.com/marketplace</div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
              {TILES.map((Icon, i) => (
                <div key={i} className="rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Icon className="w-8 h-8 text-orange-400/80" />
                </div>
              ))}
            </div>
          </div>

          <div className="absolute -bottom-6 left-6 bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900">Free Priority Shipping</p>
              <p className="text-[11px] text-gray-500">On all orders over Rs 5,000</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
