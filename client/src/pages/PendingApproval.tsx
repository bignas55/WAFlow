/**
 * Pending Admin Approval Page
 * Shows after signup — user must wait for admin approval before they can login
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Clock, MessageSquare, CheckCircle } from "lucide-react";

export default function PendingApproval() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "your email";
  const [seconds, setSeconds] = useState(0);

  // Auto-refresh login status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleTryLogin = () => {
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Card */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center border border-blue-500/30 animate-pulse">
                <Clock className="w-8 h-8 text-blue-400" />
              </div>
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-bold text-white mb-2">Signup Submitted!</h1>
          <p className="text-slate-400 mb-6">
            Your account is awaiting admin approval. This usually takes less than an hour.
          </p>

          {/* Email Display */}
          <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4 mb-6">
            <p className="text-sm text-slate-400 mb-1">Registered email</p>
            <p className="text-white font-mono text-sm break-all">{email}</p>
          </div>

          {/* What Happens Next */}
          <div className="space-y-3 mb-6 text-left">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-medium">We received your signup</p>
                <p className="text-slate-400 text-sm">Your information has been securely stored</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Clock className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-medium">Awaiting admin approval</p>
                <p className="text-slate-400 text-sm">Your account is being reviewed by our admin team</p>
              </div>
            </div>
            <div className="flex gap-3">
              <MessageSquare className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5 opacity-50" />
              <div>
                <p className="text-white font-medium">Ready to login</p>
                <p className="text-slate-400 text-sm">Once approved, you can immediately start using WAFlow</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={handleTryLogin}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors mb-3"
          >
            Check Login Status
          </button>

          {/* Info */}
          <p className="text-xs text-slate-500">
            🔔 Refresh the page to check if your account has been approved. You'll be able to login once approved.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-slate-400 text-sm">
            Have questions?{" "}
            <a href="mailto:support@waflow.co.za" className="text-blue-400 hover:text-blue-300 font-medium">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
