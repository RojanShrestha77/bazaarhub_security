import { Shield, Users, Award } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-6">About BazaarHub</h1>
      <div className="prose prose-gray max-w-none space-y-6">
        <p className="text-lg text-gray-600">BazaarHub is a secure online marketplace that connects buyers and sellers through a trusted escrow payment system. We prioritize safety, transparency, and fairness in every transaction.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-12">
          {[
            { icon: Shield, title: "Secure Escrow", text: "Payments held safely until delivery confirmed" },
            { icon: Users, title: "Verified Community", text: "Tiered seller verification builds trust" },
            { icon: Award, title: "Fair Resolution", text: "Mediation process for dispute resolution" },
          ].map((f) => (
            <div key={f.title} className="text-center p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <f.icon className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.text}</p>
            </div>
          ))}
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mt-12">Our Mission</h2>
        <p className="text-gray-600">To create the safest peer-to-peer marketplace by making escrow protection standard, not optional. Every transaction on BazaarHub is protected — buyers pay only when satisfied, sellers get paid when delivery is confirmed.</p>
      </div>
    </div>
  );
}
