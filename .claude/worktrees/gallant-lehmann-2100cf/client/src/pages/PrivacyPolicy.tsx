import { Link } from "react-router-dom";
import { MessageSquare, ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#080817] text-white">
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
        <h1 className="text-4xl font-extrabold text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-10">
          Last updated: {new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
        </p>

        <div className="space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Who We Are</h2>
            <p>
              WAFlow ("we", "us", "our") is an AI WhatsApp automation platform operated from South Africa.
              This Privacy Policy explains how we collect, use, and protect your personal information when
              you use our service at waflow.co.za and related applications.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect the following categories of information:</p>
            <ul className="list-disc pl-6 space-y-2 text-gray-400">
              <li><strong className="text-gray-200">Account Information:</strong> Name, email address, business name, and password when you register.</li>
              <li><strong className="text-gray-200">Business Data:</strong> Services, appointment records, and configurations you create within WAFlow.</li>
              <li><strong className="text-gray-200">Customer Data:</strong> WhatsApp message content, phone numbers, and names of your customers who interact with your AI receptionist.</li>
              <li><strong className="text-gray-200">Usage Data:</strong> How you use our platform, including pages visited, features used, and error logs.</li>
              <li><strong className="text-gray-200">Payment Information:</strong> Billing details are processed by our payment provider. We do not store raw card numbers.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-400">
              <li>To provide, maintain, and improve the WAFlow service</li>
              <li>To process payments and manage your subscription</li>
              <li>To send you service-related emails (account confirmation, invoices, security alerts)</li>
              <li>To generate analytics and reports within your account dashboard</li>
              <li>To detect and prevent fraud, abuse, and security incidents</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Customer Data You Process</h2>
            <p>
              When your customers interact with your WhatsApp AI receptionist, their messages and contact
              details are stored in WAFlow and attributed to your account. You are the data controller for
              this customer data. WAFlow acts as your data processor. You are responsible for:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5 text-gray-400">
              <li>Having a lawful basis to collect and process customer data via WhatsApp</li>
              <li>Providing your customers with appropriate privacy notices</li>
              <li>Honouring opt-out and data deletion requests from your customers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Data Sharing</h2>
            <p>We do not sell your personal data. We may share it only with:</p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5 text-gray-400">
              <li><strong className="text-gray-200">Service providers:</strong> Hosting, payment processing, email delivery, and analytics tools that operate under data processing agreements.</li>
              <li><strong className="text-gray-200">WhatsApp/Meta:</strong> When routing messages through the WhatsApp Business API (if enabled).</li>
              <li><strong className="text-gray-200">Legal authorities:</strong> When required by law or to protect the rights, property, or safety of WAFlow or others.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Security</h2>
            <p>
              We implement industry-standard security measures including encryption in transit (TLS), encrypted
              storage, access controls, two-factor authentication for staff, and regular security audits.
              Despite these measures, no system is completely secure. We will notify you promptly of any
              data breach that affects your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. Conversation and customer
              data is retained for 24 months by default, after which it is automatically deleted unless you
              configure a longer retention period. You may request earlier deletion at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Your Rights (POPIA)</h2>
            <p>Under South Africa's Protection of Personal Information Act (POPIA), you have the right to:</p>
            <ul className="list-disc pl-6 mt-3 space-y-1.5 text-gray-400">
              <li>Access the personal information we hold about you</li>
              <li>Correct inaccurate or incomplete personal information</li>
              <li>Request deletion of your personal information</li>
              <li>Object to the processing of your personal information</li>
              <li>Lodge a complaint with the Information Regulator</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@waflow.co.za" className="text-[#25D366] hover:underline">privacy@waflow.co.za</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Cookies</h2>
            <p>
              WAFlow uses only essential cookies required for authentication and session management.
              We do not use advertising cookies or third-party tracking. You may disable cookies in
              your browser, but this will prevent you from logging in.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Children's Privacy</h2>
            <p>
              WAFlow is not intended for use by anyone under the age of 18. We do not knowingly collect
              personal information from minors.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes
              via email at least 14 days before they take effect. Continued use of WAFlow after changes
              constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Contact Us</h2>
            <p>
              For privacy-related enquiries, contact our Information Officer at:{" "}
              <a href="mailto:privacy@waflow.co.za" className="text-[#25D366] hover:underline">privacy@waflow.co.za</a>
              <br />WAFlow · South Africa
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
