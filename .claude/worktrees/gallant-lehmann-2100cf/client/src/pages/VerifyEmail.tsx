import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { MessageSquare, Mail, RefreshCw, ArrowRight, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { trpc } from "../lib/trpc";

const OTP_LENGTH    = 6;
const EXPIRY_SECS   = 10 * 60; // 10 minutes, matches server
const RESEND_COOLDOWN_SECS = 60; // local UI cooldown between resend clicks

export default function VerifyEmail() {
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const email       = params.get("email") ?? "";

  // OTP digit state — array of single chars
  const [digits, setDigits]     = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);
  const [timeLeft, setTimeLeft] = useState(EXPIRY_SECS);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMsg, setResendMsg] = useState("");

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  // ── Resend cooldown timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ── tRPC mutations ────────────────────────────────────────────────────────
  const verifyMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/onboarding"; // full reload so auth context refreshes
      }, 1500);
    },
    onError: (err) => {
      const msg = err.message ?? "";
      if (msg === "EXPIRED") {
        setError("This code has expired. Request a new one below.");
      } else if (msg === "LOCKED") {
        setError("Too many wrong attempts. Please request a new code.");
      } else if (msg.startsWith("INVALID:")) {
        const left = parseInt(msg.split(":")[1], 10);
        setError(left > 0
          ? `Incorrect code — ${left} attempt${left !== 1 ? "s" : ""} remaining.`
          : "Too many wrong attempts. Please request a new code.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      // Clear digits on error so user can re-type
      setDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    },
  });

  const resendMutation = trpc.auth.resendVerificationCode.useMutation({
    onSuccess: () => {
      setResendMsg("A new code has been sent to your inbox.");
      setResendCooldown(RESEND_COOLDOWN_SECS);
      setTimeLeft(EXPIRY_SECS);
      setDigits(Array(OTP_LENGTH).fill(""));
      setError("");
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    },
    onError: (err) => {
      const msg = err.message ?? "";
      if (msg.startsWith("RESEND_LIMIT:")) {
        const mins = msg.split(":")[1];
        setResendMsg(`Too many resend requests. Try again in ${mins} minute${Number(mins) !== 1 ? "s" : ""}.`);
      } else {
        setResendMsg("Couldn't resend the code. Please try again.");
      }
    },
  });

  // ── Submit OTP ────────────────────────────────────────────────────────────
  const submitCode = useCallback((code: string) => {
    if (code.length !== OTP_LENGTH || !email) return;
    setError("");
    verifyMutation.mutate({ email, code });
  }, [email, verifyMutation]);

  // Auto-submit once all 6 digits are filled
  useEffect(() => {
    const code = digits.join("");
    if (code.length === OTP_LENGTH && code.match(/^\d{6}$/)) {
      submitCode(code);
    }
  }, [digits, submitCode]);

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleChange = (idx: number, value: string) => {
    // Allow pasting full 6-digit code into first box
    if (value.length === OTP_LENGTH && idx === 0) {
      const cleaned = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
      if (cleaned.length === OTP_LENGTH) {
        setDigits(cleaned.split(""));
        inputRefs.current[OTP_LENGTH - 1]?.focus();
        return;
      }
    }
    const digit = value.replace(/\D/g, "").slice(-1);
    const next  = [...digits];
    next[idx]   = digit;
    setDigits(next);
    if (digit && idx < OTP_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < OTP_LENGTH - 1) inputRefs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (pasted.length === OTP_LENGTH) {
      setDigits(pasted.split(""));
      inputRefs.current[OTP_LENGTH - 1]?.focus();
    }
  };

  // ── Redirect guard ────────────────────────────────────────────────────────
  if (!email) {
    return (
      <div className="min-h-screen bg-[#080817] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No email address provided.</p>
          <Link to="/register" className="text-[#25D366] hover:underline">Go back to sign up</Link>
        </div>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-[#080817] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-[#25D366]/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-[#25D366]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Email verified!</h2>
          <p className="text-gray-400 text-sm">Your 14-day trial has started. Taking you to setup…</p>
          <div className="mt-4 w-8 h-8 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  const expired      = timeLeft === 0;
  const code         = digits.join("");
  const isSubmitting = verifyMutation.isPending;
  const isResending  = resendMutation.isPending;

  return (
    <div className="min-h-screen bg-[#080817] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-10 h-10 bg-[#25D366] rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-xl">WAFlow</span>
        </div>

        {/* Card */}
        <div className="bg-[#131320] border border-white/[0.07] rounded-2xl p-8 shadow-2xl">

          {/* Icon + heading */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#25D366]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-[#25D366]" />
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-2">Check your inbox</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              We sent a 6-digit code to<br />
              <span className="text-white font-medium">{email}</span>
            </p>
          </div>

          {/* OTP input boxes */}
          <div className="flex gap-3 justify-center mb-2" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={idx === 0 ? OTP_LENGTH : 1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={isSubmitting || expired}
                className={`w-12 h-14 text-center text-xl font-bold rounded-xl border-2 bg-white/[0.04] text-white transition-all outline-none
                  ${error
                    ? "border-red-500 bg-red-500/5"
                    : digit
                    ? "border-[#25D366] bg-[#25D366]/5"
                    : "border-white/10 focus:border-[#25D366]/60"
                  }
                  disabled:opacity-40 disabled:cursor-not-allowed`}
                autoFocus={idx === 0}
              />
            ))}
          </div>

          {/* Countdown timer */}
          <div className={`flex items-center justify-center gap-1.5 text-xs mb-5 ${
            expired ? "text-red-400" : timeLeft <= 60 ? "text-yellow-400" : "text-gray-500"
          }`}>
            <Clock className="w-3 h-3" />
            {expired ? "Code expired — request a new one" : `Code expires in ${formatTime(timeLeft)}`}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-900/20 border border-red-500/25 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Resend feedback */}
          {resendMsg && !error && (
            <div className="flex items-start gap-2.5 bg-[#25D366]/10 border border-[#25D366]/20 rounded-xl px-4 py-3 mb-4 text-sm text-[#25D366]">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {resendMsg}
            </div>
          )}

          {/* Submit button — only shows when not auto-submitting */}
          {!isSubmitting && code.length === OTP_LENGTH && !expired && (
            <button
              onClick={() => submitCode(code)}
              className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-black font-bold py-3.5 rounded-xl text-base transition mb-4 shadow-lg shadow-green-500/20"
            >
              Verify Email <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {/* Submitting spinner */}
          {isSubmitting && (
            <div className="flex items-center justify-center gap-2 py-3 mb-4 text-[#25D366] text-sm">
              <div className="w-4 h-4 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
              Verifying…
            </div>
          )}

          {/* Resend section */}
          <div className="border-t border-white/[0.06] pt-5 text-center">
            <p className="text-gray-500 text-sm mb-3">Didn't receive a code?</p>
            <button
              onClick={() => {
                setResendMsg("");
                setError("");
                resendMutation.mutate({ email });
              }}
              disabled={isResending || resendCooldown > 0}
              className="inline-flex items-center gap-2 text-sm text-[#25D366] hover:text-[#1fb855] transition disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResending ? "animate-spin" : ""}`} />
              {isResending
                ? "Sending…"
                : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend code"}
            </button>
            <p className="text-gray-600 text-xs mt-2">Max 3 resends per hour</p>
          </div>
        </div>

        {/* Back to register */}
        <p className="text-center text-gray-600 text-sm mt-6">
          Wrong email?{" "}
          <Link to="/register" className="text-[#25D366] hover:underline">
            Go back and sign up again
          </Link>
        </p>
      </div>
    </div>
  );
}
