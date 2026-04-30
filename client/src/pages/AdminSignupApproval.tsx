/**
 * Admin Signup Approval Page
 * Shows pending user signups with approve/decline buttons
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { trpc } from "../lib/trpc";
import { AlertCircle, CheckCircle, XCircle, Loader } from "lucide-react";

export default function AdminSignupApproval() {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch pending signups
  const { data: pendingSignups, isLoading, refetch } = useQuery({
    queryKey: ["pendingSignups"],
    queryFn: () => trpc.auth.pendingSignups.query(),
  });

  // Approve signup mutation
  const approveMutation = useMutation({
    mutationFn: (userId: number) => trpc.auth.approveSignup.mutate({ userId }),
    onSuccess: () => {
      setMessage({ type: "success", text: "Signup approved! User can now login." });
      refetch();
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (error: any) => {
      setMessage({ type: "error", text: error.message || "Failed to approve signup" });
    },
  });

  // Decline signup mutation
  const declineMutation = useMutation({
    mutationFn: (userId: number) => trpc.auth.declineSignup.mutate({ userId }),
    onSuccess: () => {
      setMessage({ type: "success", text: "Signup declined and account deleted." });
      refetch();
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (error: any) => {
      setMessage({ type: "error", text: error.message || "Failed to decline signup" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="flex items-center justify-center h-96">
          <Loader className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      </div>
    );
  }

  const hasPending = pendingSignups && pendingSignups.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Signup Approvals</h1>
          <p className="text-slate-400">
            Review and approve new user signups. {hasPending ? `You have ${pendingSignups?.length} pending signup(s).` : "No pending signups."}
          </p>
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              message.type === "success"
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Pending Signups List */}
        {hasPending ? (
          <div className="space-y-4">
            {pendingSignups!.map((signup) => (
              <div
                key={signup.id}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Name</p>
                    <p className="text-white font-medium">{signup.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Email</p>
                    <p className="text-white font-mono text-sm break-all">{signup.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Signup Date</p>
                    <p className="text-white">
                      {signup.createdAt
                        ? new Date(signup.createdAt).toLocaleDateString("en-ZA", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Unknown"}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => approveMutation.mutate(signup.id)}
                    disabled={approveMutation.isPending || declineMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  >
                    {approveMutation.isPending ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => declineMutation.mutate(signup.id)}
                    disabled={approveMutation.isPending || declineMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  >
                    {declineMutation.isPending ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Declining...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        Decline
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4 opacity-50" />
            <p className="text-slate-400">No pending signups to review</p>
            <p className="text-slate-500 text-sm mt-2">All new users have been processed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
