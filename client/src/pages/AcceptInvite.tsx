import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Zap, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";

// ── Password strength helper ──────────────────────────────────────────────────

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong", "Very strong"];
  const colors = ["", "text-red-400", "text-orange-400", "text-yellow-400", "text-green-400", "text-emerald-400"];
  return { score, label: labels[score] ?? "", color: colors[score] ?? "" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const { data: tokenData, isLoading: validating } = trpc.license.validateInviteToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const acceptMutation = trpc.license.acceptInvite.useMutation({
    onSuccess: () => {
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    },
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [done, setDone]         = useState(false);

  const strength = passwordStrength(password);
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && !acceptMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await acceptMutation.mutateAsync({ token, password });
    setDone(true);
  };

  // ── No token in URL ──
  if (!token) {
    return (
      <CenteredCard>
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Invalid Link</h2>
        <p className="text-gray-400 text-sm">This invite link is missing its token. Please ask your admin to resend the invite.</p>
      </CenteredCard>
    );
  }

  // ── Validating token ──
  if (validating) {
    return (
      <CenteredCard>
        <Loader2 className="w-8 h-8 text-[#25D366] animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Validating your invite link…</p>
      </CenteredCard>
    );
  }

  // ── Invalid / expired token ──
  if (!tokenData?.valid) {
    const msgs: Record<string, string> = {
      expired:          "This invite link has expired. Please ask your admin to resend the invite.",
      already_accepted: "This invite has already been accepted. Head to the login page to sign in.",
      invalid_token:    "This invite link is not valid. It may have been used already or the URL is incorrect.",
    };
    return (
      <CenteredCard>
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">
          {tokenData?.reason === "already_accepted" ? "Already Accepted" : "Invalid Link"}
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          {msgs[tokenData?.reason ?? "invalid_token"] ?? "Something went wrong."}
        </p>
        {tokenData?.reason === "already_accepted" && (
          <button onClick={() => navigate("/login")} className="btn-primary px-6">
            Go to Login
          </button>
        )}
      </CenteredCard>
    );
  }

  // ── Success state ──
  if (done) {
    return (
      <CenteredCard>
        <CheckCircle2 className="w-14 h-14 text-[#25D366] mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Password Set!</h2>
        <p className="text-gray-400 text-sm mb-2">
          Welcome, <strong className="text-white">{tokenData.name}</strong>! Your account is ready.
        </p>
        <p className="text-gray-500 text-xs">Redirecting to login…</p>
      </CenteredCard>
    );
  }

  // ── Set password form ──
  return (
    <CenteredCard>
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#25D366]/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Lock className="w-7 h-7 text-[#25D366]" />
        </div>
        <h2 className="text-xl font-bold text-white">Set Your Password</h2>
        <p className="text-gray-400 text-sm mt-1">
          Welcome, <strong className="text-white">{tokenData.name}</strong>!<br />
          You're signing in as <span className="text-[#25D366]">{tokenData.email}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Choose a password <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              className="input w-full pr-10"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPw(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Strength bar */}
          {password.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= strength.score ? "bg-[#25D366]" : "bg-gray-700"
                  }`} />
                ))}
              </div>
              <p className={`text-xs ${strength.color}`}>{strength.label}</p>
            </div>
          )}
        </div>

        {/* Confirm */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirm password</label>
          <input
            type={showPw ? "text" : "password"}
            className={`input w-full ${mismatch ? "border-red-500" : ""}`}
            placeholder="Repeat your password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
          {mismatch && <p className="text-xs text-red-400 mt-1">Passwords don't match</p>}
        </div>

        {/* Requirements checklist */}
        <div className="bg-gray-800/50 rounded-xl p-3 text-xs space-y-1">
          {[
            { ok: password.length >= 8,      label: "At least 8 characters" },
            { ok: /[A-Z]/.test(password),    label: "One uppercase letter (recommended)" },
            { ok: /[0-9]/.test(password),    label: "One number (recommended)" },
          ].map(({ ok, label }) => (
            <div key={label} className={`flex items-center gap-2 ${ok ? "text-green-400" : "text-gray-500"}`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${ok ? "text-green-400" : "text-gray-600"}`} />
              {label}
            </div>
          ))}
        </div>

        {/* Error */}
        {acceptMutation.isError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl p-3 border border-red-700/50">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {(acceptMutation.error as any)?.message ?? "Something went wrong. Please try again."}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          {acceptMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting password…</>
            : "Set Password & Activate Account"
          }
        </button>
      </form>
    </CenteredCard>
  );
}

// ── Layout wrapper ─────────────────────────────────────────────────────────────

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-[#25D366] rounded-xl flex items-center justify-center">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <span className="text-white font-bold text-xl">WAFlow</span>
      </div>
      <div className="w-full max-w-md bg-gray-900 rounded-2xl border border-gray-800 p-7 shadow-2xl text-center">
        {children}
      </div>
    </div>
  );
}
