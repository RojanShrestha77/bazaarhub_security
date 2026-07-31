import { Mail, MessageSquare, Shield } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-6">Contact Us</h1>
      <p className="text-lg text-gray-600 mb-12">Have a question, concern, or dispute? We&apos;re here to help.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Mail, title: "Email", text: "support@bazaarhub.com", desc: "General inquiries & support" },
          { icon: MessageSquare, title: "Disputes", text: "disputes@bazaarhub.com", desc: "Escrow dispute resolution" },
          { icon: Shield, title: "Security", text: "security@bazaarhub.com", desc: "Vulnerability disclosures" },
        ].map((c) => (
          <div key={c.title} className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <c.icon className="w-6 h-6 text-orange-600 mb-3" />
            <h3 className="font-semibold text-gray-900 mb-1">{c.title}</h3>
            <p className="text-sm text-orange-600 font-medium">{c.text}</p>
            <p className="text-xs text-gray-400 mt-1">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
