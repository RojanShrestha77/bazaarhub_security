export default function ReturnsPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-6">Returns Policy</h1>
      <div className="prose prose-gray max-w-none space-y-4">
        <p className="text-gray-600">BazaarHub escrow protects every purchase. If an item does not match its description or does not arrive, you are eligible for a full refund through our dispute resolution process.</p>
        <h2 className="text-xl font-semibold text-gray-900">Dispute Window</h2>
        <p className="text-gray-600">Buyers may raise a dispute within 14 days of payment. The seller is notified and asked to provide shipment evidence.</p>
        <h2 className="text-xl font-semibold text-gray-900">Resolution Timeline</h2>
        <ul className="list-disc list-inside text-gray-600 space-y-1">
          <li>Buyer raises dispute — both parties notified</li>
          <li>Seller has 5 days to respond with evidence</li>
          <li>Admin reviews and makes a final decision</li>
          <li>Funds released to appropriate party</li>
        </ul>
      </div>
    </div>
  );
}
