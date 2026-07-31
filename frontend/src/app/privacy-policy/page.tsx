export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
      <div className="prose prose-gray max-w-none space-y-4">
        <p className="text-gray-600">Your privacy matters. BazaarHub collects only the data necessary to operate the marketplace and process escrow payments.</p>
        <h2 className="text-xl font-semibold text-gray-900">Data We Collect</h2>
        <ul className="list-disc list-inside text-gray-600">
          <li>Account information: email, hashed password, display name</li>
          <li>Transaction records: orders, disputes, escrow events</li>
          <li>Verification documents (encrypted at rest)</li>
          <li>Audit logs: IP addresses, action timestamps</li>
        </ul>
        <h2 className="text-xl font-semibold text-gray-900">Data We Do NOT Collect</h2>
        <ul className="list-disc list-inside text-gray-600">
          <li>Payment card numbers (processed by Stripe)</li>
          <li>Browsing history outside BazaarHub</li>
          <li>Location data beyond IP geolocation</li>
        </ul>
        <h2 className="text-xl font-semibold text-gray-900">Data Export & Deletion</h2>
        <p className="text-gray-600">You can export your data from your profile page. To request account deletion, contact support. Your data is retained for 90 days after deletion per audit requirements.</p>
      </div>
    </div>
  );
}
