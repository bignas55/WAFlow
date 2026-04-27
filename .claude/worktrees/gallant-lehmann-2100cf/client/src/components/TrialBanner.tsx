import { useNavigate } from "react-router-dom";
import { Zap, X, AlertTriangle, Clock } from "lucide-react";
import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";

export function TrialBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const { data: status } = trpc.subscription.status.useQuery(undefined, {
    // Poll every 5 minutes — no need for real-time here
    refetchInterval: 5 * 60 * 1000,
    enabled: !!user && user.role !== "admin",
  });

  // Don't show for admins, paid users, or dismissed
  if (!user || user.role === "admin") return null;
  if (!status) return null;
  if (status.isPaid) return null;
  if (!status.isTrialActive) return null;
  if (dismissed) return null;

  const daysLeft = status.daysLeft ?? 0;
  const isUrgent = daysLeft <= 3;
  const isWarning = daysLeft <= 7;

  const bgClass = isUrgent
    ? "bg-red-900/60 border-red-500/40"
    : isWarning
    ? "bg-yellow-900/40 border-yellow-500/30"
    : "bg-[#25D366]/10 border-[#25D366]/30";

  const textClass = isUrgent
    ? "text-red-300"
    : isWarning
    ? "text-yellow-300"
    : "text-[#25D366]";

  const iconClass = isUrgent
    ? "text-red-400"
    : isWarning
    ? "text-yellow-400"
    : "text-[#25D366]";

  const Icon = isUrgent || isWarning ? AlertTriangle : Clock;

  const message = isUrgent
    ? daysLeft === 0
      ? "Your free trial ends today!"
      : `Only ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left on your free trial!`
    : `Free trial — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`;

  return (
    <div className={`flex items-center gap-3 px-4 py-2 border-b text-sm ${bgClass}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
      <span className={`flex-1 font-medium ${textClass}`}>{message}</span>
      <button
        onClick={() => navigate("/pricing")}
        className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20b857] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
      >
        <Zap className="w-3 h-3" />
        Upgrade Now
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
