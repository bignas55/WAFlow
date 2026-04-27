import { useNavigate } from "react-router-dom";
import { Lock, Zap, Clock, AlertTriangle, ArrowRight, MessageSquare } from "lucide-react";
import { trpc } from "../lib/trpc";

export default function UpgradeRequired() {
  const navigate = useNavigate();

  const { data: status } = trpc.subscription.status.useQuery();

  const isSuspended = status?.isSuspended;
  const isExpired = status?.isTrialExpired;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
          isSuspended ? "bg-red-500/15" : "bg-yellow-500/15"
        }`}>
          {isSuspended ? (
            <AlertTriangle className="w-9 h-9 text-red-400" />
          ) : (
            <Lock className="w-9 h-9 text-yellow-400" />
          )}
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-white mb-3">
          {isSuspended ? "Account Suspended" : "Your Free Trial Has Ended"}
        </h1>

        {/* Subtext */}
        <p className="text-gray-400 mb-8 leading-relaxed">
          {isSuspended
            ? "Your account has been suspended. Please contact support or upgrade your plan to restore access."
            : "Your 14-day free trial is over. Upgrade to Pro to keep your AI receptionist running, your bookings flowing, and your customers happy."}
        </p>

        {/* What they lose / gain */}
        {!isSuspended && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-8 text-left">
            <p className="text-gray-400 text-sm mb-4 font-medium">Unlock everything with Pro:</p>
            <ul className="space-y-3">
              {[
                { icon: <MessageSquare className="w-4 h-4 text-[#25D366]" />, text: "5,000 messages/month" },
                { icon: <Zap className="w-4 h-4 text-[#25D366]" />, text: "AI receptionist with custom persona" },
                { icon: <Clock className="w-4 h-4 text-[#25D366]" />, text: "Advanced appointment scheduling" },
                { icon: <Zap className="w-4 h-4 text-[#25D366]" />, text: "Broadcast campaigns & analytics" },
              ].map(({ icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-gray-300">
                  {icon}
                  {text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-3">
          {isSuspended ? (
            <a
              href="mailto:support@waflow.co.za"
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#25D366] hover:bg-[#20b857] text-white font-semibold transition-colors"
            >
              Contact Support
              <ArrowRight className="w-4 h-4" />
            </a>
          ) : (
            <button
              onClick={() => navigate("/pricing")}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#25D366] hover:bg-[#20b857] text-white font-semibold transition-colors"
            >
              <Zap className="w-4 h-4" />
              Upgrade to Pro — R699/month
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => navigate("/pricing")}
            className="w-full py-3 px-5 rounded-xl border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white text-sm transition-colors"
          >
            View All Plans
          </button>
        </div>

        {/* Support link */}
        <p className="text-gray-600 text-xs mt-6">
          Need help?{" "}
          <a href="mailto:support@waflow.co.za" className="text-[#25D366] hover:underline">
            support@waflow.co.za
          </a>
        </p>
      </div>
    </div>
  );
}
