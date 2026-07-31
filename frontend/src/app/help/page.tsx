import Link from "next/link";
import { Book, LifeBuoy, Shield } from "lucide-react";

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-6">Help Center</h1>
      <p className="text-lg text-gray-600 mb-12">Find guides, contact support, or learn about our platform.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Book, title: "Guides", text: "Step-by-step tutorials for buying, selling, and managing your account.", link: "/faq" },
          { icon: LifeBuoy, title: "Support", text: "Get help from our team via email or dispute ticket.", link: "/contact" },
          { icon: Shield, title: "Safety", text: "Learn how escrow protection keeps your transactions secure.", link: "/about" },
        ].map((h) => (
          <Link key={h.title} href={h.link} className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-100 transition-all">
            <h.icon className="w-6 h-6 text-orange-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">{h.title}</h3>
            <p className="text-sm text-gray-500">{h.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
