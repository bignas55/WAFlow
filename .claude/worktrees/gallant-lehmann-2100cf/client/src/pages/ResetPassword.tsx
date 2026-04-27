import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Zap, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Mail } from "lucide-react";
import { trpc } from "../lib/trpc";

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-[#25D366] rounded-xl flex items-center justify-center">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <span className="text-white font-bold text-xl">WAFlow</span>
      </div>
      <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 p-7 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

// ── Step 1: Enter email to request reset ─────────────────────────────────────

function ForgotPasswordForm() {
  const [email, setEmail]     = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  if (submitted) {
    return (
      <div className="text-center">
        <CheckCircle2 className="w-12 h-12 text-[#25D366] mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
        <p className="text-gray-400 text-sm mb-6">
          If an account exists for <strong className="text-white">{email}</strong>, we've sent a password reset link. It expires in 1 hour.
        </p>
        <Link to="/login" className="text-[#25D366] text-sm hover:underline">Back to login</Link>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#25D366]/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Mail className="w-7 h-7 text-[#25D366]" />
        </div>
        <h2 className="text-xl font-bold text-white">Forgot your password?</h2>
        <p className="text-gray-400 text-sm mt-1">Enter your email and we'll send a reset link.</p>
      </div>

      <form onSubmit={e => { e.preventDefault(); mutation.mutate({ email }); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Email address</label>
          <input
            type="email" className="input w-full" placeholder="you@example.com"
            value={email} onChange={e => setEmail(e.target.value)}
            autoFocus required
          />
        </div>

        {mutation.isError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl p-3 border border-red-700/50">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Something went wrong. Please try again.
          </div>
        )}

        <button type="submit" disabled={!email || mutation.isPending}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Send Reset Link
        </button>

        <p className="text-center text-sm text-gray-500">
          <Link to="/login" className="text-[#25D366] hover:underline">Back to login</Link>
        </p>
      </form>
    </>
  );
}

// ── Step 2: Set new password ──────────────────────────────────────────────────

function SetNewPasswordForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [done,     setDone]     = useState(false);

  const { data: tokenData, isLoading: validating } = trpc.auth.validateResetToken.useQuery(
    { token }, { retry: false }
  );

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    },
  });

  const mismatch  = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && !resetMutation.isPending;

  if (validating) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 text-[#25D366] animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Verifying reset link…</p>
      </div>
    );
  }

  if (!tokenData?.valid) {
    return (
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">
          {tokenData?.reason === "expired" ? "Link Expired" : "Invalid Link"}
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          {tokenData?.reason === "expired"
            ? "This reset link has expired. Please request a new one."
            : "This reset link is not valid or has already been used."}
        </p>
        <Link to="/forgot-password" className="btn-primary px-6 inline-block">Request New Link</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="w-14 h-14 text-[#25D366] mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Password Reset!</h2>
        <p className="text-gray-400 text-sm mb-1">Your password has been updated successfully.</p>
        <p className="text-gray-500 text-xs">Redirecting to login…</p>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#25D366]/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Lock className="w-7 h-7 text-[#25D366]" />
        </div>
        <h2 className="text-xl font-bold text-white">Set New Password</h2>
        <p className="text-gray-400 text-sm mt-1">
          Resetting password for <span className="text-white">{tokenData.email}</span>
        </p>
      </div>

      <form onSubmit={e => { e.preventDefault(); if (canSubmit) resetMutation.mutate({ token, password }); }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">New password</label>
          <div className="relative">
            <input type={showPw ? "text" : "password"} className="input w-full pr-10"
              placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
            <button type="button" onClick={() => setShowPw(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm password</label>
          <input type={showPw ? "text" : "password"} className={`input w-full ${mismatch ? "border-red-500" : ""}`}
            placeholder="Repeat your password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          {mismatch && <p className="text-xs text-red-400 mt-1">Passwords don't match</p>}
        </div>

        {resetMutation.isError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl p-3 border border-red-700/50">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {(resetMutation.error as any)?.message ?? "Something went wrong. Please try again."}
          </div>
        )}

        <button type="submit" disabled={!canSubmit}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2">
          {resetMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Set New Password
        </button>
      </form>
    </>
  );
}

// ── Main component — routes between the two flows ─────────────────────────────

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");

  return (
    <CenteredCard>
      {token ? <SetNewPasswordForm token={token} /> : <ForgotPasswordForm />}
    </CenteredCard>
  );
}
