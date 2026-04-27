import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MessageSquare, Eye, EyeOff, CheckCircle, ArrowRight, Building2, User, Mail, Lock, Phone,
  Rocket, Zap, Star, Building,
} from "lucide-react";
import { trpc } from "../lib/trpc";

const PERKS = [
  "14-day free trial — no credit card needed",
  "AI receptionist live in under 10 minutes",
  "Automated appointment booking & reminders",
  "CRM, analytics, broadcast campaigns included",
  "Cancel or upgrade anytime",
];

const PLANS = [
  {
    id: "trial",
    icon: Rocket,
    label: "Free Trial",
    price: "Free",
    note: "14 days",
    description: "Try everything, no card needed",
    color: "border-gray-700 hover:border-gray-500",
    activeColor: "border-[#25D366] bg-[#25D366]/10",
    iconColor: "text-gray-400",
    activeIconColor: "text-[#25D366]",
  },
  {
    id: "starter",
    icon: Star,
    label: "Starter",
    price: "R299",
    note: "/month",
    description: "Small businesses getting started",
    color: "border-gray-700 hover:border-blue-500/60",
    activeColor: "border-blue-500 bg-blue-500/10",
    iconColor: "text-gray-400",
    activeIconColor: "text-blue-400",
  },
  {
    id: "pro",
    icon: Zap,
    label: "Pro",
    price: "R699",
    note: "/month",
    description: "Growing teams & full features",
    badge: "Popular",
    color: "border-gray-700 hover:border-[#25D366]/60",
    activeColor: "border-[#25D366] bg-[#25D366]/10",
    iconColor: "text-gray-400",
    activeIconColor: "text-[#25D366]",
  },
  {
    id: "enterprise",
    icon: Building,
    label: "Enterprise",
    price: "Custom",
    note: "pricing",
    description: "Large teams, agencies & white-label",
    color: "border-gray-700 hover:border-purple-500/60",
    activeColor: "border-purple-500 bg-purple-500/10",
    iconColor: "text-gray-400",
    activeIconColor: "text-purple-400",
  },
];

export default function Register() {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState("trial");
  const [form, setForm] = useState({
    businessName: "",
    name: "",
    email: "",
    password: "",
    phone: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const registerMutation = trpc.auth.selfRegister.useMutation({
    onSuccess: (data) => {
      if (data.requiresVerification) {
        navigate(`/verify-email?email=${encodeURIComponent(data.email)}`);
      } else {
        window.location.href = "/onboarding";
      }
    },
    onError: (err) => {
      setError(err.message || "Registration failed. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    registerMutation.mutate({
      businessName: form.businessName,
      name: form.name,
      email: form.email,
      password: form.password,
      phone: form.phone || undefined,
    });
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const activePlan = PLANS.find(p => p.id === selectedPlan);

  return (
    <div className="min-h-screen bg-[#080817] flex">
      {/* Left — value prop */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gradient-to-br from-[#0d1d12] to-[#080817] border-r border-white/5 p-12">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-[#25D366] rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-xl">WAFlow</span>
        </Link>

        <div>
          <h2 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Start automating your<br />
            <span className="text-[#25D366]">WhatsApp business</span><br />
            today.
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            Join thousands of businesses that never miss a customer message.
          </p>
          <ul className="space-y-3">
            {PERKS.map(p => (
              <li key={p} className="flex items-center gap-3 text-gray-300">
                <CheckCircle className="w-5 h-5 text-[#25D366] shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Mock chat preview */}
        <div className="bg-[#0d1a0f] border border-[#25D366]/20 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-[#25D366]/20 rounded-full flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-[#25D366]" />
            </div>
            <div>
              <p className="text-white text-sm font-medium">Your AI Receptionist</p>
              <p className="text-green-400 text-xs">● Active 24/7</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-end">
              <div className="bg-[#25D366] text-black px-3 py-1.5 rounded-xl max-w-[80%]">
                What time do you open?
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-gray-800 text-gray-200 px-3 py-1.5 rounded-xl max-w-[80%]">
                We're open Mon–Sat 8am–6pm! Would you like to book an appointment? 😊
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — registration form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 bg-[#25D366] rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-xl">WAFlow</span>
          </div>

          <h1 className="text-3xl font-extrabold text-white mb-1">Create your account</h1>
          <p className="text-gray-400 mb-6">
            Start with a 14-day free trial.{" "}
            <Link to="/login" className="text-[#25D366] hover:underline">Sign in instead</Link>
          </p>

          {/* Plan selector */}
          <div className="mb-6">
            <p className="text-sm text-gray-400 mb-3 font-medium">Choose your plan</p>
            <div className="grid grid-cols-2 gap-2.5">
              {PLANS.map(plan => {
                const isActive = selectedPlan === plan.id;
                const Icon = plan.icon;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative text-left p-3.5 rounded-xl border transition-all ${
                      isActive ? plan.activeColor : plan.color + " bg-white/[0.02]"
                    }`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2 right-2 bg-[#25D366] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {plan.badge}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className={`w-4 h-4 ${isActive ? plan.activeIconColor : plan.iconColor}`} />
                      <span className={`text-sm font-semibold ${isActive ? "text-white" : "text-gray-300"}`}>
                        {plan.label}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 mb-0.5">
                      <span className={`text-base font-bold ${isActive ? "text-white" : "text-gray-400"}`}>
                        {plan.price}
                      </span>
                      <span className="text-gray-600 text-xs">{plan.note}</span>
                    </div>
                    <p className="text-gray-500 text-xs leading-snug">{plan.description}</p>
                  </button>
                );
              })}
            </div>
            {selectedPlan !== "trial" && (
              <p className="text-xs text-gray-600 mt-2 text-center">
                {selectedPlan === "enterprise"
                  ? "Our team will reach out after registration to set up your custom plan."
                  : "You'll start with a 14-day free trial, then be billed at the plan rate."}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Business name */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Business Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  required
                  value={form.businessName}
                  onChange={set("businessName")}
                  placeholder="Luxe Beauty Studio"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#25D366] transition"
                />
              </div>
            </div>

            {/* Full name */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Your Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  required
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Priya Naidoo"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#25D366] transition"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="you@yourbusiness.com"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#25D366] transition"
                />
              </div>
            </div>

            {/* WhatsApp phone (optional) */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                WhatsApp Number <span className="text-gray-600">(optional)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder="+27 82 000 0000"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#25D366] transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  placeholder="Minimum 8 characters"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-[#25D366] transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-black font-bold py-3.5 rounded-xl text-base transition shadow-lg shadow-green-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {registerMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Creating your account…
                </span>
              ) : (
                <>
                  {selectedPlan === "trial" ? "Start Free Trial" : `Get Started with ${activePlan?.label}`}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-xs text-gray-600 text-center leading-relaxed">
              By creating an account you agree to our{" "}
              <Link to="/terms" className="text-gray-400 hover:text-white">Terms of Service</Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-gray-400 hover:text-white">Privacy Policy</Link>.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
