import { useState } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare, Bot, Calendar, Users, BarChart2, Zap,
  Star, ArrowRight, CheckCircle, Globe, Shield, Smartphone,
  Clock, TrendingUp, Award, RefreshCw, Bell, ChevronDown,
  ChevronUp, MessageCircle, Phone, Megaphone, Webhook,
} from "lucide-react";

// ── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Bot,
    title: "AI-Powered Receptionist",
    desc: "Your 24/7 WhatsApp receptionist answers questions, books appointments, and handles customer queries automatically — no human needed.",
    color: "text-green-400 bg-green-900/30",
  },
  {
    icon: Calendar,
    title: "Smart Appointment Booking",
    desc: "Customers book, reschedule, and cancel appointments directly via WhatsApp. Automatic reminders cut no-shows by up to 70%.",
    color: "text-blue-400 bg-blue-900/30",
  },
  {
    icon: Users,
    title: "Full CRM & Customer Memory",
    desc: "Every customer interaction is remembered. Tags, notes, satisfaction scores, loyalty points — a complete 360° customer profile.",
    color: "text-purple-400 bg-purple-900/30",
  },
  {
    icon: Megaphone,
    title: "Broadcast & Marketing",
    desc: "Send targeted WhatsApp campaigns to customer segments. Schedule broadcasts, create adverts, and track delivery rates.",
    color: "text-orange-400 bg-orange-900/30",
  },
  {
    icon: TrendingUp,
    title: "Analytics & Insights",
    desc: "Real-time dashboards show conversation volumes, staff performance, booking trends, and customer satisfaction scores.",
    color: "text-yellow-400 bg-yellow-900/30",
  },
  {
    icon: Webhook,
    title: "Webhooks & Integrations",
    desc: "Connect WAFlow to your existing tools via outbound webhooks. Events push to Zapier, Make, your CRM, or any custom endpoint.",
    color: "text-pink-400 bg-pink-900/30",
  },
  {
    icon: Award,
    title: "Loyalty Program",
    desc: "Reward repeat customers with points and tier badges. Bronze, Silver, and Gold tiers keep customers coming back.",
    color: "text-amber-400 bg-amber-900/30",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    desc: "HMAC-signed webhooks, 2FA, full audit logs, rate limiting, GDPR-compliant opt-out management. Security first.",
    color: "text-teal-400 bg-teal-900/30",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Connect Your WhatsApp",
    desc: "Scan a QR code to connect your WhatsApp Business number — takes under 2 minutes. Or use the Meta Business API for enterprise scale.",
  },
  {
    step: "02",
    title: "Train Your AI Receptionist",
    desc: "Add your business FAQs, services, and pricing to the knowledge base. The AI learns your business and answers in your tone.",
  },
  {
    step: "03",
    title: "Go Live & Automate",
    desc: "Customers message your WhatsApp number and get instant, intelligent replies. Bookings, queries, and follow-ups — all automated.",
  },
];

const TESTIMONIALS = [
  {
    name: "Priya Naidoo",
    role: "Owner, Luxe Beauty Studio",
    body: "WAFlow cut our no-shows by 65% in the first month. The AI handles all booking confirmations while I focus on my clients.",
    rating: 5,
  },
  {
    name: "Sipho Dlamini",
    role: "Manager, DriveRight Auto",
    body: "Our customers love getting instant WhatsApp replies at 2am. It's like having a full-time receptionist for the price of a coffee a day.",
    rating: 5,
  },
  {
    name: "Aisha Mokoena",
    role: "Director, WellnessHub",
    body: "The broadcast feature alone paid for itself. We ran a promotion, sent 2,000 WhatsApp messages, and were fully booked in 48 hours.",
    rating: 5,
  },
];

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "R0",
    period: "/month",
    desc: "Try WAFlow with no commitment.",
    messages: "500 messages/mo",
    features: ["1 WhatsApp number", "AI receptionist", "Appointment booking", "Basic analytics", "Email support"],
    cta: "Start Free",
    highlight: false,
  },
  {
    key: "starter",
    name: "Starter",
    price: "R299",
    period: "/month",
    desc: "Perfect for small businesses.",
    messages: "2,000 messages/mo",
    features: ["1 WhatsApp number", "AI receptionist + custom training", "Appointment booking + reminders", "CRM & customer memory", "Broadcast campaigns", "Loyalty program", "Priority support"],
    cta: "Get Started",
    highlight: true,
  },
  {
    key: "pro",
    name: "Pro",
    price: "R699",
    period: "/month",
    desc: "For growing businesses.",
    messages: "10,000 messages/mo",
    features: ["Multiple staff accounts", "Everything in Starter", "SMS fallback delivery", "Outbound webhooks", "Custom CRM fields", "Bulk appointment actions", "Advanced analytics", "Staff performance reports", "Dedicated onboarding"],
    cta: "Go Pro",
    highlight: false,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For large-scale deployments.",
    messages: "Unlimited messages",
    features: ["Unlimited tenants & numbers", "White-label branding", "Meta Business API", "SLA guarantee", "Custom integrations", "Dedicated account manager", "On-premise option"],
    cta: "Contact Us",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "Do I need a Meta Business Account?",
    a: "No. WAFlow works with a regular WhatsApp number via QR scan — no Meta approval needed. For high-volume (10k+ messages/day), we support the Meta Business API.",
  },
  {
    q: "Can the AI respond in multiple languages?",
    a: "Yes. WAFlow auto-detects customer language and responds accordingly. Afrikaans, Zulu, Portuguese, French, Arabic — over 50 languages supported.",
  },
  {
    q: "What happens when the AI can't answer?",
    a: "The AI escalates to a human agent and notifies your staff via the live inbox. You take over the conversation without the customer knowing.",
  },
  {
    q: "Is customer data safe?",
    a: "Absolutely. All data is encrypted at rest and in transit. We provide GDPR-compliant opt-out management, full audit logs, and 2FA for all staff accounts.",
  },
  {
    q: "Can I run it for multiple businesses?",
    a: "Yes. The admin panel supports multi-tenant deployments. Manage multiple businesses from a single dashboard — ideal for agencies.",
  },
  {
    q: "What's included in the free plan?",
    a: "Everything you need to get started: AI receptionist, appointment booking, basic analytics, and 500 messages per month. No credit card required.",
  },
];

// ── Components ────────────────────────────────────────────────────────────────

function NavBar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a1a]/90 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[#25D366] rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">WAFlow</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#how-it-works" className="hover:text-white transition">How It Works</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
          <a href="#faq" className="hover:text-white transition">FAQ</a>
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm text-gray-400 hover:text-white transition px-3 py-2">
            Sign In
          </Link>
          <Link
            to="/register"
            className="bg-[#25D366] hover:bg-[#1fb855] text-black font-semibold text-sm px-4 py-2 rounded-lg transition shadow-lg shadow-green-500/20"
          >
            Start Free →
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setMobileOpen(o => !o)} className="md:hidden text-gray-400 hover:text-white">
          <div className="space-y-1">
            <span className="block w-6 h-0.5 bg-current" />
            <span className="block w-6 h-0.5 bg-current" />
            <span className="block w-6 h-0.5 bg-current" />
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#0d0d22] border-t border-white/5 px-4 py-4 space-y-3">
          {["#features", "#how-it-works", "#pricing", "#faq"].map(href => (
            <a key={href} href={href} onClick={() => setMobileOpen(false)}
              className="block text-gray-300 hover:text-white text-sm py-1.5 capitalize">
              {href.replace("#", "").replace("-", " ")}
            </a>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <Link to="/login" className="text-center text-sm text-gray-400 border border-white/10 rounded-lg py-2">Sign In</Link>
            <Link to="/register" className="text-center bg-[#25D366] text-black font-semibold text-sm rounded-lg py-2">Start Free</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative pt-32 pb-24 px-4 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#25D366]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 left-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto text-center relative">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/20 rounded-full px-4 py-1.5 text-sm text-[#25D366] mb-6">
          <Zap className="w-3.5 h-3.5" />
          AI-Powered WhatsApp Automation
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-white leading-[1.08] tracking-tight mb-6">
          Your Business Never
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#25D366] via-green-400 to-emerald-300">
            Sleeps Again
          </span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          WAFlow turns your WhatsApp number into a fully automated AI receptionist.
          Book appointments, answer questions, run campaigns, and delight customers — 24/7, automatically.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/register"
            className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-black font-bold px-8 py-4 rounded-xl text-lg transition shadow-2xl shadow-green-500/25 hover:shadow-green-500/40"
          >
            Start Free — No Credit Card <ArrowRight className="w-5 h-5" />
          </Link>
          <a
            href="#how-it-works"
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-semibold px-8 py-4 rounded-xl text-lg transition"
          >
            See How It Works
          </a>
        </div>

        <p className="mt-5 text-sm text-gray-500">Free plan forever · No setup fees · Cancel anytime</p>

        {/* Hero visual — mock chat UI */}
        <div className="mt-16 relative max-w-sm mx-auto">
          <div className="bg-[#128C7E] rounded-t-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-semibold text-sm">Luxe Beauty Studio</p>
              <p className="text-green-200 text-xs">Online · AI Receptionist</p>
            </div>
          </div>
          <div className="bg-[#0d1117] rounded-b-2xl p-4 space-y-3 border border-white/10 text-left">
            {[
              { from: "customer", text: "Hi! Do you have availability for a facial this Saturday?" },
              { from: "bot", text: "Hi Priya! 😊 We have openings at 10:00am, 1:00pm and 3:30pm this Saturday. Which would you prefer?" },
              { from: "customer", text: "3:30pm works great!" },
              { from: "bot", text: "✅ Perfect! I've booked your 60-min Hydration Facial for Saturday at 3:30pm. You'll receive a reminder 24hrs before. See you then! 💚" },
            ].map((msg, i) => (
              <div key={i} className={`flex ${msg.from === "customer" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                  msg.from === "customer"
                    ? "bg-[#25D366] text-black"
                    : "bg-gray-800 text-gray-100"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          {/* Floating badge */}
          <div className="absolute -right-4 -top-4 bg-[#25D366] text-black text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
            Booked automatically ✓
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsBar() {
  const stats = [
    { value: "10,000+", label: "Businesses using WAFlow" },
    { value: "50M+", label: "WhatsApp messages automated" },
    { value: "70%", label: "Reduction in no-shows" },
    { value: "24/7", label: "Always-on AI receptionist" },
  ];
  return (
    <section className="border-y border-white/5 bg-white/[0.02] py-10">
      <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <p className="text-3xl font-extrabold text-white">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Everything Your Business Needs</h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            From the first "Hi" to a loyal repeat customer — WAFlow handles every step.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 hover:border-[#25D366]/30 hover:bg-white/[0.05] transition group">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-white font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 px-4 bg-white/[0.02] border-y border-white/5">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Up and Running in 10 Minutes</h2>
          <p className="text-gray-400 text-lg">No technical skills required. Seriously.</p>
        </div>
        <div className="space-y-10">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={i} className="flex gap-6 items-start">
              <div className="shrink-0 w-16 h-16 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center">
                <span className="text-[#25D366] font-black text-xl">{step.step}</span>
              </div>
              <div className="pt-1">
                <h3 className="text-white font-semibold text-xl mb-2">{step.title}</h3>
                <p className="text-gray-400 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-bold text-white mb-4">Loved by Businesses Across Africa</h2>
          <p className="text-gray-400">Real results from real WAFlow customers.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/8 rounded-2xl p-6">
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-gray-300 text-sm leading-relaxed mb-5">"{t.body}"</p>
              <div>
                <p className="text-white font-semibold text-sm">{t.name}</p>
                <p className="text-gray-500 text-xs">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-4 bg-white/[0.02] border-y border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
          <p className="text-gray-400 text-lg">Start free. Scale as you grow. No surprises.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {PLANS.map(plan => (
            <div key={plan.key} className={`rounded-2xl p-6 border flex flex-col ${
              plan.highlight
                ? "bg-[#25D366]/5 border-[#25D366]/40 ring-1 ring-[#25D366]/30 relative"
                : "bg-white/[0.03] border-white/8"
            }`}>
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#25D366] text-black text-xs font-bold px-4 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              <div className="mb-4">
                <p className="text-white font-bold text-lg">{plan.name}</p>
                <p className="text-gray-500 text-sm">{plan.desc}</p>
              </div>
              <div className="mb-4">
                <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                <span className="text-gray-500 text-sm">{plan.period}</span>
              </div>
              <p className="text-[#25D366] text-sm font-medium mb-5">{plan.messages}</p>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <CheckCircle className="w-4 h-4 text-[#25D366] shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to={plan.key === "enterprise" ? "mailto:hello@waflow.co.za" : "/register"}
                className={`w-full text-center py-2.5 rounded-xl font-semibold text-sm transition ${
                  plan.highlight
                    ? "bg-[#25D366] hover:bg-[#1fb855] text-black"
                    : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-gray-500 text-sm mt-8">All prices in ZAR. VAT excluded. Annual plans get 2 months free.</p>
      </div>
    </section>
  );
}

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" className="py-24 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-bold text-white mb-4">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left text-white font-medium hover:bg-white/[0.03] transition"
              >
                <span>{faq.q}</span>
                {open === i ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>
              {open === i && (
                <div className="px-5 pb-4 text-gray-400 text-sm leading-relaxed border-t border-white/5 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <div className="bg-gradient-to-br from-[#25D366]/10 to-blue-500/5 border border-[#25D366]/20 rounded-3xl p-12">
          <div className="w-16 h-16 bg-[#25D366] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-green-500/30">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Ready to Automate Your Business?
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            Join thousands of businesses that never miss a customer message again.
            Get started for free — no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-black font-bold px-8 py-4 rounded-xl text-lg transition shadow-2xl shadow-green-500/25"
            >
              Start Free Today <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-semibold px-8 py-4 rounded-xl text-lg transition"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-[#25D366] rounded-lg flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold">WAFlow</span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed">
              The AI WhatsApp receptionist platform built for modern African businesses.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Product</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#features" className="hover:text-gray-300 transition">Features</a></li>
              <li><a href="#pricing" className="hover:text-gray-300 transition">Pricing</a></li>
              <li><a href="#how-it-works" className="hover:text-gray-300 transition">How It Works</a></li>
              <li><Link to="/register" className="hover:text-gray-300 transition">Get Started</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Legal</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link to="/terms" className="hover:text-gray-300 transition">Terms of Service</Link></li>
              <li><Link to="/privacy" className="hover:text-gray-300 transition">Privacy Policy</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Contact</p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="mailto:hello@waflow.co.za" className="hover:text-gray-300 transition">hello@waflow.co.za</a></li>
              <li><a href="https://wa.me/27000000000" className="hover:text-gray-300 transition">WhatsApp Support</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-gray-600 text-sm">© {new Date().getFullYear()} WAFlow. All rights reserved.</p>
          <p className="text-gray-600 text-sm">Made with 💚 in South Africa</p>
        </div>
      </div>
    </footer>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080817] text-white">
      <NavBar />
      <main>
        <HeroSection />
        <StatsBar />
        <FeaturesSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
