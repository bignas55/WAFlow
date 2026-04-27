import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Zap, Building2, Rocket, ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";

const PLAN_FEATURES = {
  trial: [
    "500 messages/month",
    "1 WhatsApp number",
    "AI receptionist",
    "Appointment booking",
    "Basic CRM",
    "Knowledge base (5 articles)",
  ],
  starter: [
    "2,000 messages/month",
    "2 WhatsApp numbers",
    "AI receptionist",
    "Appointment booking",
    "Full CRM",
    "Knowledge base (20 articles)",
    "Basic analytics",
  ],
  pro: [
    "5,000 messages/month",
    "3 WhatsApp numbers",
    "AI receptionist + custom persona",
    "Advanced appointment scheduling",
    "Full CRM + customer profiles",
    "Unlimited knowledge base",
    "Broadcast campaigns",
    "Staff management",
    "Analytics & reporting",
    "Loyalty programme",
    "Priority support",
  ],
  enterprise: [
    "Unlimited messages",
    "Unlimited WhatsApp numbers",
    "Everything in Pro",
    "Custom AI model integration",
    "Dedicated account manager",
    "Custom branding",
    "SLA guarantee",
    "API access",
    "White-label option",
    "Custom integrations",
  ],
};

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{
    easypayNumber?: string;
    reference?: string;
    amountZar?: number;
    isEnterprise?: boolean;
    message?: string;
    contactEmail?: string;
  } | null>(null);

  const { data: status } = trpc.subscription.status.useQuery(undefined, {
    enabled: !!user,
  });

  const initPayment = trpc.subscription.initPayment.useMutation({
    onSuccess: (data) => {
      setPaymentInfo(data);
      setLoadingPlan(null);
    },
    onError: () => {
      setLoadingPlan(null);
    },
  });

  const handleUpgrade = (plan: "pro" | "enterprise") => {
    if (!user) {
      navigate("/register");
      return;
    }
    setLoadingPlan(plan);
    setPaymentInfo(null);
    initPayment.mutate({ plan, billingCycle });
  };

  const yearlyDiscount = Math.round((1 - (7990 / (799 * 12))) * 100);

  return (
    <div className="min-h-screen bg-gray-950 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-3">Choose Your Plan</h1>
            <p className="text-gray-400 max-w-xl mx-auto">
              Start with a free 14-day trial. No credit card required. Upgrade anytime.
            </p>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  billingCycle === "monthly"
                    ? "bg-[#25D366] text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  billingCycle === "yearly"
                    ? "bg-[#25D366] text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Yearly
                <span className="bg-yellow-500/20 text-yellow-400 text-xs px-1.5 py-0.5 rounded">
                  Save {yearlyDiscount}%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Current status banner */}
        {status && (
          <div className={`mb-8 rounded-xl border p-4 text-center text-sm ${
            status.isPaid
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : status.isTrialActive
              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}>
            {status.isPaid && `You're on the ${status.plan?.toUpperCase()} plan — active until ${status.planExpiresAt ? new Date(status.planExpiresAt).toLocaleDateString() : "renewal"}`}
            {status.isTrialActive && `Free trial active — ${status.daysLeft} day${status.daysLeft !== 1 ? "s" : ""} remaining`}
            {status.isTrialExpired && "Your trial has ended. Upgrade to continue using WAFlow."}
          </div>
        )}

        {/* Payment info card */}
        {paymentInfo && (
          <div className="mb-8 rounded-xl border border-[#25D366]/40 bg-[#25D366]/5 p-6">
            {paymentInfo.isEnterprise ? (
              <div className="text-center">
                <Building2 className="w-10 h-10 text-[#25D366] mx-auto mb-3" />
                <h3 className="text-white font-semibold text-lg mb-2">Enterprise Enquiry Received</h3>
                <p className="text-gray-400 mb-3">{paymentInfo.message}</p>
                <p className="text-sm text-gray-500">
                  Email us directly at{" "}
                  <a href={`mailto:${paymentInfo.contactEmail}`} className="text-[#25D366] hover:underline">
                    {paymentInfo.contactEmail}
                  </a>
                </p>
              </div>
            ) : (
              <div className="text-center">
                <Zap className="w-10 h-10 text-[#25D366] mx-auto mb-3" />
                <h3 className="text-white font-semibold text-lg mb-2">Payment Reference Generated</h3>
                <p className="text-gray-400 mb-4">Use the details below to complete your payment via Easypay</p>
                <div className="bg-gray-900 rounded-lg p-4 max-w-sm mx-auto space-y-3">
                  {paymentInfo.easypayNumber && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Easypay Number</p>
                      <p className="text-2xl font-mono font-bold text-[#25D366] tracking-widest">
                        {paymentInfo.easypayNumber}
                      </p>
                    </div>
                  )}
                  {paymentInfo.reference && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Reference</p>
                      <p className="text-sm font-mono text-white">{paymentInfo.reference}</p>
                    </div>
                  )}
                  {paymentInfo.amountZar && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Amount</p>
                      <p className="text-lg font-semibold text-white">
                        R{(paymentInfo.amountZar / 100).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-4">
                  Pay at any Shoprite, Checkers, Pick n Pay, or online via Easypay.{" "}
                  <a
                    href="https://www.easypay.co.za"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#25D366] hover:underline inline-flex items-center gap-1"
                  >
                    Learn more <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Your account will be activated automatically once payment is confirmed.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Free Trial */}
          <PlanCard
            icon={<Rocket className="w-5 h-5" />}
            title="Free Trial"
            price={null}
            priceNote="14 days free"
            description="No credit card required"
            features={PLAN_FEATURES.trial}
            cta={status?.isTrialActive ? "Current Plan" : status?.isPaid ? "Trial (expired)" : "Start Free Trial"}
            ctaDisabled={status?.isTrialActive || status?.isPaid}
            ctaVariant="outline"
            onCta={() => navigate("/register")}
            highlighted={false}
          />

          {/* Starter */}
          <PlanCard
            icon={<Zap className="w-5 h-5" />}
            title="Starter"
            price={billingCycle === "monthly" ? "R399" : "R3,990"}
            priceNote={billingCycle === "monthly" ? "/month" : "/year"}
            description="For growing businesses"
            features={PLAN_FEATURES.starter}
            cta={
              loadingPlan === "starter"
                ? "Generating..."
                : status?.isPaid && status.plan === "starter"
                ? "Current Plan"
                : "Upgrade to Starter"
            }
            ctaDisabled={loadingPlan === "starter" || (status?.isPaid && status.plan === "starter")}
            ctaVariant="primary"
            onCta={() => handleUpgrade("starter" as any)}
            highlighted={false}
            loading={loadingPlan === "starter"}
          />

          {/* Pro */}
          <PlanCard
            icon={<Zap className="w-5 h-5" />}
            title="Pro"
            price={billingCycle === "monthly" ? "R799" : "R7,990"}
            priceNote={billingCycle === "monthly" ? "/month" : "/year"}
            badge="Most Popular"
            description="Everything you need to scale"
            features={PLAN_FEATURES.pro}
            cta={
              loadingPlan === "pro"
                ? "Generating..."
                : status?.isPaid && status.plan === "pro"
                ? "Current Plan"
                : "Upgrade to Pro"
            }
            ctaDisabled={loadingPlan === "pro" || (status?.isPaid && status.plan === "pro")}
            ctaVariant="primary"
            onCta={() => handleUpgrade("pro")}
            highlighted={true}
            loading={loadingPlan === "pro"}
          />

          {/* Enterprise */}
          <PlanCard
            icon={<Building2 className="w-5 h-5" />}
            title="Enterprise"
            price={null}
            priceNote="Custom pricing"
            description="For large teams & agencies"
            features={PLAN_FEATURES.enterprise}
            cta={
              loadingPlan === "enterprise"
                ? "Sending..."
                : "Contact Sales"
            }
            ctaDisabled={loadingPlan === "enterprise"}
            ctaVariant="outline"
            onCta={() => handleUpgrade("enterprise")}
            highlighted={false}
            loading={loadingPlan === "enterprise"}
          />
        </div>

        {/* FAQ / footer note */}
        <p className="text-center text-gray-600 text-sm mt-10">
          All plans include SSL encryption, 99.9% uptime SLA, and POPIA-compliant data handling.
          Questions? Email <a href="mailto:support@waflow.co.za" className="text-[#25D366] hover:underline">support@waflow.co.za</a>
        </p>
      </div>
    </div>
  );
}

interface PlanCardProps {
  icon: React.ReactNode;
  title: string;
  price: string | null;
  priceNote: string;
  badge?: string;
  description: string;
  features: string[];
  cta: string;
  ctaDisabled?: boolean;
  ctaVariant: "primary" | "outline";
  onCta: () => void;
  highlighted: boolean;
  loading?: boolean;
}

function PlanCard({
  icon, title, price, priceNote, badge, description,
  features, cta, ctaDisabled, ctaVariant, onCta, highlighted, loading,
}: PlanCardProps) {
  return (
    <div className={`relative rounded-2xl border p-6 flex flex-col ${
      highlighted
        ? "border-[#25D366] bg-[#25D366]/5 shadow-lg shadow-[#25D366]/10"
        : "border-gray-800 bg-gray-900"
    }`}>
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-[#25D366] text-white text-xs font-bold px-3 py-1 rounded-full">
            {badge}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          highlighted ? "bg-[#25D366]/20 text-[#25D366]" : "bg-gray-800 text-gray-400"
        }`}>
          {icon}
        </div>
        <h3 className="text-white font-semibold text-lg">{title}</h3>
      </div>

      <div className="mb-1">
        {price ? (
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white">{price}</span>
            <span className="text-gray-400 text-sm">{priceNote}</span>
          </div>
        ) : (
          <div className="text-2xl font-bold text-white">{priceNote}</div>
        )}
        <p className="text-gray-500 text-sm mt-1">{description}</p>
      </div>

      <ul className="mt-5 mb-6 space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
            <Check className="w-4 h-4 text-[#25D366] flex-shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      <button
        onClick={onCta}
        disabled={ctaDisabled}
        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
          ctaVariant === "primary"
            ? "bg-[#25D366] hover:bg-[#20b857] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            : "border border-gray-700 hover:border-[#25D366] text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {cta}
      </button>
    </div>
  );
}
