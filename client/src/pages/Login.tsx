import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Lock, Mail, Shield } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { WAFlowLogo } from '../components/WAFlowLogo';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [totpToken, setTotpToken]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [need2FA, setNeed2FA]         = useState(false);
  const [error, setError]             = useState('');

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => { window.location.href = '/'; },
    onError: (err) => {
      if (err.message === '2FA_REQUIRED') {
        setNeed2FA(true);
        setError('');
      } else if (err.message === 'EMAIL_NOT_VERIFIED') {
        // Redirect to verify page — they can resend from there
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        setError(err.message || 'Login failed. Check your credentials.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate({ email, password, totpToken: totpToken || undefined });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Global animations — full page background */}
      <style>{`
        @keyframes float-down {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.3; }
          50% { transform: translateY(20px) translateX(-10px); opacity: 0.6; }
        }
        @keyframes float-up {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.3; }
          50% { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
        }
        @keyframes pulse-ring {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 0.4; }
        }
        .animate-float-down { animation: float-down 4s ease-in-out infinite; }
        .animate-float-up { animation: float-up 4s ease-in-out infinite; }
        .animate-pulse-ring { animation: pulse-ring 3s ease-in-out infinite; }
      `}</style>

      {/* Full-page animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Message bubbles flowing */}
        <div className="animate-float-down absolute left-10 top-20 w-12 h-12 bg-[#25D366]/20 rounded-full border border-[#25D366]/40 flex items-center justify-center">
          <span className="text-xl">💬</span>
        </div>
        <div className="animate-float-up absolute right-1/3 top-1/4 w-12 h-12 bg-[#25D366]/20 rounded-full border border-[#25D366]/40 flex items-center justify-center" style={{ animationDelay: '1s' }}>
          <span className="text-xl">⚙️</span>
        </div>
        <div className="animate-float-down absolute left-1/4 bottom-1/3 w-12 h-12 bg-[#25D366]/20 rounded-full border border-[#25D366]/40 flex items-center justify-center" style={{ animationDelay: '2s' }}>
          <span className="text-xl">✅</span>
        </div>
        <div className="animate-float-up absolute right-10 bottom-20 w-12 h-12 bg-[#25D366]/20 rounded-full border border-[#25D366]/40 flex items-center justify-center" style={{ animationDelay: '1.5s' }}>
          <span className="text-xl">📊</span>
        </div>

        {/* Center pulse ring */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-32 h-32 border-2 border-[#25D366]/30 rounded-full animate-pulse-ring"></div>
          <div className="w-20 h-20 border-2 border-[#25D366]/40 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse-ring" style={{ animationDelay: '0.5s' }}></div>
        </div>

        {/* Flowing lines */}
        <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 400 600" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#25D366" stopOpacity="0" />
              <stop offset="50%" stopColor="#25D366" stopOpacity="1" />
              <stop offset="100%" stopColor="#25D366" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M 50 0 Q 100 150, 50 300" stroke="url(#lineGradient)" strokeWidth="2" fill="none" strokeDasharray="10,5">
            <animate attributeName="stroke-dashoffset" from="0" to="15" dur="2s" repeatCount="indefinite" />
          </path>
          <path d="M 350 0 Q 300 150, 350 300" stroke="url(#lineGradient)" strokeWidth="2" fill="none" strokeDasharray="10,5">
            <animate attributeName="stroke-dashoffset" from="0" to="15" dur="2s" repeatCount="indefinite" />
          </path>
          <path d="M 100 400 Q 200 450, 300 400" stroke="url(#lineGradient)" strokeWidth="2" fill="none" strokeDasharray="10,5">
            <animate attributeName="stroke-dashoffset" from="0" to="15" dur="2s" repeatCount="indefinite" />
          </path>
        </svg>
      </div>

      {/* Content wrapper — on top of animations */}
      <div className="relative z-10 min-h-screen flex">
        {/* Left panel content — visible on lg+ */}
        <div className="hidden lg:flex flex-col justify-between w-5/12 p-12">

        <div className="relative z-10">
          <Link to="/">
            <WAFlowLogo size="md" theme="dark" />
          </Link>
        </div>

        <div className="relative z-10">
          <p className="text-[#25D366] text-sm font-semibold uppercase tracking-wider mb-3">
            Automated Workflows
          </p>
          <h2 className="text-4xl font-extrabold text-white leading-tight mb-6">
            Watch automation <br />
            <span className="text-[#25D366]">work for you.</span>
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            From the moment a message arrives to the automatic response — WAFlow
            handles everything. Intelligent, instant, tireless.
          </p>
        </div>

        <div className="space-y-4 relative z-10">
          {[
            { icon: "💬", text: "Inbound message received" },
            { icon: "⚙️", text: "Instant AI processing" },
            { icon: "✅", text: "Perfect response sent" },
          ].map((f, idx) => (
            <div key={f.text} className="flex items-center gap-3 text-sm text-slate-300">
              <div className="w-8 h-8 rounded-full bg-[#25D366]/20 border border-[#25D366]/40 flex items-center justify-center text-base">
                {f.icon}
              </div>
              <span>{f.text}</span>
              {idx < 2 && <span className="text-[#25D366] ml-auto">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center mb-8">
            <WAFlowLogo size="md" theme="dark" />
          </div>

          <h1 className="text-3xl font-extrabold text-white mb-1">
            {need2FA ? 'Verify Your Identity' : 'Welcome back'}
          </h1>
          <p className="text-slate-300 mb-8">
            {need2FA
              ? 'Enter the 6-digit code from your authenticator app.'
              : <>Don't have an account? <Link to="/register" className="text-[#25D366] font-semibold hover:text-[#1fb855]">Start free</Link></>
            }
          </p>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!need2FA ? (
              <>
                {/* Email */}
                <div>
                  <label className="block text-sm text-slate-300 font-medium mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#25D366]" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@yourbusiness.com"
                      className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 focus:border-[#25D366] transition shadow-sm"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-slate-300 font-medium">Password</label>
                    <Link to="/forgot-password" className="text-xs text-[#25D366] font-medium hover:text-[#1fb855]">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#25D366]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 focus:border-[#25D366] transition shadow-sm"
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
              </>
            ) : (
              /* 2FA code input */
              <div>
                <label className="block text-sm text-slate-300 font-medium mb-2">Authenticator Code</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#25D366]" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    maxLength={7}
                    autoFocus
                    value={totpToken}
                    onChange={e => setTotpToken(e.target.value.replace(/\D/g, ''))}
                    placeholder="000 000"
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg pl-10 pr-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 focus:border-[#25D366] transition text-center shadow-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setNeed2FA(false); setTotpToken(''); }}
                  className="mt-3 text-xs text-[#25D366] hover:text-[#1fb855] font-medium transition"
                >
                  ← Back to login
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#25D366] to-[#1fb855] hover:shadow-lg hover:shadow-green-500/30 text-white font-bold py-3.5 rounded-lg text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-6"
            >
              {loginMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <>{need2FA ? 'Verify' : 'Sign In'} <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-8 pt-6 border-t border-slate-700 flex justify-between text-xs text-slate-400">
            <Link to="/terms" className="hover:text-[#25D366] font-medium transition">Terms</Link>
            <Link to="/privacy" className="hover:text-[#25D366] font-medium transition">Privacy</Link>
            <a href="mailto:hello@waflow.co.za" className="hover:text-[#25D366] font-medium transition">Support</a>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
