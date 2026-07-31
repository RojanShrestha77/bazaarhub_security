"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import Link from "next/link";
import { ShoppingBag, ShieldCheck, Truck, ChevronLeft, ChevronRight } from "lucide-react";

const SLIDES = [
  {
    image: "/hero-1.jpg",
    icon: ShoppingBag,
    title: "BAZAARHUB",
    subtitle: "Buy & Sell with Confidence",
    badgeLead: "Nepal's Trusted Online Marketplace",
    ctaLabel: "Browse Marketplace",
    ctaHref: "/marketplace",
  },
  {
    image: "/hero-2.jpg",
    icon: ShieldCheck,
    title: "VERIFIED & SECURE",
    subtitle: "Every seller vetted, every payment protected",
    badgeLead: "Tiered Verification for Every Seller",
    ctaLabel: "Start Selling",
    ctaHref: "/listings/new",
  },
  {
    image: "/hero-3.jpg",
    icon: Truck,
    title: "SAFE TO YOUR DOORSTEP",
    subtitle: "Funds released only when you confirm delivery",
    badgeLead: "Escrow-Protected Delivery",
    ctaLabel: "Shop Now",
    ctaHref: "/marketplace",
  },
];

const bgVariants: Variants = {
  enter:  { opacity: 0, scale: 1.06 },
  center: { opacity: 1, scale: 1,    transition: { duration: 1.1, ease: [0.25, 0.1, 0.25, 1] } },
  exit:   { opacity: 0, scale: 0.97, transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] } },
};

const centerVariants: Variants = {
  enter:  { opacity: 0, y: 40 },
  center: { opacity: 1, y: 0,   transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.25 } },
  exit:   { opacity: 0, y: -20, transition: { duration: 0.4 } },
};

const badgeVariants: Variants = {
  enter:  { opacity: 0, y: 20 },
  center: { opacity: 1, y: 0,  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.55 } },
  exit:   { opacity: 0,        transition: { duration: 0.3 } },
};

export function HeroBanner() {
  const [current, setCurrent] = useState(0);
  const [paused,  setPaused]  = useState(false);

  const next = useCallback(() => setCurrent(c => (c + 1) % SLIDES.length), []);
  const prev = useCallback(() => setCurrent(c => (c - 1 + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 5000);
    return () => clearInterval(id);
  }, [paused, next]);

  const slide = SLIDES[current];

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Background images */}
      <AnimatePresence mode="sync">
        <motion.div
          key={current}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${slide.image}')` }}
          variants={bgVariants}
          initial="enter"
          animate="center"
          exit="exit"
        />
      </AnimatePresence>

      {/* Brand-tinted overlays */}
      <div className="absolute inset-0 bg-orange-950/55" />
      <div className="absolute inset-0 bg-gradient-to-b from-orange-950/30 via-transparent to-orange-950/50" />

      {/* Left arrow */}
      <button
        onClick={prev}
        className="hidden md:flex absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-30 w-12 h-12 md:w-14 md:h-14 rounded-full items-center justify-center text-white transition-all duration-300 hover:bg-amber-400 hover:text-orange-900"
        style={{
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.20)",
        }}
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Right arrow */}
      <button
        onClick={next}
        className="hidden md:flex absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-30 w-12 h-12 md:w-14 md:h-14 rounded-full items-center justify-center text-white transition-all duration-300 hover:bg-amber-400 hover:text-orange-900"
        style={{
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: "1px solid rgba(255,255,255,0.20)",
        }}
        aria-label="Next slide"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            variants={centerVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <slide.icon className="w-9 h-9 text-white/90 mx-auto mb-3" />

            <h1
              className="text-white font-bold tracking-widest uppercase leading-none"
              style={{
                fontSize: "clamp(28px, 4.5vw, 72px)",
                textShadow: "0 2px 24px rgba(0,0,0,0.5)",
              }}
            >
              {slide.title}
            </h1>

            <p
              className="text-white/85 mt-2"
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontStyle: "italic",
                fontSize: "clamp(14px, 1.2vw, 20px)",
                fontWeight: 400,
                textShadow: "0 2px 12px rgba(0,0,0,0.5)",
              }}
            >
              {slide.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Explore — bottom-left */}
      <div className="absolute bottom-20 left-8 hidden md:flex items-center gap-4 z-20 animate-bounce">
        <span className="text-[10px] uppercase tracking-[0.2em] text-amber-300/60">Explore</span>
        <div className="h-12 w-px bg-gradient-to-b from-amber-300/60 to-transparent" />
      </div>

      {/* Bottom — badge + dots */}
      <div className="absolute bottom-8 inset-x-0 z-20 flex flex-col items-center gap-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            variants={badgeVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <Link
              href={slide.ctaHref}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium text-white transition-colors"
              style={{
                background: "rgba(30,30,42,0.55)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {slide.badgeLead}
              <span className="text-amber-300 font-semibold">{slide.ctaLabel}</span>
            </Link>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="transition-all duration-300"
              style={{
                width:        i === current ? 28 : 8,
                height:       8,
                borderRadius: 4,
                background:   i === current ? "#fbbf24" : "rgba(255,255,255,0.35)",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
