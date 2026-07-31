import { HelpCircle } from "lucide-react";

const faqs = [
  { q: "How does escrow work?", a: "When you buy an item, your payment is held in escrow. The seller ships the item. Once you confirm delivery, the funds are released to the seller. If there is an issue, you can raise a dispute." },
  { q: "How do I become a verified seller?", a: "Submit your government-issued ID via your Seller Dashboard → Verification. Our team reviews and approves it, unlocking higher selling limits and trust badges." },
  { q: "What happens if an item does not arrive?", a: "Raise a dispute within 14 days of payment. Our mediation team reviews the case and resolves in favor of the buyer if the seller cannot prove shipment." },
  { q: "Are there selling fees?", a: "A small escrow fee (2.5%) is deducted from the seller&apos;s payout upon successful delivery. No listing fees." },
  { q: "How do I reset my password?", a: "Click 'Forgot Password' on the login page. A reset link is sent to your registered email. Links expire after 15 minutes." },
  { q: "What is MFA?", a: "Multi-Factor Authentication adds a second layer of security. After enabling it in your profile, you will need both your password and a time-based code from your authenticator app." },
];

export default function FAQPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-2">Frequently Asked Questions</h1>
      <p className="text-gray-500 mb-12">Everything you need to know about using BazaarHub.</p>
      <div className="space-y-4">
        {faqs.map((faq) => (
          <details key={faq.q} className="group bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <summary className="flex items-center gap-3 px-6 py-4 cursor-pointer text-gray-900 font-medium hover:bg-gray-50 transition-colors">
              <HelpCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              {faq.q}
            </summary>
            <div className="px-6 pb-4 text-sm text-gray-600 leading-relaxed">{faq.a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
