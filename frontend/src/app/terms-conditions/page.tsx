export default function TermsConditionsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-6">Terms & Conditions</h1>
      <div className="prose prose-gray max-w-none space-y-4">
        <p className="text-gray-600">By using BazaarHub, you agree to these terms. This is a marketplace platform — all transactions are between buyers and sellers.</p>
        <h2 className="text-xl font-semibold text-gray-900">User Responsibility</h2>
        <ul className="list-disc list-inside text-gray-600">
          <li>Provide accurate information when creating listings</li>
          <li>Fulfill orders in a timely manner as a seller</li>
          <li>Inspect items promptly upon delivery as a buyer</li>
          <li>Not engage in fraud, listing prohibited items, or platform abuse</li>
        </ul>
        <h2 className="text-xl font-semibold text-gray-900">Escrow Terms</h2>
        <ul className="list-disc list-inside text-gray-600">
          <li>Funds are held by Stripe Connect until delivery confirmation</li>
          <li>A 2.5% escrow fee applies to completed sales</li>
          <li>Disputes are mediated by BazaarHub within 14 days</li>
          <li>Funds are released to the seller upon buyer confirmation</li>
        </ul>
        <h2 className="text-xl font-semibold text-gray-900">Limitation of Liability</h2>
        <p className="text-gray-600">BazaarHub acts as a platform and escrow agent. We are not responsible for item quality, shipping delays, or disputes between parties beyond escrow fund management.</p>
      </div>
    </div>
  );
}
