import { Link } from "react-router-dom";
import { MessageSquare, ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#080817] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#25D366] rounded-lg flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">WAFlow</span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-extrabold text-white mb-2">Terms of Service</h1>
        <p className="text-gray-500 mb-10">Last updated: {new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</p>

        <div className="prose prose-invert prose-gray max-w-none space-y-8 text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using WAFlow ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the Service. These terms apply to all users, including businesses, agencies, and individuals who register for a WAFlow account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
            <p>
              WAFlow provides an AI-powered WhatsApp automation platform that enables businesses to automate customer communication, appointment booking, and marketing via the WhatsApp messaging platform. The Service includes an AI receptionist, CRM tools, analytics, broadcast messaging, and related features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Account Registration</h2>
            <p>
              To use the Service, you must create an account with accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must immediately notify WAFlow of any unauthorized use of your account.
            </p>
            <p className="mt-3">
              You must be at least 18 years of age to create an account. By registering, you represent that all information you provide is truthful and accurate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. WhatsApp Compliance</h2>
            <p>
              By using WAFlow to send messages via WhatsApp, you agree to comply with WhatsApp's Terms of Service, Business Policy, and Commerce Policy at all times. You are solely responsible for ensuring your use of WhatsApp through our platform complies with all applicable WhatsApp policies.
            </p>
            <p className="mt-3">
              You must not use the Service to send spam, unsolicited messages, or to contact individuals who have not consented to receive messages from you. WAFlow provides opt-out management tools and you are required to honour all opt-out requests immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Prohibited Uses</h2>
            <p>You agree not to use WAFlow to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1.5 text-gray-400">
              <li>Send spam, bulk unsolicited messages, or engage in phishing</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on the intellectual property rights of others</li>
              <li>Transmit harmful, offensive, or illegal content</li>
              <li>Attempt to gain unauthorised access to any system or network</li>
              <li>Impersonate any person or entity</li>
              <li>Use the Service for any illegal or fraudulent purpose</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Payment and Billing</h2>
            <p>
              Paid plans are billed monthly or annually as selected. All prices are in South African Rand (ZAR) and exclude VAT unless stated otherwise. Payment is due at the start of each billing cycle. Failure to pay may result in suspension or termination of your account.
            </p>
            <p className="mt-3">
              You may cancel your subscription at any time. Cancellations take effect at the end of the current billing period. No refunds are provided for partial months.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Data and Privacy</h2>
            <p>
              Your use of the Service is also governed by our <Link to="/privacy" className="text-[#25D366] hover:underline">Privacy Policy</Link>. You retain ownership of all customer data you upload or generate through the Service. You grant WAFlow a limited licence to process this data solely to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Service Availability</h2>
            <p>
              WAFlow aims to maintain 99.5% uptime but does not guarantee uninterrupted access to the Service. Scheduled maintenance will be communicated in advance where possible. WAFlow is not liable for any losses arising from service interruptions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, WAFlow shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the Service. Our total liability in any matter arising out of or related to these terms is limited to the amount you paid us in the three months preceding the event giving rise to liability.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Termination</h2>
            <p>
              WAFlow reserves the right to suspend or terminate your account at any time for violation of these Terms, with or without notice. Upon termination, your right to use the Service will immediately cease. You may export your data prior to termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Changes to Terms</h2>
            <p>
              WAFlow may update these Terms at any time. We will notify registered users by email at least 14 days before material changes take effect. Continued use of the Service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the Republic of South Africa. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts of South Africa.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">13. Contact</h2>
            <p>
              For questions about these Terms, contact us at{" "}
              <a href="mailto:legal@waflow.co.za" className="text-[#25D366] hover:underline">legal@waflow.co.za</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
